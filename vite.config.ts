import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { execSync } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';

/**
 * Build of the code in service (report 49, point 1a): short commit (with "+" when the tree has uncommitted changes) and
 * date, read in the export and in the activity log. 'unknown' outside a git checkout.
 */
function buildInfo(): { commit: string; date: string } {
  const date = new Date().toISOString();
  try {
    const commit = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    const dirty = execSync('git status --porcelain --untracked-files=no', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() !== '';
    return { commit: dirty ? `${commit}+` : commit, date };
  } catch {
    return { commit: 'unknown', date };
  }
}

/**
 * GitHub Pages serves the app under https://<user>.github.io/<repo>/.
 * A relative base keeps every asset, the manifest and the service worker
 * scoped to whatever sub-path the site is served from. WHEIGHTY_BASE can
 * force an absolute base (e.g. "/wheighty/") if ever needed.
 */
const base = process.env.WHEIGHTY_BASE ?? './';

export default defineConfig({
  base,
  define: {
    __WHEIGHTY_BUILD__: JSON.stringify(buildInfo()),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icons/*.png', 'favicon.png'],
      manifest: {
        id: './',
        name: 'Wheighty',
        short_name: 'Wheighty',
        description: 'Ton besoin calorique, ajusté à ton corps.',
        lang: 'fr',
        dir: 'ltr',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#F8F5F1',
        theme_color: '#F8F5F1',
        categories: ['health', 'lifestyle'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2,webmanifest}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        // No runtime caching of third-party origins: the app never calls the network.
        runtimeCaching: [],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  build: {
    target: 'es2022',
    sourcemap: false,
    assetsInlineLimit: 0,
  },
});
