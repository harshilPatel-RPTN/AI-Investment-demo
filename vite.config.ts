import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Pre-bundle the Live API SDK (it is imported lazily) so first FIN use doesn't trigger a dev reload.
  optimizeDeps: { include: ['@google/genai'] },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:8787' },
  },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
} as never);
