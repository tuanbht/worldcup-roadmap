import { defineConfig, type ViteUserConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// `@vitejs/plugin-react` is typed against the top-level vite (v6); vitest bundles
// its own vite (v5) `Plugin` type. The plugin is runtime-compatible, so widen to
// vitest's plugin type to bridge the version-skew without a second vite install.
const plugins: ViteUserConfig['plugins'] = [
  react() as NonNullable<ViteUserConfig['plugins']>[number],
];

export default defineConfig({
  plugins,
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    // Global default stays `node` (domain/data tests). The hook test opts into
    // jsdom via its own `// @vitest-environment jsdom` pragma (M3).
    environment: 'node',
    // H2: pin the provider before any data-layer module loads, so env.ts never
    // captures the `auto` default (which would attempt a real FIFA fetch).
    env: { WC_PROVIDER: 'mock' },
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'server/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: [
        'src/domain/**',
        'src/lib/datetime.ts',
        'src/features/roadmap/layout/**',
        'src/features/roadmap/build-graph.ts',
        'src/features/roadmap/lod.ts',
        'src/features/roadmap/interaction-mode.ts',
        'src/features/roadmap/hooks/useTournamentQuery.ts',
        'src/features/roadmap/hooks/useMatchDetailQuery.ts',
        'src/features/roadmap/hooks/useInteractionMode.ts',
        'src/components/roadmap/InteractionModeToggle.tsx',
        'src/data/providers/**',
        'src/data/cache/match-detail-cache.ts',
        'src/components/panel/match-detail/**',
        'server/routes/**',
      ],
      // Test-support builders/fixtures are not production code — they sit under
      // `match-detail/**` (caught by the include glob) but must not be measured.
      exclude: ['**/__test-support__/**', '**/__fixtures__/**'],
      reporter: ['text', 'html'],
    },
  },
});
