import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// `base: './'` makes every asset path relative, so the built game works
// both on GitHub Pages (served from /cold-war-strat-game/) and locally.
export default defineConfig({
  base: './',
  plugins: [react()],
  worker: { format: 'es' },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
