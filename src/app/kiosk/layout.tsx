import type { Metadata } from "next";
import KioskShell from "@/lib/kiosk/KioskShell";

// The kiosk runs full-screen on a locked tablet; keep it out of search results.
export const metadata: Metadata = {
  title: "Reception Kiosk",
  robots: { index: false, follow: false },
};

export default function KioskLayout({ children }: { children: React.ReactNode }) {
  return <KioskShell>{children}</KioskShell>;
}
