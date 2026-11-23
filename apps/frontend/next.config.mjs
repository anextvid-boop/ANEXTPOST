/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: {
    // Enforce types in CI; we still surface them locally via `next dev`.
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    proxyTimeout: 90_000,
  },
  transpilePackages: ['crypto-hash'],
  async headers() {
    return [
      {
        // The OAuth consent screen is a one-click "give this app access to your
        // workspace" decision. Anything that can frame it can hide it under a
        // decoy and have a signed-in admin click Approve (clickjacking), so it
        // must never be embeddable. The rest of the app stays frameable on
        // purpose (Whop embeds it).
        source: '/oauth/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ];
  },
  async redirects() {
    const isRemoteStorage =
      process.env.STORAGE_PROVIDER === 'cloudflare' ||
      process.env.STORAGE_PROVIDER === 'minio';
    return [
      {
        source: '/api/uploads/:path*',
        destination: !isRemoteStorage ? '/uploads/:path*' : '/404',
        permanent: true,
      },
    ];
  },
  async rewrites() {
    const isRemoteStorage =
      process.env.STORAGE_PROVIDER === 'cloudflare' ||
      process.env.STORAGE_PROVIDER === 'minio';
    const backendOrigin =
      process.env.BACKEND_INTERNAL_URL ||
      process.env.NEXT_PUBLIC_BACKEND_URL ||
      'http://127.0.0.1:3000';
    return [
      {
        source: '/api/:path*',
        destination: `${backendOrigin}/:path*`,
      },
      {
        source: '/uploads/:path*',
        destination: !isRemoteStorage
          ? `${backendOrigin}/uploads/:path*`
          : '/404',
      },
    ];
  },
};

export default nextConfig;
