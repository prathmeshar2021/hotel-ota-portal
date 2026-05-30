"use client";

import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";

// Lazy-load the chatbot so it doesn't bloat initial page JS
const ChatBot = dynamic(() => import("./ChatBot"), { ssr: false });

/** Renders ChatBot only on customer-facing pages (not admin / auth). */
export default function ChatBotWrapper() {
  const pathname = usePathname();

  // Hide on admin pages, auth pages, and checkin (already focused flow)
  if (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/checkin")
  ) {
    return null;
  }

  return <ChatBot />;
}
