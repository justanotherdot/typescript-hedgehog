import { defineConfig } from 'vitest/config';
import wasm from 'vite-plugin-wasm';
import { resolve } from 'path';

export default defineConfig({
  plugins: [wasm()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.bench.?(c|m)[jt]s?(x)'],
    testTimeout: 300000, // 5 minutes for thorough benchmarks
  },
});