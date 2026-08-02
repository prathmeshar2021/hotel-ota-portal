"use client";

import { useState } from "react";
import { LogIn, ShieldCheck } from "lucide-react";
import CounterCheckinModal from "./CounterCheckinModal";

interface ExistingCheckinData {
  idType?: string | null;
  idNumber?: string | null;
  idFrontUrl?: string | null;
  idBackUrl?: string | null;
  comingFrom?: string | null;
  goingTo?: string | null;
  purpose?: string | null;
  vehicleNo?: string | null;
  depositLinkUrl?: string | null;
  depositCollected?: number | null;
  companions?: {
    name: string;
    relation?: string | null;
    idType?: string | null;
    idNumber?: string | null;
    idFrontUrl?: string | null;
    idBackUrl?: string | null;
  }[];
}

interface Props {
  bookingId: string;
  bookingRef: string;
  guestName: string;
  guestPhone?: string | null;
  noOfPersons: number;
  /** Passed when the guest already completed online check-in — pre-fills the modal */
  existingData?: ExistingCheckinData;
}

export default function CounterCheckinButton({
  bookingId, bookingRef, guestName, guestPhone, noOfPersons, existingData,
}: Props) {
  const [open, setOpen] = useState(false);
  const hasWebCheckin = !!(existingData?.comingFrom);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`flex items-center gap-2 font-bold px-6 py-3 rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg text-white ${
          hasWebCheckin
            ? "bg-green-600 hover:bg-green-500 shadow-green-600/20"
            : "bg-green-500 hover:bg-green-400 shadow-green-500/20"
        }`}
      >
        {hasWebCheckin
          ? <ShieldCheck className="w-4 h-4" />
          : <LogIn className="w-4 h-4" />
        }
        Guest Registration
        {hasWebCheckin && (
          <span className="text-[10px] font-semibold bg-green-400/20 border border-green-400/30 px-1.5 py-0.5 rounded-full">
            web CI done
          </span>
        )}
      </button>

      <CounterCheckinModal
        open={open}
        onClose={() => setOpen(false)}
        bookingId={bookingId}
        bookingRef={bookingRef}
        guestName={guestName}
        guestPhone={guestPhone}
        noOfPersons={noOfPersons}
        existingData={existingData}
      />
    </>
  );
}
