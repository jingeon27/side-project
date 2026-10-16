/** @type {import('next').NextConfig} */
const config = {
  distDir: process.env.NEXT_DIST_DIR || '.next',
  transpilePackages: ['@game-feedback/contracts', '@game-feedback/sdk'],
  async rewrites() {
    const origin = process.env.GAME_FEEDBACK_API_URL || process.env.API_ORIGIN || 'http://127.0.0.1:4300';
    return [{ source: '/api/:path*', destination: `${origin}/api/:path*` }];
  },
};
export default config;
