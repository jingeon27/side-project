/**
 * Response headers applied to every route. The CSP only restricts framing, base URLs, plugins
 * and form targets: the inline theme script, JSON-LD and the RSC payload are inline scripts, so
 * script-src needs a hash or nonce before it can be enforced without breaking the page.
 */
export const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'",
  },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

export async function headers() {
  return [{ source: '/:path*', headers: securityHeaders }];
}
