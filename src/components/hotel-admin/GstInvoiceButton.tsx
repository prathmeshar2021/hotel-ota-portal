"use client";

import { useState } from "react";
import { toast } from "sonner";
import { FileText, Download, Loader2, Send, CheckCircle2 } from "lucide-react";

interface Props {
  bookingId: string;
  invoiceNumber?: string | null;
  guestPhone?: string | null;
}

export default function GstInvoiceButton({ bookingId, invoiceNumber, guestPhone }: Props) {
  const [invNo, setInvNo] = useState<string | null>(invoiceNumber ?? null);
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);

  const pdfPath = `/api/invoices/${bookingId}/pdf`;

  async function generate() {
    setGenerating(true);
    try {
      const res = await fetch(`/api/hotel-admin/bookings/${bookingId}/invoice`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate invoice");
      setInvNo(data.invoiceNumber);
      toast.success(`GST invoice ${data.invoiceNumber} generated`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to generate invoice");
    } finally {
      setGenerating(false);
    }
  }

  async function sendWhatsApp() {
    setSending(true);
    try {
      const res = await fetch(`/api/hotel-admin/bookings/${bookingId}/invoice/send`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send");
      toast.success(data.message ?? "Invoice sent on WhatsApp");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send invoice");
    } finally {
      setSending(false);
    }
  }

  // Not generated yet → single generate button.
  if (!invNo) {
    return (
      <button
        onClick={generate}
        disabled={generating}
        className="w-full flex items-center justify-center gap-2 font-semibold px-4 py-2.5 rounded-xl border border-white/12 bg-white/5 text-white/75 hover:bg-white/10 hover:text-white transition-all disabled:opacity-50"
      >
        {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
        Generate GST Invoice
      </button>
    );
  }

  // Generated → show number + download + WhatsApp.
  return (
    <div className="rounded-xl border border-white/10 bg-white/3 p-3">
      <div className="flex items-center gap-2 text-xs text-white/55 mb-2.5">
        <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" />
        <span>GST invoice <span className="font-mono text-white/75">{invNo}</span></span>
      </div>
      <div className="flex gap-2">
        <a
          href={`${pdfPath}?download=1`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-white/5 border border-white/12 text-white/70 hover:bg-white/10 hover:text-white transition-all"
        >
          <Download className="w-3.5 h-3.5" /> Download PDF
        </a>
        <button
          onClick={sendWhatsApp}
          disabled={sending || !guestPhone}
          title={!guestPhone ? "Guest has no phone number" : "Send invoice on WhatsApp"}
          className="flex-1 flex items-center justify-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg bg-green-600 hover:bg-green-500 text-white transition-all disabled:opacity-50"
        >
          {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          Send on WhatsApp
        </button>
      </div>
    </div>
  );
}
