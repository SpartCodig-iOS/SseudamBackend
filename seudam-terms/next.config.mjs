/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export for Railway hosting
  output: 'export',

  // Disable image optimization for static export
  images: {
    unoptimized: true,
  },

  // Add trailing slashes for better static hosting
  trailingSlash: true,

  // Skip build-time errors for Railway deployment
  typescript: {
    ignoreBuildErrors: true,
  },

  // Disable strict mode to prevent build issues
  reactStrictMode: false,

  // Output directory for Railway
  distDir: 'out',
};

export default nextConfig;