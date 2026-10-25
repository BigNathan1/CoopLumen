/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  // Next 16 refuses dev-server assets to origins it does not know. The E2E
  // suite serves the app through a same-origin gateway on 127.0.0.1, so the
  // page never hydrated there. Dev server only; production builds ignore it.
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
  // Next 16 otherwise writes an AGENTS.md into the project on first start.
  agentRules: false,
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000',
    NEXT_PUBLIC_STELLAR_NETWORK: process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? 'TESTNET',
  },
  async rewrites() {
    const apiUrl = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/+$/, '');

    return [
      {
        source: '/api/:path*',
        destination: `${apiUrl}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
