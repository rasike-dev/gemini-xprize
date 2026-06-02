/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@ledgerpilot/shared'],
  output: 'standalone',
};

export default nextConfig;
