"use client";

import { useCallback, useEffect, useState } from "react";
import { MonitorSmartphone, Plus, Loader2, Trash2, Copy, Check, KeyRound } from "lucide-react";

interface KioskDevice {
  id: string;
  name: string;
  isActive: boolean;
  pairedAt: string;
  lastSeenAt: string | null;
}

interface PairingCode {
  code: string;
  name: string;
  expiresAt: string;
  ttlMinutes: number;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

export default function KioskAdminClient() {
  const [devices, setDevices] = useState<KioskDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [pairing, setPairing] = useState<PairingCode | null>(null);
  const [copied, setCopied] = useState(false);
  const [exitPinSet, setExitPinSet] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinSaving, setPinSaving] = useState(false);
  const [pinMsg, setPinMsg] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/hotel-admin/kiosk");
    if (res.status === 401 || res.status === 403) {
      setUnauthorized(true);
      setLoading(false);
      return;
    }
    const data = await res.json();
    setDevices(data.devices ?? []);
    setExitPinSet(!!data.exitPinSet);
    setLoading(false);
  }, []);

  async function savePin(clear = false) {
    setPinSaving(true);
    setPinMsg("");
    const res = await fetch("/api/hotel-admin/kiosk", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin: clear ? "" : pinInput }),
    });
    setPinSaving(false);
    const data = await res.json();
    if (!res.ok) { setPinMsg(data.error ?? "Failed to save PIN."); return; }
    setExitPinSet(data.exitPinSet);
    setPinInput("");
    setPinMsg(clear ? "PIN cleared." : "PIN saved.");
  }

  // load() only sets state after an awaited fetch, not synchronously.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  async function generateCode() {
    setGenerating(true);
    const res = await fetch("/api/hotel-admin/kiosk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Reception Kiosk" }),
    });
    setGenerating(false);
    if (res.ok) {
      setPairing(await res.json());
      setCopied(false);
      load();
    }
  }

  async function deactivate(id: string) {
    if (!confirm("Revoke this device? Its tablet will stop working immediately.")) return;
    const res = await fetch(`/api/hotel-admin/kiosk/${id}`, { method: "DELETE" });
    if (res.ok) load();
  }

  if (unauthorized) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="bg-white/5 border border-white/10 rounded-2xl p-8 text-center">
          <MonitorSmartphone className="w-10 h-10 text-white/30 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-white mb-2">Kiosk Devices</h1>
          <p className="text-white/50">Only super admins can manage kiosk devices.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2.5">
            <MonitorSmartphone className="w-6 h-6 text-amber-400" /> Kiosk Devices
          </h1>
          <p className="text-white/45 text-sm mt-1">Pair reception tablets for guest self check-in.</p>
        </div>
        <button
          onClick={generateCode}
          disabled={generating}
          className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-bold px-4 py-2.5 rounded-xl text-sm transition-colors"
        >
          {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Pair New Device
        </button>
      </div>

      {/* Pairing code panel */}
      {pairing && (
        <div className="bg-amber-500/8 border border-amber-400/25 rounded-2xl p-6 mb-6 text-center">
          <p className="text-amber-300/80 text-xs font-bold uppercase tracking-wider mb-3">
            Enter this code on the tablet at /kiosk/pair
          </p>
          <div className="flex items-center justify-center gap-3">
            <span className="text-4xl font-bold text-white tracking-[0.3em] tabular-nums">{pairing.code}</span>
            <button
              onClick={() => { navigator.clipboard.writeText(pairing.code); setCopied(true); }}
              className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 transition-colors"
              aria-label="Copy code"
            >
              {copied ? <Check className="w-5 h-5 text-green-400" /> : <Copy className="w-5 h-5" />}
            </button>
          </div>
          <p className="text-white/35 text-xs mt-3">
            Valid for {pairing.ttlMinutes} minutes · single use
          </p>
        </div>
      )}

      {/* Device list */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-amber-400 animate-spin" /></div>
      ) : devices.length === 0 ? (
        <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-10 text-center">
          <p className="text-white/40">No devices paired yet. Click “Pair New Device” to start.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {devices.map((d) => (
            <div key={d.id} className="flex items-center justify-between bg-white/[0.03] border border-white/8 rounded-2xl p-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${d.isActive ? "bg-green-400" : "bg-white/20"}`} />
                <div className="min-w-0">
                  <p className="text-white font-semibold text-sm truncate">
                    {d.name} {!d.isActive && <span className="text-white/30 font-normal">(revoked)</span>}
                  </p>
                  <p className="text-white/35 text-xs">
                    Paired {timeAgo(d.pairedAt)} · last seen {timeAgo(d.lastSeenAt)}
                  </p>
                </div>
              </div>
              {d.isActive && (
                <button
                  onClick={() => deactivate(d.id)}
                  className="flex items-center gap-1.5 text-red-300/80 hover:text-red-300 hover:bg-red-500/10 px-3 py-2 rounded-lg text-xs font-semibold transition-colors shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Revoke
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Staff-exit PIN */}
      <div className="mt-8 bg-white/[0.03] border border-white/8 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-1">
          <KeyRound className="w-4 h-4 text-amber-400" />
          <h2 className="font-bold text-white">Staff-exit PIN</h2>
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${exitPinSet ? "bg-green-500/15 text-green-400" : "bg-white/8 text-white/40"}`}>
            {exitPinSet ? "Set" : "Not set"}
          </span>
        </div>
        <p className="text-white/40 text-sm mb-4">
          Required to leave kiosk mode (5 taps on the top-left corner). If unset, staff can exit without a PIN.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value.replace(/\D/g, "").slice(0, 8))}
            inputMode="numeric"
            placeholder="4–8 digits"
            className="h-11 w-40 rounded-xl bg-white/5 border border-white/12 px-4 text-white tracking-widest focus:outline-none focus:border-amber-400/40"
          />
          <button
            onClick={() => savePin(false)}
            disabled={pinSaving || pinInput.length < 4}
            className="h-11 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black font-bold text-sm"
          >
            {exitPinSet ? "Update PIN" : "Set PIN"}
          </button>
          {exitPinSet && (
            <button
              onClick={() => savePin(true)}
              disabled={pinSaving}
              className="h-11 px-4 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 text-sm font-semibold"
            >
              Clear
            </button>
          )}
          {pinMsg && <span className="text-sm text-white/50">{pinMsg}</span>}
        </div>
      </div>
    </div>
  );
}
