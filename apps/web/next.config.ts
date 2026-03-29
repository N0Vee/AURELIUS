import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";
const internalHost = process.env.TAURI_DEV_HOST || "localhost";

const nextConfig: NextConfig = {
  output: "export",
  // Required for static export + any static file server (Tauri localhost plugin,
  // nginx, etc.). Without this, Next.js emits flat `.html` files and the App
  // Router's RSC prefetch requests return the wrong content on nested routes
  // like /settings/automations and /settings/skills, causing <Link> navigation
  // to silently fail while direct URL access still works.
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  assetPrefix: isProd ? undefined : `http://${internalHost}:4242`,
};

export default nextConfig;
