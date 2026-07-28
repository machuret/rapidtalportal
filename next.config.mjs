/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable compression for better performance
  compress: true,
  
  // Optimize images
  images: {
    formats: ['image/webp', 'image/avif'],
    dangerouslyAllowSVG: true,
    contentDispositionType: 'attachment',
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
  
  // Experimental optimizations
  experimental: {
    optimizePackageImports: ['lucide-react', 'date-fns'],
    scrollRestoration: true,
  },
  
  // Headers for caching and security
  async headers() {
    // Supabase origin is needed for REST + realtime (wss) + storage images.
    // .trim() defends against stray whitespace in the env value, which would
    // otherwise break the ^https anchor below and drop the wss:// origin.
    const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
    // Browsers do NOT treat `connect-src https://host` as also allowing
    // `wss://host` — the realtime socket needs the wss origin listed explicitly.
    const supabaseWss = supabaseUrl.replace(/^https:/, 'wss:');

    // CSP is ENFORCING (validated report-only first against a real session: the
    // only violation found was the Supabase realtime wss:// origin, now in
    // connect-src). script-src/style-src keep 'unsafe-inline' because Next's App
    // Router injects inline bootstrap; tightening that further needs per-request
    // nonces wired through middleware. If you add a new external origin (a script,
    // API, font, or iframe host), add it to the matching directive below or it
    // will be BLOCKED — re-validate report-only before broad changes.
    const csp = [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "img-src 'self' data: blob: " + supabaseUrl,
      "font-src 'self' data:",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self' 'unsafe-inline'",
      "connect-src 'self' " + supabaseUrl + ' ' + supabaseWss,
      "frame-src https://www.loom.com",
    ].join('; ');

    const securityHeaders = [
      { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      { key: 'Content-Security-Policy', value: csp },
    ];

    return [
      {
        // Apply the security headers to every route (pages, API, assets).
        source: '/(.*)',
        headers: securityHeaders,
      },
      {
        // API responses are per-user and authenticated. Default to no shared
        // caching so a CDN/proxy can never serve one user's data to another.
        // Opt specific non-personalized endpoints into caching at the route level.
        source: '/api/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'private, no-store',
          },
        ],
      },
      {
        source: '/_next/static/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },

  // NOTE: canonical-domain redirect (rapidtalportal.vercel.app → rapidtal.online)
  // lives in middleware.ts, NOT here. A next.config redirect matches /api too,
  // so an API call from the .vercel.app host got 308'd cross-origin and the
  // browser blocked it (CORS) → "Failed to fetch". The middleware matcher
  // already excludes /api, so page navigations canonicalise but API calls don't.

  // Power by headers
  poweredByHeader: false,
};

export default nextConfig;
