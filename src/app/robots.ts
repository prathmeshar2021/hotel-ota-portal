import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/constants/business";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Keep private/auth/admin/API surfaces out of search results.
      disallow: ["/admin", "/hotel-admin", "/api/", "/auth/", "/my-bookings", "/checkin", "/booking/confirmation"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
