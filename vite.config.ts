import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'prompt',
        manifest: {
          id: '/',
          name: 'Vexora Browser',
          short_name: 'Vexora',
          description:
            'Fast, privacy-first browser shell with locally encrypted search, AI ad shield, tab hibernation, and zero-knowledge sync.',
          theme_color: '#080b14',
          background_color: '#080b14',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/assets/icon-192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/assets/icon-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/assets/icon-maskable-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        // Icons are already picked up by the glob below; adding them again from
        // the manifest produced duplicate precache URLs with different revisions.
        includeManifestIcons: false,
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
          // Only treat Vite's content-hashed bundles as revision-free. Static files that
          // live under /assets (favicon, icons, logos) keep a real revision hash.
          dontCacheBustURLsMatching: /^assets\/.+-[A-Za-z0-9_-]{8}\.(?:js|css)$/,
          // Safety net: never hand Workbox the same URL twice.
          manifestTransforms: [
            async (entries) => {
              const byUrl = new Map<string, (typeof entries)[number]>();
              for (const e of entries) {
                const prev = byUrl.get(e.url);
                if (!prev || (prev.revision == null && e.revision != null)) byUrl.set(e.url, e);
              }
              return { manifest: Array.from(byUrl.values()), warnings: [] };
            },
          ],
          navigateFallbackDenylist: [/^\/proxy/, /^\/api/, /^\/__vx/],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
        devOptions: {
          enabled: true,
          type: 'module',
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
