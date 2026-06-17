import type { NextConfig } from 'next';
import { createRequire } from 'node:module';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    // FIFA serves team flags from api.fifa.com; allow remote optimization.
    remotePatterns: [
      { protocol: 'https', hostname: 'api.fifa.com' },
      { protocol: 'https', hostname: 'digitalhub.fifa.com' },
    ],
  },
};

/**
 * Bundle analysis is opt-in via `ANALYZE=true next build` (the `analyze` script).
 * The analyzer is a devDep loaded lazily so a normal `next build` never depends
 * on it; if it is absent when ANALYZE is set, we fail loudly rather than silently
 * skipping the requested report.
 */
type BundleAnalyzerFactory = (options: { enabled: boolean }) => (config: NextConfig) => NextConfig;

function withAnalyzer(config: NextConfig): NextConfig {
  if (process.env.ANALYZE !== 'true') return config;
  const require = createRequire(import.meta.url);
  const bundleAnalyzer = require('@next/bundle-analyzer') as BundleAnalyzerFactory;
  return bundleAnalyzer({ enabled: true })(config);
}

export default withAnalyzer(nextConfig);
