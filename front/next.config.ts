import type { NextConfig } from "next";

const isProduction = process.env.NODE_ENV === "production";
// HSTS / upgrade-insecure-requests 仅在真正 HTTPS 站点开启。
// Docker 本地用 http://localhost 时若随 NODE_ENV=production 开启，
// 浏览器会把 CSS/图片升到 https 导致整站“无样式无图”。
const siteUrl = (
  process.env.NEXT_PUBLIC_SITE_URL ??
  process.env.SITE_URL ??
  ""
).trim();
const enableHttpsSecurityHeaders =
  process.env.ENABLE_HTTPS_SECURITY_HEADERS === "true" ||
  siteUrl.startsWith("https://");

const browserApiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api/v1";
const internalApiBaseUrl = (
  process.env.API_INTERNAL_BASE_URL ??
  (browserApiBaseUrl.startsWith("http")
    ? browserApiBaseUrl
    : "http://localhost:8000/api/v1")
).replace(/\/+$/, "");
const apiUrl = new URL(internalApiBaseUrl);
const apiOrigin = apiUrl.origin;

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  `script-src 'self' 'unsafe-inline'${isProduction ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${apiOrigin}`,
  `media-src 'self' blob: ${apiOrigin}`,
  "font-src 'self' data:",
  `connect-src 'self' ${apiOrigin}${
    isProduction ? "" : " ws://localhost:* http://localhost:*"
  }`,
  "worker-src 'self' blob:",
  ...(enableHttpsSecurityHeaders ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: contentSecurityPolicy,
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  ...(enableHttpsSecurityHeaders
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
      ]
    : []),
];

const nextConfig: NextConfig = {
  // Docker 镜像使用 standalone 输出（见 front/Dockerfile）
  output: "standalone",
  images: {
    remotePatterns: [
      {
        protocol: apiUrl.protocol === "https:" ? "https" : "http",
        hostname: apiUrl.hostname,
        port: apiUrl.port,
        pathname: "/**",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${internalApiBaseUrl}/:path*`,
      },
      // 上传媒体同源代理，便于 STORAGE_PUBLIC_BASE_URL 指向前端域名
      {
        source: "/media/:path*",
        destination: `${apiOrigin}/media/:path*`,
      },
    ];
  },
};

export default nextConfig;
