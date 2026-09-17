/**
 * Camera barcode reading (IMPLEMENTATION_NOTES J-05, J-10): the native BarcodeDetector when the platform has
 * one, otherwise the lightweight bundled reader (src/vision/eanDecoder, a few kB) on canvas frames. No WASM
 * detector and no OCR engine are bundled. The keyboard entry of the code stays available in every case. The
 * camera is requested when the user opens the scanner, never before, and released as soon as a code is read
 * or the panel closes.
 */
import { useEffect, useRef, useState } from 'react';
import { normalizeBarcode } from '@/adapters/openFoodFacts';
import { decodeFrame } from '@/vision/eanDecoder';

type DetectedBarcode = { rawValue: string; format?: string };
type DetectorInstance = { detect: (source: HTMLVideoElement) => Promise<DetectedBarcode[]> };
type DetectorConstructor = {
  new (options?: { formats: string[] }): DetectorInstance;
  getSupportedFormats?: () => Promise<string[]>;
};

/** Retail formats carried by food packaging. */
export const RETAIL_BARCODE_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'] as const;
const SCAN_INTERVAL_MS = 250;

export type ScannerState = 'idle' | 'starting' | 'scanning' | 'unsupported' | 'denied' | 'error';

type ScannerEnvironment = { BarcodeDetector?: unknown; navigator?: { mediaDevices?: { getUserMedia?: unknown } } };

/** Retail formats the native detector can read here; empty when camera reading is not possible. */
export async function nativeRetailFormats(env: ScannerEnvironment = globalThis as ScannerEnvironment): Promise<string[]> {
  const Detector = env.BarcodeDetector as DetectorConstructor | undefined;
  if (typeof Detector !== 'function' || typeof env.navigator?.mediaDevices?.getUserMedia !== 'function') return [];
  try {
    const supported = Detector.getSupportedFormats ? await Detector.getSupportedFormats() : [...RETAIL_BARCODE_FORMATS];
    return RETAIL_BARCODE_FORMATS.filter((f) => supported.includes(f));
  } catch {
    return [];
  }
}

/** First detected value that is a valid retail barcode. */
export function pickBarcode(results: readonly DetectedBarcode[]): string | null {
  for (const r of results) {
    const code = normalizeBarcode(r.rawValue ?? '');
    if (code) return code;
  }
  return null;
}

type FrameReader = (video: HTMLVideoElement) => Promise<string | null>;

function nativeReader(formats: string[]): FrameReader {
  const Detector = (globalThis as ScannerEnvironment).BarcodeDetector as DetectorConstructor;
  const detector = new Detector({ formats });
  return async (video) => pickBarcode(await detector.detect(video));
}

/** Frames are scaled to this width before decoding: enough pixels per module at arm's length, 0.1 ms per frame. */
const LIGHT_READER_WIDTH = 640;

function lightReader(): FrameReader {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });
  return async (video) => {
    if (!context || video.videoWidth === 0) return null;
    const scale = Math.min(1, LIGHT_READER_WIDTH / video.videoWidth);
    const width = Math.round(video.videoWidth * scale);
    const height = Math.round(video.videoHeight * scale);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    context.drawImage(video, 0, 0, width, height);
    return normalizeBarcode(decodeFrame(context.getImageData(0, 0, width, height).data, width, height) ?? '');
  };
}

export function useBarcodeScanner(active: boolean, onDetected: (barcode: string) => void) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<ScannerState>('idle');
  const onDetectedRef = useRef(onDetected);
  onDetectedRef.current = onDetected;

  useEffect(() => {
    if (!active) {
      setState('idle');
      return;
    }
    let cancelled = false;
    let stream: MediaStream | null = null;
    let timer: number | null = null;
    const stop = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
      stream?.getTracks().forEach((t) => t.stop());
      stream = null;
    };

    void (async () => {
      setState('starting');
      const formats = await nativeRetailFormats();
      if (cancelled) return;
      // Without the native detector, the lightweight reader decodes the frames itself (J-10).
      if (typeof navigator === 'undefined' || typeof navigator.mediaDevices?.getUserMedia !== 'function') {
        setState('unsupported');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      } catch (error) {
        if (!cancelled) setState(error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'SecurityError') ? 'denied' : 'error');
        return;
      }
      const video = videoRef.current;
      if (cancelled || !video) {
        stop();
        return;
      }
      video.srcObject = stream;
      try {
        await video.play();
      } catch {
        /* autoplay of a muted inline video may resolve late; detection still runs */
      }
      const read = formats.length > 0 ? nativeReader(formats) : lightReader();
      setState('scanning');
      const tick = async () => {
        if (cancelled) return;
        try {
          const code = video.readyState >= 2 ? await read(video) : null;
          if (code && !cancelled) {
            stop();
            onDetectedRef.current(code);
            return;
          }
        } catch {
          /* a frame that cannot be read is skipped */
        }
        timer = window.setTimeout(() => void tick(), SCAN_INTERVAL_MS);
      };
      void tick();
    })();

    return () => {
      cancelled = true;
      stop();
    };
  }, [active]);

  return { videoRef, state };
}
