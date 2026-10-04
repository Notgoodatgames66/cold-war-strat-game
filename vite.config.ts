import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// `base: './'` makes every asset path relative, so the built game works
// both on GitHub Pages (served from /cold-war-strat-game/) and locally.
export default defineConfig({
  base: './',
  plugins: [react()],
  worker: { format: 'es' },
  // The world map's geometry (about 100 kB) lives in the main bundle.
  build: { chunkSizeWarningLimit: 700 },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
