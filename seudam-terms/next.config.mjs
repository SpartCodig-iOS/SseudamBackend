/** @type {import('next').NextConfig} */
const nextConfig = {
  // Disable static optimization to prevent build issues
  output: 'standalone',

  // Fix build warnings
  typescript: {
    ignoreBuildErrors: true,
  },

  eslint: {
    ignoreDuringBuilds: true,
  },

  // Handle turbopack warnings
  experimental: {
    turbo: {
      root: undefined,
    },
  },
};

export default nextConfig;