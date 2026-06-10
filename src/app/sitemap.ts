import type { MetadataRoute } from "next";
import { prisma } from "@/lib/db/prisma";
import { SITE_URL } from "@/lib/constants/business";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/hotels`, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/contact`, changeFrequency: "yearly", priority: 0.4 },
    { url: `${SITE_URL}/terms`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/privacy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/refund-policy`, changeFrequency: "yearly", priority: 0.3 },
  ];

  // Public hotel detail pages
  let hotelRoutes: MetadataRoute.Sitemap = [];
  try {
    const hotels = await prisma.hotel.findMany({
      where: { isActive: true, isApproved: true },
      select: { slug: true, updatedAt: true },
    });
    hotelRoutes = hotels.map((h) => ({
      url: `${SITE_URL}/hotel/${h.slug}`,
      lastModified: h.updatedAt,
      changeFrequency: "weekly",
      priority: 0.8,
    }));
  } catch {
    // DB unreachable at build/runtime — still return the static routes.
  }

  return [...staticRoutes, ...hotelRoutes];
}
