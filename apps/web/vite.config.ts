import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icones/favicon.svg', 'icones/apple-touch-icon.png'],
      manifest: {
        name: 'Katechesis',
        short_name: 'Katechesis',
        description: 'Organização da catequese para paróquias e dioceses.',
        lang: 'pt-BR',
        start_url: '/',
        display: 'standalone',
        background_color: '#F7F4EE',
        theme_color: '#16294A',
        icons: [
          { src: '/icones/icone-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icones/icone-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icones/icone-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        globPatterns: ['**/*.{js,css,html,svg,png}', '**/*-latin-*.woff2', '**/*-latin-600-*.woff2'],
        // A API nunca é guardada no aparelho por este cache (dados pessoais).
        runtimeCaching: []
      }
    })
  ],
  server: { proxy: { '/api': 'http://localhost:8787' } },
  build: { sourcemap: false, target: 'es2022' }
});
