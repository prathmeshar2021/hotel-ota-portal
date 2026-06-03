/**
 * Removes the rows created by scripts/test-ota-webhook.ts.
 * Usage: npx tsx scripts/cleanup-ota-test.ts
 */
import { prisma } from "../src/lib/db/prisma";

const BOOKING_REF = "MMT-NH76171490841420";

async function main() {
  const booking = await prisma.booking.findUnique({
    where: { bookingRef: BOOKING_REF },
    select: { id: true, primaryGuestId: true },
  });

  if (!booking) {
    console.log(`No test booking (${BOOKING_REF}) found — nothing to clean.`);
    return;
  }

  // sync logs referencing this booking
  const logs = await prisma.appsheetSyncLog.deleteMany({ where: { bookingId: booking.id } });
  // the booking itself
  await prisma.booking.delete({ where: { id: booking.id } });
  // the synthetic OTA guest (ignore if it's referenced elsewhere)
  let guestDeleted = false;
  try {
    await prisma.guest.delete({ where: { id: booking.primaryGuestId } });
    guestDeleted = true;
  } catch {
    /* guest still referenced by another booking — leave it */
  }

  console.log(
    `Cleaned: booking ${BOOKING_REF}, ${logs.count} sync log(s)` +
      (guestDeleted ? ", and its OTA guest." : " (guest kept — still referenced)."),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
