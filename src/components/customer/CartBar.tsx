"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShoppingCart, ArrowRight } from "lucide-react";
import { useCart } from "@/lib/cart/CartContext";

/** Floating "review cart" bar — appears whenever the cart has rooms. */
export default function CartBar() {
  const { items, totalRooms, hotelSlug } = useCart();
  const pathname = usePathname();

  if (totalRooms === 0 || !hotelSlug) return null;
  // Don't show it on the cart page itself.
  if (pathname?.endsWith("/cart")) return null;
  // Never over the locked kiosk.
  if (pathname?.startsWith("/kiosk")) return null;

  const categories = items.length;

  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[60] w-[calc(100%-2rem)] max-w-md">
      <Link
        href={`/book/${hotelSlug}/cart`}
        className="flex items-center gap-3 bg-amber-500 hover:bg-amber-400 text-black font-bold pl-4 pr-3 py-3 rounded-2xl shadow-[0_12px_40px_rgba(245,158,11,0.4)] transition-all hover:scale-[1.02]"
      >
        <span className="relative">
          <ShoppingCart className="w-5 h-5" />
          <span className="absolute -top-2 -right-2 bg-black text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
            {totalRooms}
          </span>
        </span>
        <span className="flex-1 text-sm">
          {totalRooms} room{totalRooms !== 1 ? "s" : ""}
          {categories > 1 ? ` · ${categories} types` : ""} in cart
        </span>
        <span className="flex items-center gap-1 text-sm">
          Review &amp; Pay <ArrowRight className="w-4 h-4" />
        </span>
      </Link>
    </div>
  );
}
