"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Send, Loader2, MessageCircle, CheckCheck } from "lucide-react";
import { format, isToday, isYesterday } from "date-fns";

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
  messages: Message[];
}

function formatTime(iso: string) {
  const d = new Date(iso);
  if (isToday(d)) return format(d, "h:mm a");
  if (isYesterday(d)) return `Yesterday ${format(d, "h:mm a")}`;
  return format(d, "dd MMM, h:mm a");
}

export default function SupportChat({ guestName }: { guestName: string }) {
  const [thread, setThread] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  // Initial load
  useEffect(() => {
    fetch("/api/support")
      .then((r) => r.json())
      .then((t: Thread) => {
        setThread(t);
        setMessages(t.messages);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Poll for new messages every 3s
  useEffect(() => {
    if (!thread) return;
    pollRef.current = setInterval(async () => {
      const last = messages[messages.length - 1]?.createdAt ?? new Date(0).toISOString();
      const res = await fetch(`/api/support/messages?threadId=${thread.id}&after=${encodeURIComponent(last)}`);
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
  }, [thread, messages]);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  async function send() {
    if (!input.trim() || !thread || sending) return;
    const body = input.trim();
    setInput("");
    setSending(true);
    try {
      const res = await fetch("/api/support/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: thread.id, body }),
      });
      if (res.ok) {
        const msg: Message = await res.json();
        setMessages((prev) => [...prev, msg]);
      }
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-amber-400 animate-spin" />
      </div>
    );
  }

  const isClosed = thread?.status === "CLOSED";

  return (
    <div className="flex-1 flex flex-col min-h-0 glass-card rounded-3xl overflow-hidden">
      {/* Chat header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-white/8 shrink-0">
        <div className="w-9 h-9 rounded-full bg-amber-500/15 border border-amber-500/25 flex items-center justify-center">
          <MessageCircle className="w-4 h-4 text-amber-400" />
        </div>
        <div>
          <p className="text-sm font-semibold text-white">The Urban Escape</p>
          <p className="text-xs text-white/35">Hotel Support Team</p>
        </div>
        {isClosed && (
          <span className="ml-auto text-xs font-semibold bg-white/8 border border-white/10 text-white/40 px-2.5 py-1 rounded-full">
            Closed
          </span>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-3 min-h-0">
        {messages.length === 0 && (
          <div className="text-center py-12">
            <MessageCircle className="w-10 h-10 text-white/10 mx-auto mb-3" />
            <p className="text-white/30 text-sm">No messages yet.</p>
            <p className="text-white/20 text-xs mt-1">Start a conversation — we're here to help!</p>
          </div>
        )}
        {messages.map((m) => {
          const isMe = m.senderRole === "CUSTOMER";
          return (
            <div key={m.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[78%] ${isMe ? "items-end" : "items-start"} flex flex-col gap-0.5`}>
                {!isMe && (
                  <span className="text-[10px] text-white/30 px-1">{m.senderName}</span>
                )}
                <div
                  className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                    isMe
                      ? "bg-amber-500 text-black rounded-br-sm"
                      : "bg-white/8 border border-white/10 text-white/85 rounded-bl-sm"
                  }`}
                >
                  {m.body}
                </div>
                <div className={`flex items-center gap-1 px-1 ${isMe ? "flex-row-reverse" : ""}`}>
                  <span className="text-[10px] text-white/25">{formatTime(m.createdAt)}</span>
                  {isMe && (
                    <CheckCheck className={`w-3 h-3 ${m.isRead ? "text-amber-400" : "text-white/20"}`} />
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="shrink-0 border-t border-white/8 px-4 py-3">
        {isClosed ? (
          <p className="text-center text-xs text-white/30 py-2">
            This conversation has been closed by the hotel team.
          </p>
        ) : (
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
              }}
              placeholder="Type a message…"
              rows={1}
              className="flex-1 bg-white/5 border border-white/10 rounded-2xl px-4 py-2.5 text-sm text-white placeholder:text-white/25 resize-none focus:outline-none focus:border-amber-400/40 max-h-32"
              style={{ fieldSizing: "content" } as React.CSSProperties}
            />
            <button
              onClick={send}
              disabled={!input.trim() || sending}
              className="w-10 h-10 rounded-full bg-amber-500 hover:bg-amber-400 disabled:opacity-40 flex items-center justify-center transition-all shrink-0"
            >
              {sending ? (
                <Loader2 className="w-4 h-4 text-black animate-spin" />
              ) : (
                <Send className="w-4 h-4 text-black" />
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
