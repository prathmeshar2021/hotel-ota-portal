"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Users, Banknote, Loader2, ShieldOff, ShieldCheck, Zap } from "lucide-react";
import InstantBookModal from "./InstantBookModal";

interface Room {
  id: string;
  roomNumber: string;
  roomType: string;
  status: string;
  capacity: number;
  basePrice: number;
}

interface Props {
  room: Room;
  occupiedBy: { name: string; phone: string | null } | null;
  bookedBy?: { name: string; phone: string | null } | null;
  accentColor: string;
}

const STATUS_CONFIG: Record<string, { label: string; dot: string; cardCls: string }> = {
  AVAILABLE: {
    label: "Available",
    dot: "#4ADE80",
    cardCls: "border-green-500/15 bg-green-500/5",
  },
  BOOKED: {
    label: "Booked · arriving today",
    dot: "#A78BFA",
    cardCls: "border-violet-500/20 bg-violet-500/5",
  },
  OCCUPIED: {
    label: "Occupied",
    dot: "#60A5FA",
    cardCls: "border-blue-500/20 bg-blue-500/5",
  },
  CLEANING: {
    label: "Cleaning",
    dot: "#F59E0B",
    cardCls: "border-amber-500/20 bg-amber-500/5",
  },
  MAINTENANCE: {
    label: "Blocked",
    dot: "#F87171",
    cardCls: "border-red-500/25 bg-red-500/8",
  },
};

const STATUS_OPTIONS = ["AVAILABLE", "CLEANING", "MAINTENANCE"] as const;

// "Cottage5" → "5", "Cave1" → "1", "201" → "201" — just the digits for the small badge.
function roomBadge(n: string): string {
  return n.match(/\d+/)?.[0] ?? n;
}

// Display name: "Cottage5" → "Cottage 5", "Cave1" → "Cave 1"; plain numbers stay "Room 201".
function roomLabel(n: string): string {
  return /[A-Za-z]/.test(n) ? n.replace(/([A-Za-z])(\d)/g, "$1 $2") : `Room ${n}`;
}

export default function RoomStatusCard({ room, occupiedBy, bookedBy, accentColor }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [localStatus, setLocalStatus] = useState(room.status);
  const [instantOpen, setInstantOpen] = useState(false);

  // Precedence: a checked-in guest = occupied; else a confirmed arrival today = booked.
  const displayStatus = occupiedBy ? "OCCUPIED" : bookedBy ? "BOOKED" : localStatus;
  const config = STATUS_CONFIG[displayStatus] ?? STATUS_CONFIG.AVAILABLE;

  async function changeStatus(newStatus: string) {
    if (newStatus === localStatus) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/hotel-admin/rooms/${room.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        setLocalStatus(newStatus);
        const label =
          newStatus === "MAINTENANCE" ? "blocked — hidden from customers" :
          newStatus === "AVAILABLE"   ? "unblocked — available to book" :
          newStatus.toLowerCase();
        toast.success(`${roomLabel(room.roomNumber)} ${label}`);
        router.refresh();
      } else {
        toast.error("Failed to update room status");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={`border rounded-2xl p-4 transition-all ${config.cardCls}`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold text-black shrink-0"
            style={{ background: accentColor }}
          >
            {roomBadge(room.roomNumber)}
          </div>
          <div>
            <p className="text-white/70 text-sm font-semibold">{roomLabel(room.roomNumber)}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: config.dot }}
              />
              <p className="text-white/40 text-xs">{config.label}</p>
            </div>
          </div>
        </div>
        {loading && <Loader2 className="w-4 h-4 text-white/30 animate-spin" />}
      </div>

      {/* Capacity + price */}
      <div className="flex items-center gap-3 text-xs text-white/35 mb-3">
        <span className="flex items-center gap-1">
          <Users className="w-3 h-3" /> {room.capacity} max
        </span>
        <span className="flex items-center gap-1">
          <Banknote className="w-3 h-3" /> ₹{room.basePrice.toLocaleString("en-IN")}/night
        </span>
      </div>

      {/* Occupied by */}
      {occupiedBy && (
        <div className="bg-blue-500/10 border border-blue-500/15 rounded-xl px-3 py-2 mb-3">
          <p className="text-blue-300 text-xs font-semibold">{occupiedBy.name}</p>
          <p className="text-blue-300/60 text-[10px]">{occupiedBy.phone}</p>
        </div>
      )}

      {/* Booked by — confirmed arrival today, not yet checked in */}
      {!occupiedBy && bookedBy && (
        <div className="bg-violet-500/10 border border-violet-500/15 rounded-xl px-3 py-2 mb-3">
          <p className="text-violet-300 text-xs font-semibold">{bookedBy.name}</p>
          <p className="text-violet-300/60 text-[10px]">{bookedBy.phone} · awaiting check-in</p>
        </div>
      )}

      {/* Instant book — a phone booking blocked in one step. Only offered when
          the room is actually free to take. */}
      {!occupiedBy && !bookedBy && localStatus !== "MAINTENANCE" && (
        <button
          onClick={() => setInstantOpen(true)}
          disabled={loading}
          className="w-full flex items-center justify-center gap-1.5 text-[10px] font-bold py-2 mb-1.5 rounded-lg bg-blue-500/15 border border-blue-500/30 text-blue-300 hover:bg-blue-500/25 transition-all disabled:opacity-50"
        >
          <Zap className="w-3 h-3" />
          Instant Book
        </button>
      )}

      {instantOpen && (
        <InstantBookModal
          roomId={room.id}
          roomNumber={room.roomNumber}
          basePrice={room.basePrice}
          onClose={() => setInstantOpen(false)}
        />
      )}

      {/* Status controls — only when the room is neither occupied nor booked today */}
      {!occupiedBy && !bookedBy && (
        <div className="space-y-1.5">
          {/* Free / Cleaning quick-toggle row */}
          {localStatus !== "MAINTENANCE" && (
            <div className="flex gap-1.5">
              {(["AVAILABLE", "CLEANING"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => changeStatus(s)}
                  disabled={loading || localStatus === s}
                  className={`flex-1 text-[10px] font-semibold py-1.5 rounded-lg transition-all ${
                    localStatus === s
                      ? "bg-white/15 text-white/70 cursor-default"
                      : "bg-white/5 text-white/30 hover:bg-white/10 hover:text-white/60"
                  }`}
                >
                  {s === "AVAILABLE" ? "Free" : "Cleaning"}
                </button>
              ))}
            </div>
          )}

          {/* Block / Unblock — prominent, full-width */}
          {localStatus === "MAINTENANCE" ? (
            <button
              onClick={() => changeStatus("AVAILABLE")}
              disabled={loading}
              className="w-full flex items-center justify-center gap-1.5 text-[10px] font-bold py-2 rounded-lg bg-green-500/15 border border-green-500/30 text-green-400 hover:bg-green-500/25 transition-all disabled:opacity-50"
            >
              <ShieldCheck className="w-3 h-3" />
              Unblock Room
            </button>
          ) : (
            <button
              onClick={() => changeStatus("MAINTENANCE")}
              disabled={loading}
              className="w-full flex items-center justify-center gap-1.5 text-[10px] font-bold py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-all disabled:opacity-50"
            >
              <ShieldOff className="w-3 h-3" />
              Block Room
            </button>
          )}
        </div>
      )}
    </div>
  );
}
