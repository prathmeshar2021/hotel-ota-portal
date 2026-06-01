"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BedDouble, X, Check, Loader2, AlertCircle } from "lucide-react";
import { getCategoryMeta } from "@/lib/utils/room-categories";

interface AvailableRoom {
  id: string;
  roomNumber: string;
  roomType: string;
  status: string;
}

interface AssignRoomButtonProps {
  bookingId: string;
  hotelId: string;
  roomCategory: string;
  categoryLabel: string;
  categoryRooms: string[];        // room numbers in this category (for reference)
  currentRoomId: string | null;
  currentRoomNumber: string | null;
  checkInDate: string;            // ISO string
  checkOutDate: string;           // ISO string
}

export default function AssignRoomButton({
  bookingId,
  roomCategory,
  categoryLabel,
  currentRoomId,
  currentRoomNumber,
  checkInDate,
  checkOutDate,
}: AssignRoomButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rooms, setRooms] = useState<AvailableRoom[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const meta = getCategoryMeta(roomCategory);
  const accentColor = meta.accentColor;

  async function openModal() {
    setOpen(true);
    setLoading(true);
    setError(null);
    setSuccess(null);
    setSelectedRoomId(currentRoomId ?? null);

    try {
      // checkIn/checkOut may be full ISO — extract date part
      const checkIn  = checkInDate.split("T")[0];
      const checkOut = checkOutDate.split("T")[0];
      const params = new URLSearchParams({
        checkIn,
        checkOut,
        category: roomCategory,
        excludeBookingId: bookingId,
      });
      const res = await fetch(`/api/hotel-admin/rooms/available?${params}`);
      if (!res.ok) throw new Error("Failed to load rooms");
      const data: AvailableRoom[] = await res.json();
      setRooms(data);
    } catch {
      setError("Failed to load available rooms. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function closeModal() {
    if (saving) return;
    setOpen(false);
    setError(null);
    setSuccess(null);
    setRooms([]);
    setSelectedRoomId(null);
  }

  async function handleAssign() {
    if (!selectedRoomId || selectedRoomId === currentRoomId) return;
    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/hotel-admin/bookings/${bookingId}/assign-room`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId: selectedRoomId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to assign room");
      setSuccess(data.message ?? "Room assigned successfully!");
      setTimeout(() => {
        setOpen(false);
        router.refresh();
      }, 1400);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  const isAssigning = !currentRoomId;
  const hasChanged = selectedRoomId && selectedRoomId !== currentRoomId;

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={openModal}
        className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl border transition-all hover:scale-105 active:scale-95 shrink-0"
        style={{
          color: accentColor,
          borderColor: `${accentColor}35`,
          background: `${accentColor}12`,
        }}
      >
        <BedDouble className="w-3.5 h-3.5" />
        {isAssigning ? "Assign Room" : "Change Room"}
      </button>

      {/* Modal overlay */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)" }}
          onClick={(e) => e.target === e.currentTarget && closeModal()}
        >
          <div className="bg-[#0c180d] border border-white/10 rounded-2xl w-full max-w-sm shadow-[0_24px_64px_rgba(0,0,0,0.7)] overflow-hidden">

            {/* Header */}
            <div
              className="flex items-center justify-between px-5 py-4 border-b border-white/8"
              style={{ background: `${accentColor}08` }}
            >
              <div>
                <h2 className="font-bold text-white text-sm">
                  {isAssigning ? "Assign Room" : "Change Room"}
                </h2>
                <p className="text-white/40 text-xs mt-0.5">{categoryLabel}</p>
              </div>
              <button
                onClick={closeModal}
                disabled={saving}
                className="text-white/30 hover:text-white/60 transition-colors disabled:opacity-30"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-5">
              {/* Loading state */}
              {loading && (
                <div className="flex flex-col items-center justify-center py-10 gap-3">
                  <Loader2 className="w-6 h-6 animate-spin" style={{ color: accentColor }} />
                  <p className="text-white/35 text-xs">Loading available rooms…</p>
                </div>
              )}

              {/* Loaded state */}
              {!loading && (
                <>
                  {rooms.length === 0 && !error ? (
                    <div className="py-8 text-center">
                      <BedDouble className="w-8 h-8 text-white/15 mx-auto mb-3" />
                      <p className="text-white/40 text-sm font-medium">No rooms available</p>
                      <p className="text-white/25 text-xs mt-1">
                        All {categoryLabel.toLowerCase()} rooms are booked for these dates.
                      </p>
                    </div>
                  ) : (
                    <>
                      <p className="text-xs text-white/35 mb-3 uppercase tracking-widest font-semibold">
                        Available Rooms
                      </p>

                      <div className="space-y-2 max-h-56 overflow-y-auto pr-1 mb-4">
                        {rooms.map((room) => {
                          const isSelected = selectedRoomId === room.id;
                          const isCurrent  = room.id === currentRoomId;
                          return (
                            <button
                              key={room.id}
                              onClick={() => setSelectedRoomId(room.id)}
                              className="w-full flex items-center justify-between px-4 py-3 rounded-xl border text-left transition-all"
                              style={
                                isSelected
                                  ? {
                                      borderColor: `${accentColor}50`,
                                      background: `${accentColor}15`,
                                    }
                                  : {
                                      borderColor: "rgba(255,255,255,0.08)",
                                      background: "rgba(255,255,255,0.03)",
                                    }
                              }
                            >
                              <div>
                                <p className="text-sm font-semibold text-white">
                                  Room {room.roomNumber}
                                </p>
                                {isCurrent && (
                                  <p className="text-[10px] mt-0.5" style={{ color: accentColor }}>
                                    Currently assigned
                                  </p>
                                )}
                              </div>
                              {isSelected && (
                                <Check
                                  className="w-4 h-4 shrink-0"
                                  style={{ color: accentColor }}
                                />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}

                  {/* Error */}
                  {error && (
                    <div className="flex items-start gap-2 bg-red-500/8 border border-red-500/20 rounded-xl px-3 py-2.5 mb-4">
                      <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                      <p className="text-red-400 text-xs">{error}</p>
                    </div>
                  )}

                  {/* Success */}
                  {success && (
                    <div
                      className="flex items-center gap-2 rounded-xl px-3 py-2.5 mb-4 border"
                      style={{
                        background: `${accentColor}10`,
                        borderColor: `${accentColor}25`,
                      }}
                    >
                      <Check className="w-4 h-4 shrink-0" style={{ color: accentColor }} />
                      <p className="text-xs font-medium" style={{ color: accentColor }}>
                        {success}
                      </p>
                    </div>
                  )}

                  {/* Confirm button */}
                  {rooms.length > 0 && (
                    <button
                      onClick={handleAssign}
                      disabled={!hasChanged || saving || !!success}
                      className="w-full py-3 rounded-xl font-bold text-sm text-black flex items-center justify-center gap-2 transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
                      style={{ background: accentColor }}
                    >
                      {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                      {saving ? "Assigning…" : "Confirm Assignment"}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
