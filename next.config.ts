import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/dashboard/waitlist", destination: "/waitlist", permanent: true },
    ];
  },
};

export default nextConfig;
