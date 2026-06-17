// Shared Vitest setup. Registers `@testing-library/jest-dom` matchers (the
// `/vitest` entry, not the Jest one, so `expect` is extended correctly under
// Vitest) and unmounts rendered trees after every test to prevent DOM leakage
// between component tests. Additive and environment-agnostic: node-environment
// domain/data suites render nothing, so `cleanup()` is a no-op there.
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});
