import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "res.cloudinary.com" },
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
    // Serve modern formats automatically (browser chooses AVIF → WebP → original)
    formats: ["image/avif", "image/webp"],
    // Cache optimized images for 7 days on the CDN
    minimumCacheTTL: 604800,
    // Default quality for remote images
    qualities: [60, 75, 90],
  },
};

export default nextConfig;
