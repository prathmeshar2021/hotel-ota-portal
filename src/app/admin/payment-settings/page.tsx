"use client";

import { useEffect, useState } from "react";
import { CreditCard, Banknote, SplitSquareHorizontal, Lock, Loader2, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

interface Settings {
  allowPayAtHotel: boolean;
  allowPartialPay: boolean;
}

export default function PaymentSettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/admin/payment-settings")
      .then((r) => r.json())
      .then((d) => setSettings(d))
      .catch(() => toast.error("Failed to load settings"));
  }, []);

  async function toggle(key: keyof Settings) {
    if (!settings) return;
    const next = { ...settings, [key]: !settings[key] };
    setSettings(next);
    setSaving(true);
    try {
      const res = await fetch("/api/admin/payment-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!res.ok) throw new Error();
      toast.success("Payment settings saved");
    } catch {
      toast.error("Failed to save settings");
      setSettings(settings); // revert
    } finally {
      setSaving(false);
    }
  }

  const options = [
    {
      key: "PAY_FULL" as const,
      label: "Pay Full Amount Now",
      sub: "Customer pays the complete booking amount online via Razorpay (UPI, cards, net banking).",
      icon: CreditCard,
      color: "text-green-400",
      bgColor: "bg-green-500/10",
      borderColor: "border-green-500/20",
      locked: true,
      enabled: true,
    },
    {
      key: "allowPartialPay" as const,
      label: "Pay Partial Amount Now",
      sub: "Customer pays ₹500 booking advance online now. Balance is collected at the hotel. The ₹500 is subject to the cancellation policy.",
      icon: SplitSquareHorizontal,
      color: "text-blue-400",
      bgColor: "bg-blue-500/10",
      borderColor: "border-blue-500/20",
      locked: false,
      enabled: settings?.allowPartialPay ?? false,
    },
    {
      key: "allowPayAtHotel" as const,
      label: "Pay at Hotel",
      sub: "Customer reserves the room without any online payment. Full amount collected at check-in (cash or UPI).",
      icon: Banknote,
      color: "text-amber-400",
      bgColor: "bg-amber-500/10",
      borderColor: "border-amber-500/20",
      locked: false,
      enabled: settings?.allowPayAtHotel ?? false,
    },
  ];

  return (
    <div className="max-w-2xl mx-auto py-10 px-4">
      <Link
        href="/admin/dashboard"
        className="inline-flex items-center gap-2 text-sm text-white/40 hover:text-white mb-8 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Dashboard
      </Link>

      <div className="flex items-center gap-3 mb-2">
        <CreditCard className="w-6 h-6 text-amber-400" />
        <h1 className="text-xl font-bold text-white">Payment Options</h1>
        {saving && <Loader2 className="w-4 h-4 text-white/40 animate-spin ml-1" />}
      </div>
      <p className="text-sm text-white/40 mb-8">
        Control which payment methods customers can choose when booking online.
        "Pay Full Now" is always available and cannot be disabled.
      </p>

      {!settings ? (
        <div className="flex items-center gap-3 text-white/40">
          <Loader2 className="w-5 h-5 animate-spin" /> Loading…
        </div>
      ) : (
        <div className="space-y-4">
          {options.map((opt) => {
            const Icon = opt.icon;
            const isOn = opt.locked ? true : (settings[opt.key as keyof Settings] as boolean);
            return (
              <div
                key={opt.key}
                onClick={() => {
                  if (!opt.locked && !saving) toggle(opt.key as keyof Settings);
                }}
                className={`glass-card rounded-2xl p-5 flex items-start gap-4 transition-all ${
                  opt.locked ? "opacity-80" : "cursor-pointer hover:border-white/15"
                } ${isOn ? `border ${opt.borderColor} ${opt.bgColor}` : "border border-white/8"}`}
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isOn ? opt.bgColor : "bg-white/5"}`}>
                  <Icon className={`w-5 h-5 ${isOn ? opt.color : "text-white/25"}`} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`font-semibold text-sm ${isOn ? "text-white" : "text-white/50"}`}>
                      {opt.label}
                    </span>
                    {opt.locked && (
                      <span className="flex items-center gap-1 text-[10px] font-bold text-white/30 bg-white/5 border border-white/10 rounded-full px-2 py-0.5">
                        <Lock className="w-2.5 h-2.5" /> Always on
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-white/40">{opt.sub}</p>
                </div>

                {/* Toggle */}
                {!opt.locked && (
                  <div className={`relative shrink-0 w-11 h-6 rounded-full transition-colors ${isOn ? "bg-amber-400" : "bg-white/10"}`}>
                    <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${isOn ? "translate-x-5" : "translate-x-0.5"}`} />
                  </div>
                )}
                {opt.locked && (
                  <CheckCircle className="w-5 h-5 text-green-400 shrink-0 mt-0.5" />
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-8 text-xs text-white/25">
        Changes take effect immediately for new bookings. Existing bookings are not affected.
      </p>
    </div>
  );
}
