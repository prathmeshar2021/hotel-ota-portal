export const dynamic = "force-dynamic";

import { auth } from "@/lib/auth/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import RoomStatusCard from "@/components/hotel-admin/RoomStatusCard";
import SeedRoomsButton from "@/components/hotel-admin/SeedRoomsButton";
import { getCategoryMeta } from "@/lib/utils/room-categories";

const STATUS_LABELS: Record<string, string> = {
  AVAILABLE: "Available",
  OCCUPIED: "Occupied",
  CLEANING: "Cleaning",
  MAINTENANCE: "Maintenance",
};

export default async function RoomsPage() {
  const session = await auth();
  if (!session?.user?.hotelId) redirect("/auth/staff-login");

  const rooms = await prisma.room.findMany({
    where: { hotelId: session.user.hotelId, isActive: true },
    include: {
      assignedBookings: {
        where: { status: "CHECKED_IN" },
        include: {
          primaryGuest: { select: { name: true, phone: true } },
        },
        take: 1,
      },
    },
    orderBy: [{ roomType: "asc" }, { roomNumber: "asc" }],
  });

  // Group by type
  const grouped = rooms.reduce<Record<string, typeof rooms>>((acc, r) => {
    const type = r.roomType;
    if (!acc[type]) acc[type] = [];
    acc[type].push(r);
    return acc;
  }, {});

  const statusCounts = {
    AVAILABLE: rooms.filter((r) => r.status === "AVAILABLE").length,
    OCCUPIED: rooms.filter((r) => r.status === "OCCUPIED" || r.assignedBookings.length > 0).length,
    CLEANING: rooms.filter((r) => r.status === "CLEANING").length,
    MAINTENANCE: rooms.filter((r) => r.status === "MAINTENANCE").length,
  };

  return (
    <div className="p-6 max-w-5xl">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Room Status Board</h1>
          <p className="text-white/35 text-sm">{rooms.length} rooms · Live status</p>
        </div>
        <SeedRoomsButton />
      </div>

      {/* Status summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-7">
        {[
          { key: "AVAILABLE", color: "#4ADE80" },
          { key: "OCCUPIED", color: "#60A5FA" },
          { key: "CLEANING", color: "#F59E0B" },
          { key: "MAINTENANCE", color: "#F87171" },
        ].map(({ key, color }) => (
          <div key={key} className="bg-white/3 border border-white/8 rounded-xl px-4 py-3 flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
            <div>
              <p className="text-white font-bold text-lg leading-none">{statusCounts[key as keyof typeof statusCounts]}</p>
              <p className="text-white/40 text-xs">{STATUS_LABELS[key]}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Room groups */}
      <div className="space-y-7">
        {Object.entries(grouped).map(([type, typeRooms]) => {
          const catMeta = getCategoryMeta(type);
          return (
          <div key={type}>
            <div className="flex items-center gap-2.5 mb-3">
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ background: catMeta.accentColor }}
              />
              <h2 className="font-semibold text-white/70 text-sm uppercase tracking-wider">
                {catMeta.displayName}
              </h2>
              <span className="text-white/25 text-xs">({typeRooms.length})</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {typeRooms.map((room) => (
                <RoomStatusCard
                  key={room.id}
                  room={{
                    id: room.id,
                    roomNumber: room.roomNumber,
                    roomType: room.roomType,
                    status: room.status,
                    capacity: room.capacity,
                    basePrice: room.basePrice,
                  }}
                  occupiedBy={room.assignedBookings[0]?.primaryGuest ?? null}
                  accentColor={catMeta.accentColor}
                />
              ))}
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );
}
