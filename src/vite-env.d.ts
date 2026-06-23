/// <reference types="vite/client" />

/**
 * Build-time client config keys read by `src/data/config/fifa-config.ts`. All
 * optional — with none set, the SPA runs against the mock fallback with the
 * documented defaults (provider `auto`, competition `17`, season `285023`,
 * country `US`).
 */
interface ImportMetaEnv {
  readonly VITE_FIFA_PROVIDER?: string;
  readonly VITE_FIFA_BASE_URL?: string;
  readonly VITE_FIFA_COMPETITION_ID?: string;
  readonly VITE_FIFA_SEASON_ID?: string;
  readonly VITE_FIFA_COUNTRY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
