/* Read-only check: did the GoMMT email sync land?  npx tsx scripts/check-ota-booking.ts */
import { prisma } from "../src/lib/db/prisma";

async function main() {
  const b = await prisma.booking.findUnique({
    where: { bookingRef: "MMT-NH76171490841420" },
    include: { primaryGuest: { select: { name: true } } },
  });
  console.log("\nBooking MMT-NH76171490841420:");
  console.log(
    b
      ? {
          status: b.status,
          source: b.source,
          category: b.roomCategory,
          checkIn: b.checkInDate.toISOString().slice(0, 10),
          checkOut: b.checkOutDate.toISOString().slice(0, 10),
          guest: b.primaryGuest?.name,
        }
      : "NOT FOUND — pipeline has not created it yet",
  );

  const logs = await prisma.appsheetSyncLog.findMany({
    where: { action: { startsWith: "ota_" } },
    orderBy: { createdAt: "desc" },
    take: 6,
    select: { action: true, status: true, error: true, createdAt: true },
  });
  console.log("\nRecent OTA sync logs:");
  console.log(logs.length ? logs : "none");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
