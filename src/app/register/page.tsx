import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import GuestRegisterForm from "@/components/customer/GuestRegisterForm";
import HouseRules from "@/components/customer/HouseRules";
import { BUSINESS } from "@/lib/constants/business";
import { prisma } from "@/lib/db/prisma";
import { REFUNDABLE_DEPOSIT } from "@/lib/utils/booking-calc";

// Reception-desk utility form — not a page we want in search results.
export const metadata: Metadata = {
  title: "Guest Registration",
  description: `Register as a guest at ${BUSINESS.brand}, ${BUSINESS.city}.`,
  robots: { index: false, follow: false },
};

export default async function GuestRegisterPage() {
  // Quote the hotel's real times rather than hard-coding them here, so the rules
  // can never drift from what the booking flow enforces.
  const hotel = await prisma.hotel.findFirst({
    where: { isActive: true },
    select: { checkInTime: true, checkOutTime: true },
  });
  return (
    <div className="min-h-screen bg-[#071209]">
      <div className="max-w-2xl mx-auto px-4 pt-12 pb-16">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-500/15 border border-amber-500/25 mb-4">
            <ShieldCheck className="w-7 h-7 text-amber-400" />
          </div>
          <p className="text-amber-400/80 text-xs font-semibold uppercase tracking-[0.2em] mb-1">
            {BUSINESS.brand}
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold text-white">Guest Registration</h1>
          <p className="text-white/45 text-sm mt-2 max-w-md mx-auto">
            Fill in your details and upload your ID — add anyone travelling with you
            too. Reception will then check you in without any queue or re-typing.
          </p>
        </div>

        <HouseRules
          checkInTime={hotel?.checkInTime ?? "12:00 PM"}
          checkOutTime={hotel?.checkOutTime ?? "10:00 AM"}
          depositAmount={REFUNDABLE_DEPOSIT}
        />

        <GuestRegisterForm />
      </div>
    </div>
  );
}
