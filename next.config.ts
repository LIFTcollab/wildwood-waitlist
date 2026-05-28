import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // Legacy path redirect (pre-refactor)
      { source: "/dashboard/waitlist", destination: "/waitlist", permanent: true },

      // Domain migration: wildwood.liftcollab.org → wildwood.liftcollab.app
      // Requires wildwood.liftcollab.org to also be added to this Vercel project.
      {
        source: "/(.*)",
        has: [{ type: "host", value: "wildwood.liftcollab.org" }],
        destination: "https://wildwood.liftcollab.app/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
