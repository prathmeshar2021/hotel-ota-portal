"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  MessageCircle, X, Send, ChevronDown,
  Loader2, Calendar,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface RoomOption {
  id: string;
  type: string;
  label: string;
  price: number;
  capacity: number;
  accent: string;
}

type ChatAction =
  | { type: "DATE_PICKER" }
  | { type: "SHOW_ROOMS"; rooms: RoomOption[] }
  | { type: "BOOKING_LINK"; url: string; label: string };

interface Message {
  id: string;
  role: "user" | "bot";
  content: string;
  quickReplies?: string[];
  action?: ChatAction;
  /** If true, quick replies / actions have already been acted on */
  actedOn?: boolean;
}

interface SessionContext {
  bookingStep?: string;
  checkIn?: string;
  checkOut?: string;
  guests?: number;
  availableRooms?: RoomOption[];
  selectedRoom?: RoomOption;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Very simple markdown renderer: **bold**, _italic_, [link](url), \n */
function renderText(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|_[^_]+_|\[[^\]]+\]\([^)]+\)|\n)/g);
  return parts.map((part, i) => {
    if (part === "\n") return <br key={i} />;
    const bold = part.match(/^\*\*(.+)\*\*$/);
    if (bold) return <strong key={i} className="font-semibold text-white">{bold[1]}</strong>;
    const italic = part.match(/^_(.+)_$/);
    if (italic) return <em key={i} className="text-white/70">{italic[1]}</em>;
    const link = part.match(/^\[(.+)\]\((.+)\)$/);
    if (link)
      return (
        <a key={i} href={link[2]} target="_blank" rel="noopener noreferrer"
          className="text-amber-300 underline hover:text-amber-200 transition-colors">
          {link[1]}
        </a>
      );
    return part;
  });
}

function formatDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function nightsBetween(checkIn: string, checkOut: string): number {
  return Math.ceil(
    (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function DatePickerWidget({ onSubmit }: { onSubmit: (ci: string, co: string) => void }) {
  const today = new Date().toISOString().split("T")[0];
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const nights = checkIn && checkOut ? nightsBetween(checkIn, checkOut) : 0;

  return (
    <div className="mt-2 rounded-2xl p-3 space-y-2.5"
      style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}>
      <div className="grid grid-cols-2 gap-2">
        {/* Check-in */}
        <div>
          <label className="block text-[10px] text-white/35 uppercase tracking-widest mb-1">Check-in</label>
          <div className="relative">
            <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/25 pointer-events-none" />
            <input
              type="date" min={today} value={checkIn}
              onChange={(e) => { setCheckIn(e.target.value); if (checkOut && checkOut <= e.target.value) setCheckOut(""); }}
              className="w-full bg-white/5 border border-white/10 rounded-xl pl-7 pr-1.5 py-2 text-white text-xs focus:outline-none focus:border-amber-400/40 [color-scheme:dark]"
            />
          </div>
        </div>
        {/* Check-out */}
        <div>
          <label className="block text-[10px] text-white/35 uppercase tracking-widest mb-1">Check-out</label>
          <div className="relative">
            <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/25 pointer-events-none" />
            <input
              type="date" min={checkIn || today} value={checkOut}
              onChange={(e) => setCheckOut(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl pl-7 pr-1.5 py-2 text-white text-xs focus:outline-none focus:border-amber-400/40 [color-scheme:dark]"
            />
          </div>
        </div>
      </div>

      {nights > 0 && (
        <p className="text-[11px] text-center text-amber-400/80 font-medium">
          {nights} night{nights > 1 ? "s" : ""} selected
        </p>
      )}

      <button
        onClick={() => nights > 0 && onSubmit(checkIn, checkOut)}
        disabled={nights < 1}
        className="w-full bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold py-2 rounded-xl transition-all disabled:opacity-35 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-[0.98]"
      >
        Check Availability →
      </button>
    </div>
  );
}

function RoomCard({ room, onSelect }: { room: RoomOption; onSelect: (r: RoomOption) => void }) {
  return (
    <button
      onClick={() => onSelect(room)}
      className="w-full text-left rounded-xl p-3 border transition-all hover:scale-[1.02] active:scale-[0.98] mt-1"
      style={{
        background: `${room.accent}08`,
        borderColor: `${room.accent}25`,
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-white">{room.label}</p>
          <p className="text-[11px] text-white/40 mt-0.5">Up to {room.capacity} guest{room.capacity > 1 ? "s" : ""}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-bold" style={{ color: room.accent }}>
            ₹{room.price.toLocaleString("en-IN")}
          </p>
          <p className="text-[10px] text-white/30">/night</p>
        </div>
      </div>
    </button>
  );
}

function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="bg-white/6 border border-white/10 px-4 py-3 rounded-2xl rounded-bl-sm flex items-center gap-1.5">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="w-1.5 h-1.5 bg-white/35 rounded-full"
            animate={{ y: [0, -5, 0] }}
            transition={{ duration: 0.7, delay: i * 0.15, repeat: Infinity, ease: "easeInOut" }}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Welcome message ──────────────────────────────────────────────────────────

const WELCOME: Message = {
  id: "welcome",
  role: "bot",
  content:
    "👋 Namaste! I'm **Sangwari**, your resort companion at **The Urban Escape**.\n\nAsk me about rooms, pricing, availability, or anything else — I'm always here for you! 🌿",
  quickReplies: ["View Rooms & Rates", "Check Availability", "Amenities", "Location", "Contact Us"],
};

// ─── Main ChatBot component ───────────────────────────────────────────────────

export default function ChatBot() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [context, setContext] = useState<SessionContext>({});
  const [hasUnread, setHasUnread] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Focus input + clear unread when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 120);
      setHasUnread(false);
    }
  }, [open]);

  // ── Helpers ────────────────────────────────────────────────────────────────

  const markLastActedOn = useCallback(() => {
    setMessages((prev) => {
      const copy = [...prev];
      const last = copy.findLastIndex((m) => m.role === "bot");
      if (last !== -1) copy[last] = { ...copy[last], actedOn: true };
      return copy;
    });
  }, []);

  const pushUserMessage = useCallback((content: string) => {
    setMessages((prev) => [
      ...prev,
      { id: `u-${Date.now()}`, role: "user", content },
    ]);
  }, []);

  const pushBotMessage = useCallback(
    (content: string, quickReplies?: string[], action?: ChatAction) => {
      setMessages((prev) => [
        ...prev,
        { id: `b-${Date.now()}`, role: "bot", content, quickReplies, action },
      ]);
      if (!open) setHasUnread(true);
    },
    [open]
  );

  // ── Send message to API ────────────────────────────────────────────────────

  const sendToAPI = useCallback(
    async (
      userText: string,
      contextOverride?: Partial<SessionContext>
    ) => {
      setLoading(true);
      const mergedCtx = { ...context, ...contextOverride };
      if (contextOverride) setContext(mergedCtx);

      try {
        const history = messages
          .slice(-8)
          .map((m) => ({ role: m.role, content: m.content }));

        const res = await fetch("/api/chatbot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: userText, history, context: mergedCtx }),
        });

        const data = await res.json();
        if (data.context) setContext((prev) => ({ ...prev, ...data.context }));
        pushBotMessage(data.reply, data.quickReplies, data.action);
      } catch {
        pushBotMessage(
          "Sorry, I'm having trouble connecting. Please call us at **+91 70006 30016**! 📞",
          ["Contact Us"]
        );
      } finally {
        setLoading(false);
      }
    },
    [context, messages, pushBotMessage]
  );

  // ── Main send handler ──────────────────────────────────────────────────────

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;
      setInput("");
      markLastActedOn();
      pushUserMessage(trimmed);
      await sendToAPI(trimmed);
    },
    [loading, markLastActedOn, pushUserMessage, sendToAPI]
  );

  // ── Date availability check ────────────────────────────────────────────────

  const handleDatesSubmit = useCallback(
    async (checkIn: string, checkOut: string) => {
      markLastActedOn();
      const nights = nightsBetween(checkIn, checkOut);
      pushUserMessage(
        `Check-in: ${formatDate(checkIn)} → Check-out: ${formatDate(checkOut)} · ${nights} night${nights > 1 ? "s" : ""}`
      );
      const ctx: Partial<SessionContext> = {
        checkIn,
        checkOut,
        bookingStep: "CHECK_AVAILABILITY",
      };
      await sendToAPI(
        `Check availability from ${checkIn} to ${checkOut}`,
        ctx
      );
    },
    [markLastActedOn, pushUserMessage, sendToAPI]
  );

  // ── Room selection ─────────────────────────────────────────────────────────

  const handleRoomSelect = useCallback(
    (room: RoomOption) => {
      markLastActedOn();
      pushUserMessage(
        `I'd like the **${room.label}** — ₹${room.price.toLocaleString("en-IN")}/night`
      );
      setContext((prev) => ({ ...prev, selectedRoom: room, bookingStep: "GUESTS" }));

      // Show guest selection as quick replies
      const guestOptions = Array.from(
        { length: room.capacity },
        (_, i) => `${i + 1} Guest${i > 0 ? "s" : ""}`
      );
      pushBotMessage(
        `Great choice! 🎉 **${room.label}** it is.\n\nHow many guests will be staying?`,
        guestOptions
      );
    },
    [markLastActedOn, pushUserMessage, pushBotMessage]
  );

  // ── Guest count selection ──────────────────────────────────────────────────

  const handleGuestSelect = useCallback(
    (guestLabel: string) => {
      const guests = parseInt(guestLabel);
      const room = context.selectedRoom;
      if (!room || !context.checkIn || !context.checkOut) return;

      markLastActedOn();
      pushUserMessage(guestLabel);

      const nights = nightsBetween(context.checkIn, context.checkOut);
      const total = room.price * nights;
      const bookingUrl = `/book/${
        "the-urban-escape-bhilai"
      }/${room.id}?checkIn=${context.checkIn}&checkOut=${context.checkOut}&guests=${guests}`;

      setContext((prev) => ({ ...prev, guests, bookingStep: "CONFIRM" }));

      pushBotMessage(
        `📋 **Booking Summary**\n\n🏡 ${room.label}\n📅 ${formatDate(context.checkIn!)} → ${formatDate(context.checkOut!)} · ${nights} night${nights > 1 ? "s" : ""}\n👥 ${guests} Guest${guests > 1 ? "s" : ""}\n💰 Room rent: ₹${total.toLocaleString("en-IN")} + GST\n\nReady to complete your booking?`,
        undefined,
        { type: "BOOKING_LINK", url: bookingUrl, label: "Complete Booking →" }
      );
    },
    [context, markLastActedOn, pushUserMessage, pushBotMessage]
  );

  // ── Quick reply handler ────────────────────────────────────────────────────

  const handleQuickReply = useCallback(
    (reply: string) => {
      // Guest selection step
      if (context.bookingStep === "GUESTS" && /^\d+\s+Guest/.test(reply)) {
        handleGuestSelect(reply);
        return;
      }
      // "Try Other Dates" after no-availability result
      if (reply === "Try Other Dates") {
        markLastActedOn();
        pushBotMessage("No problem! Please pick new dates:", undefined, { type: "DATE_PICKER" });
        return;
      }
      // Generic quick replies → send to API as normal message
      markLastActedOn();
      pushUserMessage(reply);
      sendToAPI(reply);
    },
    [context, handleGuestSelect, markLastActedOn, pushBotMessage, pushUserMessage, sendToAPI]
  );

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Floating action button ─────────────────────────────────────────── */}
      <div className="fixed bottom-6 right-6 z-[60] flex flex-col items-end gap-2">
        {/* Unread dot */}
        <AnimatePresence>
          {hasUnread && !open && (
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 rounded-full border-2 border-[#071209] z-10 pointer-events-none"
            />
          )}
        </AnimatePresence>

        <motion.button
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.93 }}
          onClick={() => setOpen((v) => !v)}
          className="w-14 h-14 bg-amber-500 hover:bg-amber-400 text-black rounded-full flex items-center justify-center shadow-2xl shadow-amber-500/40 transition-colors relative"
          aria-label="Open resort chat"
        >
          <AnimatePresence mode="wait">
            {open ? (
              <motion.span key="close"
                initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.14 }}>
                <X className="w-6 h-6" />
              </motion.span>
            ) : (
              <motion.span key="chat"
                initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: -90, opacity: 0 }} transition={{ duration: 0.14 }}>
                <MessageCircle className="w-6 h-6" />
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>
      </div>

      {/* ── Chat window ───────────────────────────────────────────────────── */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="chat-window"
            initial={{ opacity: 0, y: 24, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.94 }}
            transition={{ duration: 0.22, ease: [0.21, 0.47, 0.32, 0.98] }}
            className="fixed bottom-24 right-6 z-[60] flex flex-col"
            style={{
              width: "min(92vw, 380px)",
              height: "min(72vh, 540px)",
              background: "linear-gradient(160deg, rgba(10,24,12,0.97) 0%, rgba(7,18,9,0.99) 100%)",
              backdropFilter: "blur(24px) saturate(180%)",
              WebkitBackdropFilter: "blur(24px) saturate(180%)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "1.5rem",
              boxShadow: "0 24px 80px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.12)",
            }}
          >
            {/* Top highlight */}
            <div className="absolute top-0 left-[15%] right-[15%] h-px bg-gradient-to-r from-transparent via-amber-400/50 to-transparent rounded-full pointer-events-none" />

            {/* ── Header ──────────────────────────────────────────────────── */}
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-white/8 shrink-0">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-base font-bold select-none"
                style={{ background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.25)", color: "#FCD34D" }}>
                🌿
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white leading-tight">Sangwari</p>
                <p className="text-[10px] text-green-400 flex items-center gap-1 mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />
                  Ask your Sangwari · Always here 🌿
                </p>
              </div>
              <button onClick={() => setOpen(false)}
                className="text-white/25 hover:text-white/60 transition-colors p-1">
                <ChevronDown className="w-5 h-5" />
              </button>
            </div>

            {/* ── Messages ─────────────────────────────────────────────────── */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 scroll-smooth">
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18 }}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div className={`max-w-[88%] ${msg.role === "bot" ? "w-full" : ""}`}>
                    {/* Bubble */}
                    <div
                      className={`px-3.5 py-2.5 text-sm leading-relaxed ${
                        msg.role === "user"
                          ? "bg-amber-500 text-black font-medium rounded-2xl rounded-br-sm ml-auto inline-block"
                          : "text-white/82 rounded-2xl rounded-bl-sm"
                      }`}
                      style={
                        msg.role === "bot"
                          ? {
                              background: "rgba(255,255,255,0.06)",
                              border: "1px solid rgba(255,255,255,0.09)",
                            }
                          : undefined
                      }
                    >
                      {renderText(msg.content)}
                    </div>

                    {/* ── Actions (shown until acted on) ─────────────────── */}
                    {!msg.actedOn && msg.role === "bot" && (
                      <>
                        {/* Date picker */}
                        {msg.action?.type === "DATE_PICKER" && (
                          <DatePickerWidget onSubmit={handleDatesSubmit} />
                        )}

                        {/* Room cards */}
                        {msg.action?.type === "SHOW_ROOMS" && (
                          <div className="space-y-1.5 mt-2">
                            {msg.action.rooms.map((room) => (
                              <RoomCard key={room.id} room={room} onSelect={handleRoomSelect} />
                            ))}
                          </div>
                        )}

                        {/* Booking link */}
                        {msg.action?.type === "BOOKING_LINK" && (
                          <Link
                            href={msg.action.url}
                            className="mt-2 flex items-center justify-center gap-2 w-full font-bold text-xs py-3 rounded-xl text-black transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-amber-500/20"
                            style={{ background: "#F59E0B" }}
                          >
                            {msg.action.label}
                          </Link>
                        )}

                        {/* Quick replies */}
                        {msg.quickReplies && msg.quickReplies.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {msg.quickReplies.map((qr) => (
                              <button
                                key={qr}
                                onClick={() => handleQuickReply(qr)}
                                className="text-[11px] px-3 py-1.5 rounded-full font-medium transition-all hover:scale-[1.03] active:scale-[0.97]"
                                style={{
                                  background: "rgba(245,158,11,0.1)",
                                  border: "1px solid rgba(245,158,11,0.25)",
                                  color: "#FCD34D",
                                }}
                              >
                                {qr}
                              </button>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </motion.div>
              ))}

              {/* Typing indicator */}
              {loading && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  <TypingIndicator />
                </motion.div>
              )}

              <div ref={bottomRef} />
            </div>

            {/* ── Input bar ──────────────────────────────────────────────── */}
            <div className="px-3 py-3 border-t border-white/8 shrink-0"
              style={{ background: "rgba(7,18,9,0.6)", backdropFilter: "blur(8px)" }}>
              <div className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage(input);
                    }
                  }}
                  placeholder="Ask about rooms, pricing, availability…"
                  disabled={loading}
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm placeholder:text-white/22 focus:outline-none focus:border-amber-400/30 transition-colors disabled:opacity-50"
                />
                <button
                  onClick={() => sendMessage(input)}
                  disabled={loading || !input.trim()}
                  className="w-9 h-9 bg-amber-500 hover:bg-amber-400 text-black rounded-xl flex items-center justify-center transition-all hover:scale-105 active:scale-95 disabled:opacity-35 shrink-0"
                  aria-label="Send message"
                >
                  {loading
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <Send className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-center text-[10px] text-white/12 mt-2 select-none">
                Powered by AI · Sangwari 🌿
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
