"use client";

import { useState, useRef, useEffect } from "react";
import { Search, Loader2, UserCheck } from "lucide-react";

export interface GuestResult {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  idType: string | null;
  idNumber: string | null;
  idFrontUrl: string | null;
  idBackUrl: string | null;
}

/** Type-ahead search over returning guests; on pick, calls onSelect to pre-fill. */
export default function GuestSearch({
  onSelect,
  placeholder,
}: {
  onSelect: (g: GuestResult) => void;
  placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<GuestResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/hotel-admin/guests/search?q=${encodeURIComponent(q.trim())}`);
        const data = await res.json();
        setResults(data.guests ?? []);
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [q]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function pick(g: GuestResult) {
    onSelect(g);
    setQ("");
    setResults([]);
    setOpen(false);
  }

  return (
    <div ref={boxRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder={placeholder ?? "Search returning guest by name, phone or ID…"}
          className="w-full bg-white/5 border border-white/12 rounded-xl pl-9 pr-9 py-2.5 text-white placeholder:text-white/25 text-sm focus:outline-none focus:border-amber-400/50"
        />
        {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 animate-spin" />}
      </div>
      {open && (
        <div className="absolute z-20 left-0 right-0 mt-1 bg-[#0d1a0e] border border-white/12 rounded-xl shadow-2xl max-h-64 overflow-y-auto">
          {results.length === 0 ? (
            <p className="px-3 py-3 text-xs text-white/40">
              No returning guest found — enter details below to register a new guest.
            </p>
          ) : (
            results.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => pick(g)}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-white/5 text-left border-b border-white/5 last:border-0"
              >
                <UserCheck className="w-4 h-4 text-green-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm text-white font-medium truncate">{g.name}</p>
                  <p className="text-[11px] text-white/40 truncate">
                    {g.phone ? `+91 ${g.phone}` : "no phone"}
                    {g.idNumber ? ` · ${g.idType ?? "ID"}: ${g.idNumber}` : ""}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
