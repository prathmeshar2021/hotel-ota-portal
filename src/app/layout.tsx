import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import SessionWrapper from "@/components/shared/SessionWrapper";
import ChatBotWrapper from "@/components/customer/ChatBotWrapper";
import { CartProvider } from "@/lib/cart/CartContext";
import CartBar from "@/components/customer/CartBar";
import { BUSINESS, SITE_URL } from "@/lib/constants/business";
import { GEO, LOCAL_KEYWORDS } from "@/lib/constants/seo";

const inter = Inter({ subsets: ["latin"] });

const TAGLINE = "Book cottages & rooms at a forest retreat in Bhilai";
const DESCRIPTION = `Book your stay at ${BUSINESS.brand} — luxury cottages, AC and non-AC rooms at a peaceful forest retreat in ${BUSINESS.city}, ${BUSINESS.state}. 20 min from Durg, 45 min from Raipur. Best prices, instant WhatsApp confirmation and secure online payment.`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${BUSINESS.brand} — ${TAGLINE}`,
    template: `%s | ${BUSINESS.brand}`,
  },
  description: DESCRIPTION,
  applicationName: BUSINESS.brand,
  keywords: [
    BUSINESS.brand, "Bhilai resort", "Bhilai hotel", "cottages in Bhilai",
    "forest retreat Bhilai", "Chhattisgarh resort", ...LOCAL_KEYWORDS,
  ],
  alternates: { canonical: "/" },
  // Local-SEO geo tags (Bing/legacy crawlers; harmless for Google).
  other: {
    "geo.region": "IN-CT",
    "geo.placename": `${BUSINESS.city}, ${BUSINESS.state}`,
    "geo.position": `${GEO.lat};${GEO.lng}`,
    ICBM: `${GEO.lat}, ${GEO.lng}`,
  },
  openGraph: {
    type: "website",
    siteName: BUSINESS.brand,
    title: `${BUSINESS.brand} — ${TAGLINE}`,
    description: DESCRIPTION,
    url: SITE_URL,
    locale: "en_IN",
    images: [{ url: "/images/hero.jpg", width: 1200, height: 630, alt: BUSINESS.brand }],
  },
  twitter: {
    card: "summary_large_image",
    title: `${BUSINESS.brand} — ${TAGLINE}`,
    description: DESCRIPTION,
    images: ["/images/hero.jpg"],
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} bg-[#071209]`}>
        <SessionWrapper>
          <CartProvider>
            {children}
            <CartBar />
            <Toaster richColors position="top-right" />
            <ChatBotWrapper />
          </CartProvider>
        </SessionWrapper>
      </body>
    </html>
  );
}
