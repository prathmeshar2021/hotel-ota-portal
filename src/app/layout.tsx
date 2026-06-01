import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import SessionWrapper from "@/components/shared/SessionWrapper";
import ChatBotWrapper from "@/components/customer/ChatBotWrapper";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "StayIndia — Book Hotels & Resorts",
    template: "%s | StayIndia",
  },
  description:
    "Discover and book handpicked hotels, resorts and cottages across India. Best prices, instant confirmation.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} bg-[#071209]`}>
        <SessionWrapper>
          {children}
          <Toaster richColors position="top-right" />
          <ChatBotWrapper />
        </SessionWrapper>
      </body>
    </html>
  );
}
