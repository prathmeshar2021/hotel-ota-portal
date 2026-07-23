"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { uploadIdPhoto } from "@/lib/kiosk/upload";
import {
  UserPlus, Loader2, Upload, Check, Copy, KeyRound, UserCheck, UserX, ShieldCheck, IdCard,
} from "lucide-react";

interface Staff {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  idPhotoUrl: string | null;
  createdAt: string;
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center justify-between gap-3 bg-black/30 border border-amber-500/20 rounded-lg px-3 py-2">
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-amber-400/60">{label}</p>
        <p className="text-sm font-mono text-white truncate">{value}</p>
      </div>
      <button
        onClick={() => {
          navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="shrink-0 p-1.5 rounded-md bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-all"
        title="Copy"
      >
        {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
      </button>
    </div>
  );
}

export default function StaffManagerClient({ initialStaff }: { initialStaff: Staff[] }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [idPhotoUrl, setIdPhotoUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Credentials to display once (after create or reset).
  const [creds, setCreds] = useState<{ userId?: string; password: string; forName: string } | null>(null);

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const url = await uploadIdPhoto(file);
      setIdPhotoUrl(url);
      toast.success("ID document uploaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function createStaff() {
    if (name.trim().length < 2) {
      toast.error("Enter the staff member's name");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/admin/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), idPhotoUrl: idPhotoUrl || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create staff");
      setCreds({ userId: data.credentials.userId, password: data.credentials.password, forName: data.staff.name });
      setName("");
      setIdPhotoUrl("");
      if (fileRef.current) fileRef.current.value = "";
      toast.success("Staff account created");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create staff");
    } finally {
      setCreating(false);
    }
  }

  async function manage(id: string, action: "reset" | "activate" | "deactivate", staffName: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/staff/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Action failed");
      if (action === "reset") {
        setCreds({ password: data.credentials.password, forName: staffName });
        toast.success("New password generated");
      } else {
        toast.success(action === "activate" ? "Staff re-activated" : "Staff deactivated");
      }
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <ShieldCheck className="w-6 h-6 text-amber-400" />
        <h1 className="text-2xl font-bold text-white">Staff Accounts</h1>
      </div>

      {/* Credentials panel — shown once after create/reset */}
      {creds && (
        <div className="mb-6 rounded-2xl border border-amber-500/30 bg-amber-500/[0.06] p-4">
          <div className="flex items-center gap-2 mb-3">
            <KeyRound className="w-4 h-4 text-amber-400" />
            <p className="text-sm font-semibold text-amber-300">
              Login details for {creds.forName} — save these now, they won&apos;t be shown again
            </p>
          </div>
          <div className="grid sm:grid-cols-2 gap-2">
            {creds.userId && <CopyField label="User ID" value={creds.userId} />}
            <CopyField label="Password" value={creds.password} />
          </div>
          <button
            onClick={() => setCreds(null)}
            className="mt-3 text-xs text-white/50 hover:text-white/80 transition-colors"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Create form */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 mb-8">
        <h2 className="text-sm font-semibold text-white/80 mb-4 flex items-center gap-2">
          <UserPlus className="w-4 h-4 text-blue-400" /> Register New Staff
        </h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-[11px] font-semibold text-white/40 uppercase tracking-wider mb-1.5">
              Staff Name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Rahul Sharma"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder:text-white/25 text-sm focus:outline-none focus:border-blue-400/50"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-white/40 uppercase tracking-wider mb-1.5">
              ID Document
            </label>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="w-full flex items-center justify-center gap-2 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white/70 hover:bg-white/10 hover:text-white transition-all disabled:opacity-50"
            >
              {uploading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : idPhotoUrl ? (
                <Check className="w-4 h-4 text-green-400" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              {idPhotoUrl ? "ID uploaded" : "Upload ID"}
            </button>
          </div>
        </div>
        <button
          onClick={createStaff}
          disabled={creating}
          className="mt-4 flex items-center justify-center gap-2 bg-blue-500 hover:bg-blue-400 text-white font-semibold text-sm px-5 py-2.5 rounded-xl transition-all disabled:opacity-50"
        >
          {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
          Create Account
        </button>
      </div>

      {/* Staff list */}
      <h2 className="text-sm font-semibold text-white/60 mb-3">
        Existing Staff ({initialStaff.length})
      </h2>
      <div className="space-y-2">
        {initialStaff.length === 0 && (
          <p className="text-sm text-white/30 italic py-4">No staff accounts yet.</p>
        )}
        {initialStaff.map((s) => (
          <div
            key={s.id}
            className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.02] px-4 py-3"
          >
            {s.idPhotoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={s.idPhotoUrl} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0" />
            ) : (
              <div className="w-9 h-9 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                <IdCard className="w-4 h-4 text-white/30" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-white truncate">{s.name}</p>
                {!s.isActive && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/25">
                    Disabled
                  </span>
                )}
              </div>
              <p className="text-xs text-white/40 font-mono truncate">{s.email}</p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => manage(s.id, "reset", s.name)}
                disabled={busyId === s.id}
                title="Reset password"
                className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/60 hover:bg-white/10 hover:text-white transition-all disabled:opacity-50"
              >
                <KeyRound className="w-3.5 h-3.5" /> Reset
              </button>
              {s.isActive ? (
                <button
                  onClick={() => manage(s.id, "deactivate", s.name)}
                  disabled={busyId === s.id}
                  title="Deactivate"
                  className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-white/50 hover:text-red-400 hover:border-red-500/30 transition-all disabled:opacity-50"
                >
                  <UserX className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button
                  onClick={() => manage(s.id, "activate", s.name)}
                  disabled={busyId === s.id}
                  title="Re-activate"
                  className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-white/50 hover:text-green-400 hover:border-green-500/30 transition-all disabled:opacity-50"
                >
                  <UserCheck className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
