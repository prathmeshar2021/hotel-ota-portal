"use client";

import { useState } from "react";
import { Settings2, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

export default function SeedRoomsButton() {
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleSeed() {
    if (state === "loading") return;
    setState("loading");
    setMessage("");

    try {
      const res = await fetch("/api/hotel-admin/rooms/seed", { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        setState("error");
        setMessage(data.error ?? "Seed failed");
        return;
      }

      setState("success");
      setMessage(data.message ?? "Rooms set up successfully");

      // Reload to reflect new rooms
      setTimeout(() => window.location.reload(), 1800);
    } catch {
      setState("error");
      setMessage("Network error — try again");
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={handleSeed}
        disabled={state === "loading" || state === "success"}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all
          border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white/90
          disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {state === "loading" ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Settings2 className="w-3.5 h-3.5" />
        )}
        {state === "loading" ? "Setting up…" : "Setup Room Categories"}
      </button>

      {state === "success" && (
        <span className="flex items-center gap-1.5 text-xs text-emerald-400">
          <CheckCircle2 className="w-3.5 h-3.5" />
          {message}
        </span>
      )}
      {state === "error" && (
        <span className="flex items-center gap-1.5 text-xs text-red-400">
          <AlertCircle className="w-3.5 h-3.5" />
          {message}
        </span>
      )}
    </div>
  );
}
