import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile, repoRoot } from '../../scripts/load-root-env.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Root .env overrides shell placeholders; .env.local layers win last.
loadEnvFile(path.join(repoRoot, '.env'), { override: true });
loadEnvFile(path.join(repoRoot, '.env.local'), { override: true });
loadEnvFile(path.join(__dirname, '.env.local'), { override: true });

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@ledgerpilot/shared'],
  output: 'standalone',
};

export default nextConfig;
