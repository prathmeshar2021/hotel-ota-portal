import { auth } from "./auth";
import { prisma } from "@/lib/db/prisma";

export interface SuperAdminContext {
  userId: string;
  name: string;
  hotelId: string;
  hotelName: string;
  hotelSlug: string;
}

/**
 * Guard for super-admin-only API routes / server actions.
 *
 * Confirms the current session belongs to a SUPER_ADMIN and resolves the
 * hotel context. A SuperAdmin has no native hotelId, so we fall back to the
 * single active hotel when the session does not already carry one.
 *
 * @returns the resolved context, or `null` when the caller is not a super admin
 *          / no hotel could be resolved (caller should respond 401/403).
 */
export async function requireSuperAdmin(): Promise<SuperAdminContext | null> {
  const session = await auth();
  if (!session?.user || session.user.role !== "SUPER_ADMIN") return null;

  const hotelId = await resolveHotelId(session.user.hotelId);
  if (!hotelId) return null;

  let hotelName = session.user.hotelName;
  let hotelSlug = session.user.hotelSlug;

  if (!hotelName || !hotelSlug) {
    const hotel = await prisma.hotel.findUnique({
      where: { id: hotelId },
      select: { name: true, slug: true },
    });
    hotelName = hotelName ?? hotel?.name ?? "Hotel";
    hotelSlug = hotelSlug ?? hotel?.slug ?? "";
  }

  return {
    userId: session.user.id,
    name: session.user.name ?? "Super Admin",
    hotelId,
    hotelName,
    hotelSlug,
  };
}

/**
 * Resolve the hotel a super admin operates on. Prefers the id already carried
 * in the session; otherwise defaults to the single (oldest active) hotel.
 */
export async function resolveHotelId(
  sessionHotelId?: string | null
): Promise<string | null> {
  if (sessionHotelId) return sessionHotelId;
  const hotel = await prisma.hotel.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return hotel?.id ?? null;
}
