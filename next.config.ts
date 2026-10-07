import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Stock logos come from Binance's CDN. Serving them through /_next/image keeps them on our own domain,
  // so they still load on phone networks and in-app wallet browsers that block the CDN.
  images: {
    remotePatterns: [new URL("https://onchainos.bnbstatic.com/images/**")],
  },
  allowedDevOrigins: ["*.ngrok-free.dev"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
