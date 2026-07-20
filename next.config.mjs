/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  async headers() {
    return [
      // Páginas que usam a câmera e geolocalização — permitem acesso
      {
        source: '/(login|perfil|geolocation-permission|users)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Permite câmera e geolocalização nestas rotas
          { key: 'Permissions-Policy', value: 'camera=self, microphone=(), geolocation=self, payment=()' },
          { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob: https://lh3.googleusercontent.com https://drive.google.com https://*.google.com https://*.googleapis.com https://*.tile.openstreetmap.org https://server.arcgisonline.com https://*.basemaps.cartocdn.com https://*.tile.opentopomap.org; connect-src 'self' https://cdn.jsdelivr.net https://nominatim.openstreetmap.org https://challenges.cloudflare.com https://static.cloudflareinsights.com; font-src 'self' data: https://fonts.gstatic.com; frame-ancestors 'none';" },
          ...(process.env.NODE_ENV === 'production'
            ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }]
            : []),
        ],
      },
      // Demais rotas — bloqueia câmera, permite geolocalização
      {
        source: '/((?!login|perfil|geolocation-permission|users).*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=self, payment=()' },
          { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob: https://lh3.googleusercontent.com https://drive.google.com https://*.google.com https://*.googleapis.com https://*.tile.openstreetmap.org https://server.arcgisonline.com https://*.basemaps.cartocdn.com https://*.tile.opentopomap.org; connect-src 'self' https://cdn.jsdelivr.net https://nominatim.openstreetmap.org https://challenges.cloudflare.com https://static.cloudflareinsights.com; font-src 'self' data: https://fonts.gstatic.com; frame-ancestors 'none';" },
          ...(process.env.NODE_ENV === 'production'
            ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }]
            : []),
        ],
      },
    ];
  },

  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    webpackBuildWorker: false,
  },
  serverExternalPackages: ['@prisma/client', 'bcryptjs', 'sharp', '@react-pdf/renderer', 'googleapis'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: 'drive.google.com' },
    ],
  },
  webpack: (config, { isServer }) => {
    config.externals.push({
      'utf-8-validate': 'commonjs utf-8-validate',
      bufferutil: 'commonjs bufferutil',
    });
    if (isServer) {
      config.externals.push({
        googleapis: 'commonjs googleapis',
        'google-auth-library': 'commonjs google-auth-library',
        gaxios: 'commonjs gaxios',
      });
    }
    return config;
  },
};

export default nextConfig;
