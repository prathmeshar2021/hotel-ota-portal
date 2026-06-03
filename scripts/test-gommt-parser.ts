/* Run: npx tsx scripts/test-gommt-parser.ts
 * Verifies the GoMMT parser against the real sample emails (booking + cancel). */
import { parseGommtEmail } from "../src/lib/ota/gommt-parser";

const BOOKING_TEXT = `Host Voucher
The Urban Escape (by Saubhagya Mangalam), Bhilai
aarya Nagar, Kohka Bhilai, Bhilai, IN
PRIMARY GUEST DETAILS
Siddhant Tripathi
CHECK-IN CHECK-OUT
06 Jun '26
12:00 PM
07 Jun '26 (1 Night)
10:00 AM
TOTAL NO. OF GUEST(S)
2 Adults
BOOKING ID
NH76171490841420
BOOKED ON
03 Jun '26 10:34 AM
BOOKING STATUS
Confirmed
PAYMENT STATUS
Paid Online
BOOKED VIA
MakeMyTrip
PNR
0178383538
1 Room(s)
1 x Deluxe Pinewood Cottage King Bed with Bunk Bed Forest View
2 Adults • Room Only
Payment
Property Gross Charges
₹ 2,125.0
Payable to Property
₹ 1,621.38`;

const CANCEL_TEXT = `Host Voucher
The Urban Escape (by Saubhagya Mangalam), Bhilai
PRIMARY GUEST DETAILS
Siddhant Tripathi
CHECK-IN CHECK-OUT
06 Jun '26
12:00 PM
07 Jun '26 (1 Night)
10:00 AM
TOTAL NO. OF GUEST(S)
2 Adults
BOOKING ID
NH76171490841420
CANCELLED ON
03 Jun '26 11:30 AM
BOOKING STATUS
CANCELLED
PAYMENT STATUS
Paid Online
BOOKED VIA
MakeMyTrip
PNR
0178383538
1 Room(s)
1 x Deluxe Pinewood Cottage King Bed with Bunk Bed Forest View
2 Adults • Room Only
Payment
Cancellation Charges (Payable to Property)
₹ 0.0`;

function show(label: string, r: ReturnType<typeof parseGommtEmail>) {
  console.log(`\n=== ${label} ===`);
  console.log(JSON.stringify(r, null, 2));
}

const booking = parseGommtEmail({
  subject: "New Booking Received for The Urban Escape (by Saubhagya Mangalam) on MakeMyTrip - NH76171490841420",
  from: "MakeMyTrip <no-reply@go-mmt.com>",
  text: BOOKING_TEXT,
});
show("BOOKING", booking);

const cancel = parseGommtEmail({
  subject: "Cancellation received for Booking ID : NH76171490841420",
  from: "MakeMyTrip <no-reply@go-mmt.com>",
  text: CANCEL_TEXT,
});
show("CANCELLATION", cancel);

// assertions
const errs: string[] = [];
if (booking.ok) {
  const d = booking.data;
  if (d.eventType !== "NEW_BOOKING") errs.push(`booking.eventType=${d.eventType}`);
  if (d.otaBookingId !== "NH76171490841420") errs.push(`booking.id=${d.otaBookingId}`);
  if (d.roomCategory !== "PINEWOOD_COTTAGE") errs.push(`booking.category=${d.roomCategory}`);
  if (d.guestName !== "Siddhant Tripathi") errs.push(`booking.guest=${d.guestName}`);
  if (d.nights !== 1) errs.push(`booking.nights=${d.nights}`);
  if (d.guests !== 2) errs.push(`booking.guests=${d.guests}`);
  if (d.checkIn?.toISOString().slice(0, 10) !== "2026-06-06") errs.push(`booking.checkIn=${d.checkIn?.toISOString()}`);
  if (d.checkOut?.toISOString().slice(0, 10) !== "2026-06-07") errs.push(`booking.checkOut=${d.checkOut?.toISOString()}`);
  if (d.propertyGrossCharges !== 2125) errs.push(`booking.gross=${d.propertyGrossCharges}`);
  if (d.payableToProperty !== 1621.38) errs.push(`booking.payable=${d.payableToProperty}`);
} else errs.push("booking parse failed: " + booking.error);

if (cancel.ok) {
  const d = cancel.data;
  if (d.eventType !== "CANCELLATION") errs.push(`cancel.eventType=${d.eventType}`);
  if (d.otaBookingId !== "NH76171490841420") errs.push(`cancel.id=${d.otaBookingId}`);
  if (d.cancellationCharge !== 0) errs.push(`cancel.charge=${d.cancellationCharge}`);
} else errs.push("cancel parse failed: " + cancel.error);

if (errs.length) {
  console.error("\n❌ FAILED:\n - " + errs.join("\n - "));
  process.exit(1);
} else {
  console.log("\n✅ ALL ASSERTIONS PASSED");
}
