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
    // jsdom via its own `// @vitest-environment jsdom` pragma (M3). The
    // deterministic mock-provider pin now lives in `vitest.setup.ts`
    // (`vi.stubEnv('VITE_FIFA_PROVIDER', 'mock')`), so no suite can attempt a live
    // FIFA fetch.
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      include: [
        'src/domain/**',
        'src/lib/datetime.ts',
        'src/features/roadmap/layout/**',
        'src/features/roadmap/build-graph.ts',
        'src/features/roadmap/lod.ts',
        'src/features/roadmap/interaction-mode.ts',
        'src/features/roadmap/focus-target.ts',
        'src/features/roadmap/hooks/useTournamentQuery.ts',
        'src/features/roadmap/hooks/useMatchDetailQuery.ts',
        'src/features/roadmap/hooks/useInteractionMode.ts',
        'src/features/roadmap/hooks/useFocusMatch.ts',
        'src/features/roadmap/hooks/useFocusCamera.ts',
        'src/components/roadmap/InteractionModeToggle.tsx',
        'src/components/roadmap/FocusMatchButton.tsx',
        'src/data/providers/**',
        'src/data/config/fifa-config.ts',
        'src/components/panel/match-detail/**',
      ],
      // Test-support builders/fixtures are not production code — they sit under
      // `match-detail/**` (caught by the include glob) but must not be measured.
      exclude: ['**/__test-support__/**', '**/__fixtures__/**'],
      reporter: ['text', 'html'],
    },
  },
});
