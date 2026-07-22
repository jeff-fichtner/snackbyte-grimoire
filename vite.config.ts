/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const webRoot = fileURLToPath(new URL('./src/web', import.meta.url));
const distDir = fileURLToPath(new URL('./dist', import.meta.url));

export default defineConfig({
  root: webRoot,
  plugins: [react()],
  build: {
    outDir: distDir,
    emptyOutDir: true,
  },
  test: {
    // jsdom so component tests have a DOM. Tests that read the filesystem still work —
    // vitest runs in Node regardless of the simulated environment.
    environment: 'jsdom',
    globals: true,
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    root: fileURLToPath(new URL('.', import.meta.url)),
  },
});
