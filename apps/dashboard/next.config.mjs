import fs from 'node:fs';
import path from 'node:path';

// Support monorepo root .env.local when run from apps/dashboard
const rootEnv = path.resolve(process.cwd(), '../../.env.local');
if (fs.existsSync(rootEnv) && typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile(rootEnv);
  } catch {
    // ignore if already loaded or unreadable
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@wp-agent/contracts'],
};

export default nextConfig;
