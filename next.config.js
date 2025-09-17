// next.config.js
/** @type {import("next").NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    // ✅ merge existing aliases; do NOT replace
    config.resolve = config.resolve || {};
    config.resolve.alias = { ...(config.resolve.alias || {}) };
    return config;
  },
};
module.exports = nextConfig;
