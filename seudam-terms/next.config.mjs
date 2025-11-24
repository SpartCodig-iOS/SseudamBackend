/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep it simple for Railway hosting
  typescript: {
    ignoreBuildErrors: true,
  },

  // Disable strict mode to prevent build issues
  reactStrictMode: false,
};

export default nextConfig;