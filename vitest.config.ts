import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: [
        'src/domain/**',
        'src/features/roadmap/layout/**',
        'src/features/roadmap/build-graph.ts',
        'src/features/roadmap/lod.ts',
        'src/data/providers/**',
      ],
      reporter: ['text', 'html'],
    },
  },
});
