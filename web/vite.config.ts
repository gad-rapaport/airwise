/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true, sourcemap: false, assetsInlineLimit: 0 },
  server: {
    host: '127.0.0.1',
    port: 5182,
    strictPort: true,
    proxy: { '/api': 'http://127.0.0.1:8002' },
  },
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
});
