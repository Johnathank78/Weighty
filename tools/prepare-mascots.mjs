// Derives the web mascot images from the canonical artwork in assets/.
// The artwork is never redrawn: each file is only trimmed, scaled and placed on a common transparent
// frame so that every variant shows the character's body at the same size and position (the source
// files use different canvases and margins), then downsized for the bundle and the PWA precache.
// Usage: node tools/prepare-mascots.mjs
import sharp from 'sharp';
import { mkdir, readdir } from 'node:fs/promises';

const SOURCE_DIR = 'assets';
const OUT_DIR = 'assets/web';
/** Output width in pixels: the largest mascot is displayed at 150 CSS px, 3x on dense screens. */
const OUT_WIDTH = 480;
/** Reference body (the key-shaped base), in the coordinates of the 1254 px square sources. */
const REF_BODY = { centerX: 626.5, width: 853, bottom: 1054 };
/** Reference artwork height (eyebrows to base) of the square sources without sparks. */
const REF_HEIGHT = 775;
/**
 * Files whose base has a different shape (wider and flatter) are matched on the artwork height instead of the base
 * width, so the face keeps the same size as in the other variants.
 */
const MATCH_ON_HEIGHT = new Set(['mascot-search.png']);
/** Common frame in reference coordinates: centred on the body, wide enough for the sparks of "surpris" and "celebrate". */
const FRAME = { left: 114, top: 177, width: 1026, height: 886 };
/** Alpha above which a pixel belongs to the artwork. */
const ALPHA_MIN = 40;

async function bounds(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const all = { left: w, top: h, right: 0, bottom: 0 };
  // The body is the only artwork in the lower third of every source.
  const body = { left: w, right: 0, bottom: 0 };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] <= ALPHA_MIN) continue;
      all.left = Math.min(all.left, x);
      all.right = Math.max(all.right, x);
      all.top = Math.min(all.top, y);
      all.bottom = Math.max(all.bottom, y);
      if (y >= h * 0.66) {
        body.left = Math.min(body.left, x);
        body.right = Math.max(body.right, x);
        body.bottom = Math.max(body.bottom, y);
      }
    }
  }
  return { all, body };
}

async function prepare(name) {
  const file = `${SOURCE_DIR}/${name}`;
  const { all, body } = await bounds(file);
  const outScale = OUT_WIDTH / FRAME.width;
  // Scale that gives this file's body the reference body width, then to the output size.
  const referenceRatio = MATCH_ON_HEIGHT.has(name) ? REF_HEIGHT / (body.bottom - all.top + 1) : REF_BODY.width / (body.right - body.left + 1);
  const scale = referenceRatio * outScale;
  const cropWidth = all.right - all.left + 1;
  const cropHeight = all.bottom - all.top + 1;
  const art = await sharp(file)
    .extract({ left: all.left, top: all.top, width: cropWidth, height: cropHeight })
    .resize({ width: Math.round(cropWidth * scale), height: Math.round(cropHeight * scale), kernel: 'lanczos3' })
    .png()
    .toBuffer();
  const bodyCenter = (body.left + body.right) / 2;
  const left = Math.round((REF_BODY.centerX - FRAME.left) * outScale + (all.left - bodyCenter) * scale);
  const top = Math.round((REF_BODY.bottom - FRAME.top) * outScale + (all.top - body.bottom) * scale);
  const outHeight = Math.round(FRAME.height * outScale);
  await sharp({ create: { width: OUT_WIDTH, height: outHeight, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: art, left, top }])
    .png({ compressionLevel: 9, palette: true, quality: 90, effort: 10 })
    .toFile(`${OUT_DIR}/${name}`);
  return { name, left, top };
}

await mkdir(OUT_DIR, { recursive: true });
const files = (await readdir(SOURCE_DIR)).filter((f) => /^mascot-[a-z]+\.png$/.test(f));
for (const f of files) console.log(await prepare(f));
