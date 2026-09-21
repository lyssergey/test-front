import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The upstream token never leaves the server, so nothing here is exposed to the client.
  poweredByHeader: false,
};

export default nextConfig;
