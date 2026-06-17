/**
 * Minimal ambient shim for `@axe-core/playwright`, used only so `npm run
 * typecheck` passes BEFORE the real devDep is installed (added by the
 * package.json Modify step in Stage 5). The real package ships its own,
 * richer types; with `skipLibCheck` enabled they take precedence at runtime and
 * this shim simply keeps the e2e spec type-safe in the interim.
 */
declare module '@axe-core/playwright' {
  import type { Page, FrameLocator } from '@playwright/test';

  interface AxeViolation {
    id: string;
    impact?: 'minor' | 'moderate' | 'serious' | 'critical' | null;
    description?: string;
  }

  interface AxeResults {
    violations: AxeViolation[];
  }

  export default class AxeBuilder {
    constructor(options: { page: Page; context?: FrameLocator });
    withTags(tags: string[]): this;
    include(selector: string): this;
    exclude(selector: string): this;
    analyze(): Promise<AxeResults>;
  }
}
