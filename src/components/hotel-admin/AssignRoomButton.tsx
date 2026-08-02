"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BedDouble, X, Check, Loader2, AlertCircle, Sparkles } from "lucide-react";
import { getCategoryMeta } from "@/lib/utils/room-categories";

interface AvailableRoom {
  id: string;
  roomNumber: string;
  roomType: string;
  status: string;
  basePrice: number;
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
  noOfNights: number;
  currentTotal: number;           // what the guest is charged today
}

export default function AssignRoomButton({
  bookingId,
  roomCategory,
  categoryLabel,
  currentRoomId,
  currentRoomNumber,
  checkInDate,
  checkOutDate,
  noOfNights,
  currentTotal,
}: AssignRoomButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rooms, setRooms] = useState<AvailableRoom[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  // Optional re-price for the move. Blank leaves the guest on what they were
  // already quoted — changing rooms shouldn't silently change the bill.
  const [newPrice, setNewPrice] = useState("");

  const meta = getCategoryMeta(roomCategory);
  const accentColor = meta.accentColor;

  async function openModal() {
    setOpen(true);
    setLoading(true);
    setError(null);
    setSuccess(null);
    setSelectedRoomId(currentRoomId ?? null);
    setNewPrice("");

    try {
      // checkIn/checkOut may be full ISO — extract date part
      const checkIn  = checkInDate.split("T")[0];
      const checkOut = checkOutDate.split("T")[0];
      // No category filter — the desk can move a guest to any free room,
      // including a different room type.
      const params = new URLSearchParams({
        checkIn,
        checkOut,
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
        body: JSON.stringify({
          roomId: selectedRoomId,
          customTotal: newPrice.trim() === "" ? undefined : Math.max(0, Number(newPrice) || 0),
        }),
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
                        Every room is booked for these dates.
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-xs text-white/35 uppercase tracking-widest font-semibold">
                          Available Rooms
                        </p>
                        {rooms.length === 1 && (
                          <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
                            Only 1 available
                          </span>
                        )}
                      </div>

                      {/* Auto-allot info banner */}
                      {currentRoomId && (
                        <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-xl bg-white/4 border border-white/8">
                          <Sparkles className="w-3.5 h-3.5 shrink-0" style={{ color: accentColor }} />
                          <p className="text-[11px] text-white/50">
                            Room auto-assigned by system · you can change it below
                          </p>
                        </div>
                      )}

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
                                  ? { borderColor: `${accentColor}50`, background: `${accentColor}15` }
                                  : { borderColor: "rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)" }
                              }
                            >
                              <div>
                                <p className="text-sm font-semibold text-white">
                                  Room {room.roomNumber}
                                  {room.roomType !== roomCategory && (
                                    <span className="ml-2 text-[9px] font-bold uppercase tracking-wider text-amber-400/80">
                                      other category
                                    </span>
                                  )}
                                </p>
                                <p className="text-[10px] text-white/35 mt-0.5">
                                  {getCategoryMeta(room.roomType as never)?.displayName ?? room.roomType}
                                  {room.basePrice ? ` · ₹${room.basePrice.toLocaleString("en-IN")}/night` : ""}
                                </p>
                                {isCurrent && (
                                  <p className="text-[10px] mt-0.5 flex items-center gap-1" style={{ color: accentColor }}>
                                    <Sparkles className="w-3 h-3" /> Current room
                                  </p>
                                )}
                              </div>
                              {isSelected && (
                                <Check className="w-4 h-4 shrink-0" style={{ color: accentColor }} />
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

                  {/* Optional re-price — only worth showing once a different
                      room is picked, since that's when the rate might change. */}
                  {rooms.length > 0 && hasChanged && (
                    <div className="mb-4">
                      <label className="block text-[11px] font-semibold text-white/45 uppercase tracking-wider mb-1.5">
                        New Price (₹) <span className="normal-case font-normal text-white/25">— optional, GST included</span>
                      </label>
                      <input
                        type="number" min={0} value={newPrice}
                        onChange={(e) => setNewPrice(e.target.value)}
                        placeholder={`Leave blank to keep ₹${currentTotal.toLocaleString("en-IN")}`}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder:text-white/25 text-sm focus:outline-none transition-all"
                        style={{ borderColor: newPrice ? `${accentColor}40` : undefined }}
                      />
                      {newPrice.trim() !== "" && Number(newPrice) >= 0 && (
                        <p className="text-[11px] text-white/40 mt-1.5">
                          {Number(newPrice) > currentTotal
                            ? `₹${(Number(newPrice) - currentTotal).toLocaleString("en-IN")} more than the current total`
                            : Number(newPrice) < currentTotal
                              ? `₹${(currentTotal - Number(newPrice)).toLocaleString("en-IN")} less than the current total`
                              : "Same as the current total"}
                          {" · GST is recalculated from this figure"}
                        </p>
                      )}
                      <p className="text-[10px] text-white/25 mt-1">
                        For {noOfNights} night{noOfNights !== 1 ? "s" : ""}. Blank keeps the guest on what they were quoted.
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
