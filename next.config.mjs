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
    return [
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

  // Canonical domain. Vercel always serves the auto-assigned production URL
  // (rapidtalportal.vercel.app) and won't let you redirect it from the
  // dashboard, so force it here. Scoped to that EXACT host so preview
  // deployments (rapidtalportal-git-*, hashed *.vercel.app previews) and
  // localhost are unaffected. The path and query string are carried over.
  async redirects() {
    return [
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'rapidtalportal.vercel.app' }],
        destination: 'https://rapidtal.online/:path*',
        permanent: true,
      },
    ];
  },

  // Webpack tweaks. NOTE: do not override optimization.splitChunks here — a
  // previous "vendors" override merged ALL of node_modules into one 442 kB
  // chunk every page had to download (recharts shipped to pages that never
  // chart). Next's default granular chunking splits per page.
  webpack: (config) => {
    // canvas is an optional native dep of pdfjs-dist — not needed in serverless
    config.resolve.alias = {
      ...config.resolve.alias,
      canvas: false,
    };
    return config;
  },
  
  // Power by headers
  poweredByHeader: false,
};

export default nextConfig;
