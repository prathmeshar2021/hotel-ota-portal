import type { Metadata } from "next";
import { MapPin, Phone, Mail, Clock, Building2 } from "lucide-react";
import LegalShell, { Section, P } from "@/components/customer/LegalShell";
import { BUSINESS } from "@/lib/constants/business";

export const metadata: Metadata = {
  title: "Contact Us",
  description: `Get in touch with ${BUSINESS.brand}, ${BUSINESS.city}.`,
};

export default function ContactPage() {
  const cards = [
    {
      icon: <MapPin className="w-5 h-5 text-amber-400" />,
      label: "Address",
      value: (
        <>
          {BUSINESS.addressLines.map((l) => (
            <span key={l} className="block">{l}</span>
          ))}
        </>
      ),
    },
    {
      icon: <Phone className="w-5 h-5 text-amber-400" />,
      label: "Phone",
      value: (
        <a href={BUSINESS.phoneHref} className="text-amber-300 hover:text-amber-200 font-semibold">
          {BUSINESS.phone}
        </a>
      ),
    },
    {
      icon: <Mail className="w-5 h-5 text-amber-400" />,
      label: "Email",
      value: (
        <a href={BUSINESS.emailHref} className="text-amber-300 hover:text-amber-200 break-all">
          {BUSINESS.email}
        </a>
      ),
    },
    {
      icon: <Clock className="w-5 h-5 text-amber-400" />,
      label: "Timings",
      value: (
        <>
          <span className="block">Check-in: {BUSINESS.checkInTime}</span>
          <span className="block">Check-out: {BUSINESS.checkOutTime}</span>
        </>
      ),
    },
  ];

  return (
    <LegalShell title="Contact Us" subtitle="We're happy to help with bookings and enquiries.">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="flex items-start gap-3 bg-white/3 border border-white/8 rounded-2xl p-4">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
              {c.icon}
            </div>
            <div>
              <p className="text-white/40 text-xs uppercase tracking-wider mb-1">{c.label}</p>
              <div className="text-white/75 text-sm leading-relaxed">{c.value}</div>
            </div>
          </div>
        ))}
      </div>

      <Section title="Business Details">
        <div className="flex items-start gap-3">
          <Building2 className="w-4 h-4 text-amber-400/70 shrink-0 mt-0.5" />
          <P>
            {BUSINESS.brand} is operated by {BUSINESS.legalName} ({BUSINESS.entityType}),{" "}
            {BUSINESS.addressLines.join(", ")}.
          </P>
        </div>
      </Section>
    </LegalShell>
  );
}
