// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // IMPORTANT: never overwrite config.resolve/alias — always merge.
  webpack: (config) => {
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      // add your aliases here only if you need them, e.g.:
      // '@': require('path').resolve(__dirname),
    };
    return config;
  },
};

module.exports = nextConfig;