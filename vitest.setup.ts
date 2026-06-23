// Shared Vitest setup. Registers `@testing-library/jest-dom` matchers (the
// `/vitest` entry, not the Jest one, so `expect` is extended correctly under
// Vitest) and unmounts rendered trees after every test to prevent DOM leakage
// between component tests. Additive and environment-agnostic: node-environment
// domain/data suites render nothing, so `cleanup()` is a no-op there.
//
// M3: pin the data provider to `mock` BEFORE any data-layer module loads, so
// `fifa-config.ts` resolves `provider: 'mock'` (`import.meta.env.VITE_FIFA_PROVIDER`
// is otherwise `undefined` under Vitest) and no hook/repository test that forgets
// to mock can attempt a live FIFA fetch.
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

vi.stubEnv('VITE_FIFA_PROVIDER', 'mock');

afterEach(() => {
  cleanup();
});
