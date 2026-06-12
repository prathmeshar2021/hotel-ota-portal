"use client";

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";

export interface CartItem {
  categoryType: string; // enum value, e.g. "NON_AC_ROOM"
  slug: string;
  displayName: string;
  pricePerNight: number; // nightly price after marketing discount (what's charged)
  originalPricePerNight: number; // base nightly price (for struck-through + GST slab)
  capacity: number; // max guests per room of this category
  qty: number;
  guestsPerRoom: number;
  image?: string | null;
  accentColor?: string;
}

interface CartContextValue {
  hotelId: string | null;
  hotelSlug: string | null;
  checkIn: string | null;
  checkOut: string | null;
  items: CartItem[];
  totalRooms: number;
  addItem: (
    ctx: { hotelId: string; hotelSlug: string; checkIn: string; checkOut: string },
    item: Omit<CartItem, "qty"> & { qty?: number }
  ) => void;
  setQty: (categoryType: string, qty: number) => void;
  setGuests: (categoryType: string, guestsPerRoom: number) => void;
  removeItem: (categoryType: string) => void;
  setDates: (checkIn: string, checkOut: string) => void;
  clear: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);
const STORAGE_KEY = "tue_cart_v1";

interface Persisted {
  hotelId: string | null;
  hotelSlug: string | null;
  checkIn: string | null;
  checkOut: string | null;
  items: CartItem[];
}

const EMPTY: Persisted = { hotelId: null, hotelSlug: null, checkIn: null, checkOut: null, items: [] };

export function CartProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Persisted>(EMPTY);
  const [hydrated, setHydrated] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setState(JSON.parse(raw));
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  // Persist
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }, [state, hydrated]);

  const addItem: CartContextValue["addItem"] = useCallback((ctx, item) => {
    setState((prev) => {
      // A cart belongs to one stay (one hotel + one date range). Switching hotel
      // or dates starts a fresh cart so totals stay coherent.
      const sameStay =
        prev.hotelId === ctx.hotelId && prev.checkIn === ctx.checkIn && prev.checkOut === ctx.checkOut;
      const base: Persisted = sameStay
        ? prev
        : { hotelId: ctx.hotelId, hotelSlug: ctx.hotelSlug, checkIn: ctx.checkIn, checkOut: ctx.checkOut, items: [] };

      const addQty = item.qty ?? 1;
      const existing = base.items.find((i) => i.categoryType === item.categoryType);
      const items = existing
        ? base.items.map((i) =>
            i.categoryType === item.categoryType ? { ...i, qty: i.qty + addQty } : i
          )
        : [...base.items, { ...item, qty: addQty, guestsPerRoom: item.guestsPerRoom || 2 }];

      return { ...base, hotelSlug: ctx.hotelSlug, items };
    });
  }, []);

  const setQty: CartContextValue["setQty"] = useCallback((categoryType, qty) => {
    setState((prev) => ({
      ...prev,
      items:
        qty <= 0
          ? prev.items.filter((i) => i.categoryType !== categoryType)
          : prev.items.map((i) => (i.categoryType === categoryType ? { ...i, qty } : i)),
    }));
  }, []);

  const setGuests: CartContextValue["setGuests"] = useCallback((categoryType, guestsPerRoom) => {
    setState((prev) => ({
      ...prev,
      items: prev.items.map((i) =>
        i.categoryType === categoryType ? { ...i, guestsPerRoom } : i
      ),
    }));
  }, []);

  const removeItem: CartContextValue["removeItem"] = useCallback((categoryType) => {
    setState((prev) => ({ ...prev, items: prev.items.filter((i) => i.categoryType !== categoryType) }));
  }, []);

  const setDates: CartContextValue["setDates"] = useCallback((checkIn, checkOut) => {
    setState((prev) => ({ ...prev, checkIn, checkOut }));
  }, []);

  const clear = useCallback(() => setState(EMPTY), []);

  const totalRooms = state.items.reduce((n, i) => n + i.qty, 0);

  return (
    <CartContext.Provider
      value={{ ...state, items: state.items, totalRooms, addItem, setQty, setGuests, removeItem, setDates, clear }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
