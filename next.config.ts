import type { NextConfig } from "next";

const config: NextConfig = {
  devIndicators: false,
  outputFileTracingIncludes: { "/": ["./data/itineraries.csv"], "/reise": ["./data/itineraries.csv"], "/api/itinerary": ["./data/itineraries.csv"] },
  async headers() {
    return [{ source: "/(.*)", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Content-Security-Policy", value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self';" },
    ] }];
  },
};

export default config;
