/**
 * Camera barcode reading (IMPLEMENTATION_NOTES J-05): native BarcodeDetector only. No WASM detection
 * fallback and no OCR are bundled (measured cost, see J-05); where the native API is missing, the
 * keyboard entry of the code stays available. The camera is requested when the user opens the scanner,
 * never before, and released as soon as a code is read or the panel closes.
 */
import { useEffect, useRef, useState } from 'react';
import { normalizeBarcode } from '@/adapters/openFoodFacts';

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
      if (formats.length === 0) {
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
      const Detector = (globalThis as ScannerEnvironment).BarcodeDetector as DetectorConstructor;
      const detector = new Detector({ formats });
      setState('scanning');
      const tick = async () => {
        if (cancelled) return;
        try {
          const code = video.readyState >= 2 ? pickBarcode(await detector.detect(video)) : null;
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
