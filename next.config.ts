import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Enable experimental features for server actions
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb', // Allow larger images for photo analysis
    },
    optimizePackageImports: [
      '@aws-amplify/ui-react',
      'aws-amplify',
      '@aws-amplify/adapter-nextjs',
    ],
  },
  // Image optimization
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
  // Environment variables exposed to the client
  env: {
    NEXT_PUBLIC_APP_NAME: 'MacroAI',
  },
};

export default nextConfig;
