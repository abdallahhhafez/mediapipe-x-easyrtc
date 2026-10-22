import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Everything EasyRTC needs must be same-origin: it serves its own client script
// from /easyrtc and rides the app's socket.io server, so both are proxied
// alongside /api rather than being reached by absolute URL.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5175,
    proxy: {
      '/api': { target: 'http://localhost:4100', changeOrigin: true },
      '/easyrtc': { target: 'http://localhost:4100', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:4100', changeOrigin: true, ws: true },
    },
  },
  optimizeDeps: {
    // The MediaPipe wasm bundle is large and never changes between builds.
    exclude: ['@mediapipe/tasks-vision'],
    /**
     * The shared workspace package is pre-bundled rather than served from
     * source. It lives outside the client's root, so Vite would otherwise
     * serve it through a /@fs/<absolute path> URL — and this project's absolute
     * path contains spaces, which those URLs do not escape, giving a 404 on
     * every shared import. Pre-bundling moves them under /node_modules/.vite/.
     */
    include: [
      '@vitalwatch/shared/metrics.js',
      '@vitalwatch/shared/bands.js',
      '@vitalwatch/shared/news2.js',
      '@vitalwatch/shared/detector.js',
    ],
  },
});
