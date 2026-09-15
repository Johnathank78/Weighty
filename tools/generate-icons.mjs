// Derives square PWA icons from the canonical mascot asset.
// The mascot artwork itself is not redrawn or altered: it is only scaled
// and centered on the Wheighty background color.
// Usage: node tools/generate-icons.mjs
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

// Web derivative of the canonical asset: same artwork, transparent margins already normalised (tools/prepare-mascots.mjs).
const SOURCE = 'assets/web/mascot-normal.png';
const OUT_DIR = 'public/icons';
const BACKGROUND = { r: 0xf8, g: 0xf5, b: 0xf1, alpha: 1 };

async function icon(size, contentRatio, file) {
  const inner = Math.round(size * contentRatio);
  const mascot = await sharp(SOURCE)
    .resize({ width: inner, height: inner, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: BACKGROUND } })
    .composite([{ input: mascot, gravity: 'center' }])
    .png()
    .toFile(`${OUT_DIR}/${file}`);
}

await mkdir(OUT_DIR, { recursive: true });
await icon(192, 0.78, 'icon-192.png');
await icon(512, 0.78, 'icon-512.png');
// Maskable icons must keep content inside the central 80% safe zone.
await icon(512, 0.6, 'icon-maskable-512.png');
await icon(180, 0.78, 'apple-touch-icon.png');
await icon(64, 0.9, '../favicon.png');
console.log('icons generated');
