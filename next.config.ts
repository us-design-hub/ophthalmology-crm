import type { NextConfig } from "next";

const config: NextConfig = {
  poweredByHeader: false,
  // Playwright reads package-owned runtime assets such as browsers.json.
  // Keeping it external prevents Turbopack from producing an incomplete copy.
  serverExternalPackages: ["playwright-core"],
  async headers() {
    return [{ source: "/(.*)", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    ] }, { source: "/verify/:path*", headers: [{ key: "Referrer-Policy", value: "no-referrer" }, { key: "Cache-Control", value: "no-store, private" }] }, { source: "/preview/:path*", headers: [{ key: "Referrer-Policy", value: "no-referrer" }, { key: "Cache-Control", value: "no-store, private" }] }];
  },
};

export default config;
