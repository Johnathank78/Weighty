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

/**
 * The single module allowed to reach the network (IMPLEMENTATION_NOTES J-03): the opt-in Open Food Facts
 * adapter. Every other file, including science/, domain/, store/, persistence/ and all UI, stays network free.
 */
const NETWORK_ADAPTER = join('src', 'adapters', 'openFoodFacts.ts');
const NETWORK_CALL = /\bfetch\s*\(|XMLHttpRequest|new\s+WebSocket|EventSource|sendBeacon|navigator\.connection|importScripts/;
const REMOTE_URL = /https?:\/\/(?!localhost)[a-z0-9.-]+\.[a-z]{2,}/i;
const DOC_COMMENTS = /\/\*\*[\s\S]*?\*\//g;
const networkOffenders = (files: ReadonlyArray<readonly [string, string]>) => files.filter(([f, src]) => f !== NETWORK_ADAPTER && NETWORK_CALL.test(src)).map(([f]) => f);

describe('no network dependency at runtime', () => {
  const code = SOURCE_FILES.filter((f) => /\.(ts|tsx)$/.test(f)).map((f) => [f, read(f)] as const);

  it('no fetch, XHR, WebSocket, EventSource or beacon calls in application code outside the named adapter', () => {
    expect(networkOffenders(code)).toEqual([]);
  });

  it('the network exception is exactly one existing file, and it is the only one using the network', () => {
    const users = code.filter(([, src]) => NETWORK_CALL.test(src)).map(([f]) => f);
    expect(users).toEqual([NETWORK_ADAPTER]);
    expect(readdirSync(join('src', 'adapters'))).toEqual(['openFoodFacts.ts']);
  });

  it('the restriction is effective: a fetch in science, domain, store, persistence or UI would be caught', () => {
    const probes = ['const r = await fetch(url);', 'globalThis.fetch(input, init)', 'window.fetch (u)', 'new XMLHttpRequest()', 'navigator.sendBeacon(u, b)', 'new WebSocket(u)'];
    for (const dir of ['science', 'domain', 'store', 'persistence', 'components', 'screens', 'app', 'hooks', 'adapters']) {
      const f = join('src', dir, 'probe.ts');
      const fake = probes.map((p, i) => [`${f}#${i}`, p] as const);
      expect(networkOffenders(fake), f).toHaveLength(probes.length);
    }
    // A second adapter file, even next to the allowed one, is not allowed either.
    expect(networkOffenders([[join('src', 'adapters', 'other.ts'), 'fetch(u)']])).toHaveLength(1);
    expect(networkOffenders([[NETWORK_ADAPTER, 'fetch(u)']])).toEqual([]);
  });

  it('no remote URLs (CDN, Google Fonts, analytics) in source, CSS or entry HTML outside the named adapter', () => {
    const offenders = UI_FILES.filter((f) => f !== NETWORK_ADAPTER && REMOTE_URL.test(read(f).replace(DOC_COMMENTS, '')));
    expect(offenders).toEqual([]);
  });

  it('the adapter reaches Open Food Facts only, and never reads the store, storage or profile', () => {
    const src = read(NETWORK_ADAPTER);
    const hosts = [...src.replace(DOC_COMMENTS, '').matchAll(/https?:\/\/([a-z0-9.-]+)/gi)].map((m) => m[1]);
    expect(new Set(hosts)).toEqual(new Set(['world.openfoodfacts.org', 'github.com']));
    // github.com only appears inside the identification string, never as a request target.
    expect(src).toMatch(/OFF_APP_ID = 'Wheighty\/[^']*\(https:\/\/github\.com\/[^']*\)'/);
    const imports = [...src.matchAll(/^import (type )?.* from '([^']+)'/gm)].map((m) => [m[1] ?? '', m[2]]);
    expect(imports.every(([type]) => type === 'type ')).toBe(true);
    expect(src).not.toMatch(/localStorage|indexedDB|document\.cookie|@\/store|@\/persistence|useWheighty|profile|weightKg/);
    expect(src).toMatch(/credentials: 'omit'/);
    expect(src).toMatch(/referrerPolicy: 'no-referrer'/);
  });

  it('only the product search hook and the journal screen use the adapter', () => {
    const users = code.filter(([f, src]) => f !== NETWORK_ADAPTER && /from '@\/adapters\/openFoodFacts'/.test(src)).map(([f]) => f.replace(/\\/g, '/'));
    // Value imports are limited to the hook (client) and the journal screen (pure mapping helper); others are type imports.
    const valueUsers = code.filter(([, src]) => /^import \{[^}]*\} from '@\/adapters\/openFoodFacts'/m.test(src)).map(([f]) => f.replace(/\\/g, '/'));
    // useBarcodeScanner only reuses the pure barcode normalisation helper.
    expect(valueUsers.sort()).toEqual(['src/hooks/useBarcodeScanner.ts', 'src/hooks/useOpenFoodFacts.ts', 'src/screens/Journal.tsx']);
    expect(read('src/hooks/useBarcodeScanner.ts')).not.toMatch(/createOpenFoodFactsClient|lookupBarcode|searchProducts/);
    expect(users.every((f) => /^src\/(hooks|screens|persistence)\//.test(f))).toBe(true);
    expect(read('src/screens/Journal.tsx')).not.toMatch(/createOpenFoodFactsClient/);
  });

  it('the service worker never caches third-party responses', () => {
    const vite = read('vite.config.ts');
    expect(vite).toMatch(/runtimeCaching: \[\]/);
    expect(vite).toMatch(/globPatterns: \['\*\*\/\*\.\{js,css,html,png,svg,woff2,webmanifest\}'\]/);
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

  it('the production build precaches every script, including the lazily loaded Ciqual table, when present', () => {
    if (!existsSync('dist/sw.js')) return;
    const sw = read('dist/sw.js');
    const scripts = walk(join('dist', 'assets'), (f) => /\.js$/.test(f)).map((f) => f.replace(/\\/g, '/').replace(/^dist\//, ''));
    expect(scripts.filter((s) => !sw.includes(s))).toEqual([]);
    const ciqualChunk = scripts.find((s) => /\/ciqual-[\w-]+\.js$/.test(s));
    expect(ciqualChunk).toBeDefined();
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
