"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Send, Loader2, ArrowLeft, CheckCheck, X, Check } from "lucide-react";
import { isToday, isYesterday } from "date-fns";
import { fmtIST } from "@/lib/utils/datetime";
import Link from "next/link";

interface Message {
  id: string;
  senderRole: string;
  senderName: string;
  body: string;
  isRead: boolean;
  createdAt: string;
}

interface Thread {
  id: string;
  status: string;
  guest: { name: string; phone: string | null; email: string | null };
  messages: Message[];
}

function formatTime(iso: string) {
  const d = new Date(iso);
  if (isToday(d)) return fmtIST(d, "h:mm a");
  if (isYesterday(d)) return `Yesterday ${fmtIST(d, "h:mm a")}`;
  return fmtIST(d, "dd MMM, h:mm a");
}

export default function HotelAdminThreadPage() {
  const { threadId } = useParams<{ threadId: string }>();
  const router = useRouter();
  const [thread, setThread] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [togglingStatus, setTogglingStatus] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    fetch(`/api/hotel-admin/support/${threadId}`)
      .then((r) => r.json())
      .then((t: Thread) => {
        setThread(t);
        setMessages(t.messages);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [threadId]);

  useEffect(() => {
    if (!thread) return;
    pollRef.current = setInterval(async () => {
      const last = messages[messages.length - 1]?.createdAt ?? new Date(0).toISOString();
      const res = await fetch(
        `/api/hotel-admin/support/${threadId}?after=${encodeURIComponent(last)}`
      );
      if (!res.ok) return;
      const newer: Message[] = await res.json();
      if (newer.length > 0) {
        setMessages((prev) => {
          const ids = new Set(prev.map((m) => m.id));
          return [...prev, ...newer.filter((m) => !ids.has(m.id))];
        });
      }
    }, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [thread, messages, threadId]);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  async function send() {
    if (!input.trim() || !thread || sending) return;
    const body = input.trim();
    setInput("");
    setSending(true);
    try {
      const res = await fetch(`/api/hotel-admin/support/${threadId}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (res.ok) {
        const msg: Message = await res.json();
        setMessages((prev) => [...prev, msg]);
      }
    } finally {
      setSending(false);
    }
  }

  async function toggleStatus() {
    if (!thread) return;
    const next = thread.status === "OPEN" ? "CLOSED" : "OPEN";
    setTogglingStatus(true);
    await fetch(`/api/hotel-admin/support/${threadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    setThread((t) => t ? { ...t, status: next } : t);
    setTogglingStatus(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
      </div>
    );
  }

  if (!thread) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-white/50">Thread not found.</p>
        <Link href="/hotel-admin/support" className="text-blue-400 text-sm underline">← Back</Link>
      </div>
    );
  }

  const isClosed = thread.status === "CLOSED";

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 64px)" }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-white/8 shrink-0">
        <button onClick={() => router.push("/hotel-admin/support")} className="text-white/40 hover:text-white transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <p className="font-semibold text-white text-sm">{thread.guest.name}</p>
          <p className="text-xs text-white/35">
            {[thread.guest.phone && `📞 ${thread.guest.phone}`, thread.guest.email].filter(Boolean).join(" · ")}
          </p>
        </div>
        <button
          onClick={toggleStatus}
          disabled={togglingStatus}
          className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl border transition-all ${
            isClosed
              ? "bg-green-500/10 text-green-400 border-green-500/20 hover:bg-green-500/15"
              : "bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/15"
          }`}
        >
          {togglingStatus ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : isClosed ? (
            <Check className="w-3.5 h-3.5" />
          ) : (
            <X className="w-3.5 h-3.5" />
          )}
          {isClosed ? "Reopen" : "Close"}
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-3 min-h-0">
        {messages.length === 0 && (
          <div className="text-center py-12">
            <p className="text-white/30 text-sm">No messages yet.</p>
          </div>
        )}
        {messages.map((m) => {
          const isStaff = m.senderRole === "STAFF";
          return (
            <div key={m.id} className={`flex ${isStaff ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[75%] flex flex-col gap-0.5 ${isStaff ? "items-end" : "items-start"}`}>
                {!isStaff && (
                  <span className="text-[10px] text-white/30 px-1">{m.senderName}</span>
                )}
                <div
                  className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                    isStaff
                      ? "bg-blue-500 text-white rounded-br-sm"
                      : "bg-white/8 border border-white/10 text-white/85 rounded-bl-sm"
                  }`}
                >
                  {m.body}
                </div>
                <div className={`flex items-center gap-1 px-1 ${isStaff ? "flex-row-reverse" : ""}`}>
                  <span className="text-[10px] text-white/25">{formatTime(m.createdAt)}</span>
                  {isStaff && (
                    <CheckCheck className={`w-3 h-3 ${m.isRead ? "text-blue-400" : "text-white/20"}`} />
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Reply bar */}
      <div className="shrink-0 border-t border-white/8 px-4 py-3">
        {isClosed ? (
          <p className="text-center text-xs text-white/30 py-2">
            Thread is closed. Reopen it to send a reply.
          </p>
        ) : (
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
              }}
              placeholder="Reply to guest…"
              rows={1}
              className="flex-1 bg-white/5 border border-white/10 rounded-2xl px-4 py-2.5 text-sm text-white placeholder:text-white/25 resize-none focus:outline-none focus:border-blue-400/40 max-h-32"
              style={{ fieldSizing: "content" } as React.CSSProperties}
            />
            <button
              onClick={send}
              disabled={!input.trim() || sending}
              className="w-10 h-10 rounded-full bg-blue-500 hover:bg-blue-400 disabled:opacity-40 flex items-center justify-center transition-all shrink-0"
            >
              {sending ? (
                <Loader2 className="w-4 h-4 text-white animate-spin" />
              ) : (
                <Send className="w-4 h-4 text-white" />
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
