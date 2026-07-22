export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db/prisma";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { FileText, ShieldCheck, CheckCircle2, Calendar, User } from "lucide-react";
import ConsentAcceptButton from "@/components/customer/ConsentAcceptButton";

export default async function ConsentAcceptPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const consent = await prisma.consent.findFirst({
    where: { consentToken: token },
    select: {
      bookingId: true,
      status: true,
      primaryAcceptedAt: true,
      booking: {
        select: {
          bookingRef: true,
          checkInDate: true,
          checkOutDate: true,
          noOfNights: true,
          noOfPersons: true,
          hotel: { select: { name: true, city: true, state: true, phone: true, email: true } },
          primaryGuest: { select: { name: true } },
        },
      },
    },
  });

  if (!consent) notFound();

  const b = consent.booking;
  const accepted = !!consent.primaryAcceptedAt;
  const pdfHref = `/api/consent/${consent.bookingId}/pdf?t=${token}`;

  const declarations = [
    "The information provided in my registration is true and correct.",
    "I consent to the hotel collecting and processing my personal data (including ID proof) for guest registration, safety, billing and legal compliance under the DPDP Act, 2023.",
    "I consent to the hotel sharing this information with police / government authorities as required by law.",
    "I agree to abide by the hotel's rules and check-out time, and I am responsible for all accompanying guests.",
    "My data will be retained only as long as required, and I may withdraw consent by contacting the hotel.",
  ];

  return (
    <div className="min-h-screen bg-neutral-950 text-white px-4 py-10 flex justify-center">
      <div className="w-full max-w-lg">
        {/* Hotel header */}
        <div className="text-center mb-6">
          <p className="text-lg font-semibold">{b.hotel.name}</p>
          <p className="text-xs text-white/40">
            {b.hotel.city}, {b.hotel.state}
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck className="w-5 h-5 text-green-400" />
            <h1 className="text-lg font-bold">Guest Registration & Consent</h1>
          </div>
          <p className="text-sm text-white/50 mb-5">
            Please review and accept to complete your paperless check-in.
          </p>

          {/* Stay summary */}
          <div className="grid grid-cols-2 gap-3 text-sm mb-5">
            <div className="rounded-lg bg-white/5 px-3 py-2">
              <div className="flex items-center gap-1.5 text-white/40 text-xs mb-0.5">
                <User className="w-3.5 h-3.5" /> Guest
              </div>
              <div className="font-medium">{b.primaryGuest.name}</div>
            </div>
            <div className="rounded-lg bg-white/5 px-3 py-2">
              <div className="flex items-center gap-1.5 text-white/40 text-xs mb-0.5">
                <FileText className="w-3.5 h-3.5" /> Booking
              </div>
              <div className="font-mono font-medium">{b.bookingRef}</div>
            </div>
            <div className="rounded-lg bg-white/5 px-3 py-2 col-span-2">
              <div className="flex items-center gap-1.5 text-white/40 text-xs mb-0.5">
                <Calendar className="w-3.5 h-3.5" /> Stay
              </div>
              <div className="font-medium">
                {format(b.checkInDate, "dd MMM yyyy")} → {format(b.checkOutDate, "dd MMM yyyy")}
                <span className="text-white/40 font-normal">
                  {" "}· {b.noOfNights} night(s) · {b.noOfPersons} guest(s)
                </span>
              </div>
            </div>
          </div>

          {/* Declarations */}
          <ol className="space-y-2 mb-5">
            {declarations.map((d, i) => (
              <li key={i} className="flex gap-2 text-xs text-white/60 leading-relaxed">
                <span className="text-green-400 font-bold shrink-0">{i + 1}.</span>
                <span>{d}</span>
              </li>
            ))}
          </ol>

          <a
            href={pdfHref}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full text-sm font-medium px-4 py-2.5 rounded-xl border border-white/12 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white transition-all mb-4"
          >
            <FileText className="w-4 h-4" /> View full form (PDF)
          </a>

          {accepted ? (
            <div className="flex items-start gap-2 rounded-xl border border-green-500/25 bg-green-500/10 px-4 py-3">
              <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-green-300">Consent recorded</p>
                <p className="text-xs text-white/50">
                  Accepted on {format(consent.primaryAcceptedAt!, "dd MMM yyyy, hh:mm a")}. Valid
                  under the IT Act, 2000 & DPDP Act, 2023.
                </p>
              </div>
            </div>
          ) : (
            <ConsentAcceptButton token={token} />
          )}
        </div>

        <p className="text-center text-[11px] text-white/30 mt-4">
          Questions? Contact {b.hotel.name} at {b.hotel.phone}.
        </p>
      </div>
    </div>
  );
}
