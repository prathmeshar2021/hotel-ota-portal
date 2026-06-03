/**
 * Local end-to-end test for the OTA email webhook.
 *
 * Simulates GoMMT POSTing a booking email, then a cancellation email, to your
 * running app — exactly like the Gmail Apps Script would in production.
 *
 * Usage (with dev server running on :3000):
 *   OTA_EMAIL_WEBHOOK_SECRET=yoursecret npx tsx scripts/test-ota-webhook.ts
 *   # or point at another base / secret:
 *   npx tsx scripts/test-ota-webhook.ts http://localhost:3000 yoursecret
 *
 * NOTE: this writes to whatever DB your app is connected to. It posts the
 * cancellation after the booking, so the room ends up released. To delete the
 * test rows entirely, run:  npx tsx scripts/cleanup-ota-test.ts
 */

const BASE = process.argv[2] || process.env.OTA_TEST_BASE || "http://localhost:3000";
const SECRET = process.argv[3] || process.env.OTA_EMAIL_WEBHOOK_SECRET || "";

const FROM = "MakeMyTrip <no-reply@go-mmt.com>";

const BOOKING_TEXT = `Host Voucher
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
BOOKED ON
03 Jun '26 10:34 AM
BOOKING STATUS
Confirmed
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
BOOKING ID
NH76171490841420
CANCELLED ON
03 Jun '26 11:30 AM
BOOKING STATUS
CANCELLED
BOOKED VIA
MakeMyTrip
PNR
0178383538
1 Room(s)
1 x Deluxe Pinewood Cottage King Bed with Bunk Bed Forest View
Payment
Cancellation Charges (Payable to Property)
₹ 0.0`;

async function post(subject: string, text: string) {
  const url = `${BASE}/api/webhook/ota-email?secret=${encodeURIComponent(SECRET)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ subject, from: FROM, text }),
  });
  const body = await res.text();
  console.log(`\n${subject}\n  → ${res.status} ${body}`);
  return res.status;
}

async function main() {
  if (!SECRET) {
    console.error("Set OTA_EMAIL_WEBHOOK_SECRET (env) or pass it as arg 2.");
    process.exit(1);
  }
  console.log(`Testing against ${BASE}`);

  await post(
    "New Booking Received for The Urban Escape (by Saubhagya Mangalam) on MakeMyTrip - NH76171490841420",
    BOOKING_TEXT,
  );
  console.log("\n→ Now check: admin bookings should show an MMT booking, and");
  console.log("  Pinewood availability for 06 Jun 2026 should be down by 1.");

  console.log("\nPress Ctrl+C to stop here, or it will post the CANCELLATION in 6s...");
  await new Promise((r) => setTimeout(r, 6000));

  await post("Cancellation received for Booking ID : NH76171490841420", CANCEL_TEXT);
  console.log("\n→ The booking should now be CANCELLED and the room released.");
  console.log("  To remove the test rows entirely: npx tsx scripts/cleanup-ota-test.ts");
}

main();
