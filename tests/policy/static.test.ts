/** Static policy checks (instruct/06 section 17, 07 sections 11 to 14). */
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const EM_DASH = String.fromCharCode(0x2014);

function walk(dir: string, filter: (f: string) => boolean): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p, filter) : filter(p) ? [p] : [];
  });
}

const SOURCE_FILES = walk('src', (f) => /\.(ts|tsx|css|html|json)$/.test(f));
const UI_FILES = [...SOURCE_FILES, 'index.html', 'vite.config.ts'];
const read = (f: string) => readFileSync(f, 'utf8');

describe('visible text policy', () => {
  it('no U+2014 em dash anywhere in application source, entry HTML or PWA manifest config', () => {
    const offenders = UI_FILES.filter((f) => read(f).includes(EM_DASH));
    expect(offenders).toEqual([]);
  });

  it('no U+2014 in the production build output when present', () => {
    const built = walk('dist', (f) => /\.(js|css|html|webmanifest)$/.test(f));
    // React and other dependencies may contain the character in non-visible code paths; only
    // our own strings are checked through the source scan above. The manifest and HTML must be clean.
    const visible = built.filter((f) => /\.(html|webmanifest)$/.test(f));
    expect(visible.filter((f) => read(f).includes(EM_DASH))).toEqual([]);
  });
});

describe('no network dependency at runtime', () => {
  const code = SOURCE_FILES.filter((f) => /\.(ts|tsx)$/.test(f)).map((f) => [f, read(f)] as const);

  it('no fetch, XHR, WebSocket, EventSource or beacon calls in application code', () => {
    const forbidden = /\bfetch\s*\(|XMLHttpRequest|new\s+WebSocket|EventSource|sendBeacon/;
    expect(code.filter(([, src]) => forbidden.test(src)).map(([f]) => f)).toEqual([]);
  });

  it('no remote URLs (CDN, Google Fonts, analytics) in source, CSS or entry HTML', () => {
    const remote = /https?:\/\/(?!localhost)[a-z0-9.-]+\.[a-z]{2,}/i;
    const allowedDocs = /\/\*\*[\s\S]*?\*\//g;
    const offenders = UI_FILES.filter((f) => remote.test(read(f).replace(allowedDocs, '')));
    expect(offenders).toEqual([]);
  });

  it('fonts are bundled locally', () => {
    const css = read('src/styles/tokens.css');
    expect(css).toMatch(/@fontsource-variable\/inter\/files\/inter-latin-wght-normal\.woff2/);
    expect(css).not.toMatch(/fonts\.googleapis|fonts\.gstatic/);
  });

  it('no cloud persistence or health platform integration', () => {
    const forbidden = /firebase|supabase|amplify|healthkit|google\s*fit|googlefit|health\s*connect|garmin|indexedDB\.open\([^)]*remote/i;
    expect(code.filter(([, src]) => forbidden.test(src)).map(([f]) => f)).toEqual([]);
  });
});

describe('architecture boundaries (UI never computes science)', () => {
  const uiFiles = walk('src', (f) => /\.(tsx)$/.test(f) || /[\\/](screens|components|app|hooks|store)[\\/]/.test(f)).filter((f) => /\.(ts|tsx)$/.test(f));
  const ALLOWED_SCIENCE_IMPORTS = new Set(['@/science/types', '@/science/constants', '@/science/dates']);

  it('UI layers only import science types, constants and date helpers', () => {
    const offenders: string[] = [];
    for (const f of uiFiles) {
      for (const m of read(f).matchAll(/from '(@\/science\/[^']+)'/g)) {
        if (!ALLOWED_SCIENCE_IMPORTS.has(m[1] as string)) offenders.push(`${f}: ${m[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the calibration worker only runs the domain engine: no React, storage or network (P-01)', () => {
    const worker = read('src/store/calibration.worker.ts');
    const imports = [...worker.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
    expect(imports.every((m) => m === '@/domain/engine' || m === './calibrationClient')).toBe(true);
    expect(worker).not.toMatch(/localStorage|indexedDB|fetch\s*\(|XMLHttpRequest|importScripts/);
    expect(read('src/store/StoreProvider.tsx')).not.toMatch(/computeCalibrationState/);
  });

  it('science modules do not import React, the DOM or persistence', () => {
    const science = walk('src/science', (f) => /\.ts$/.test(f));
    const offenders = science.filter((f) => /from 'react|localStorage|document\.|window\.|@\/persistence|@\/store|@\/app/.test(read(f)));
    expect(offenders).toEqual([]);
  });
});

describe('PWA and GitHub Pages configuration', () => {
  const vite = read('vite.config.ts');
  const html = read('index.html');

  it('uses a relative base and relative manifest scope', () => {
    expect(vite).toMatch(/process\.env\.WHEIGHTY_BASE \?\? '\.\/'/);
    expect(vite).toMatch(/start_url: '\.\/'/);
    expect(vite).toMatch(/scope: '\.\/'/);
  });

  it('entry HTML never references root-absolute assets', () => {
    expect(html).not.toMatch(/(src|href)="\/(?!\/)/);
  });

  it('declares installable icons that exist', () => {
    for (const icon of ['public/icons/icon-192.png', 'public/icons/icon-512.png', 'public/icons/icon-maskable-512.png', 'public/icons/apple-touch-icon.png', 'public/favicon.png']) {
      expect(existsSync(icon), icon).toBe(true);
    }
  });

  it('uses the mascot images derived from the canonical assets/ files', () => {
    const mascot = read('src/components/Mascot.tsx');
    const names = ['normal', 'heureux', 'search', 'surpris', 'clin', 'sleepy', 'empty', 'celebrate'];
    for (const name of names) {
      expect(mascot).toContain(`../../assets/web/mascot-${name}.png`);
      expect(existsSync(`assets/mascot-${name}.png`), `source ${name}`).toBe(true);
      expect(existsSync(`assets/web/mascot-${name}.png`), `web ${name}`).toBe(true);
    }
  });
});
