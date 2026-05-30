import { google } from "googleapis";
import { prisma } from "@/lib/db/prisma";

function getGoogleAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

async function appendToSheet(sheetName: string, values: (string | number | null)[]) {
  const auth = getGoogleAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const spreadsheetId = process.env.APPSHEET_SPREADSHEET_ID!;

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A:Z`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [values] },
  });
}

// Push a new portal booking to AppSheet's Google Sheet so staff can see it
export async function syncBookingToAppSheet(bookingId: string) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      primaryGuest: true,
      room: true,
      hotel: true,
      coupon: true,
    },
  });

  if (!booking) throw new Error("Booking not found");

  const logId = await prisma.appsheetSyncLog.create({
    data: {
      hotelId: booking.hotelId,
      bookingId,
      action: "push_booking",
      status: "PENDING",
      attempts: 1,
    },
  });

  try {
    // Map to Table 2 (Bookings) columns in AppSheet
    const guestRow = [
      booking.primaryGuest.name,
      booking.primaryGuest.idNumber ?? "",
      booking.primaryGuest.gender ?? "",
      booking.primaryGuest.address ?? "",
      booking.primaryGuest.occupation ?? "",
      booking.primaryGuest.phone,
      booking.primaryGuest.idType ?? "",
      "", // ID_front - not pushed
      "", // ID_back  - not pushed
    ];

    const bookingRow = [
      "",                                          // Row ID (AppSheet generates)
      "",                                          // Booking NO (AppSheet auto-increments)
      booking.noOfPersons,
      "",                                          // second person's id
      "",                                          // Relation
      "",                                          // Coming from (filled at online checkin)
      "",                                          // Going to
      booking.checkInDate.toISOString(),
      booking.checkOutDate.toISOString(),
      booking.cashPaid,
      booking.onlinePaid,
      booking.refundableDeposit,
      booking.couponDiscount,
      booking.totalAmount,
      "Confirmed",                                 // Status
      booking.primaryGuest.idNumber ?? "",
      booking.room.roomNumber,
      booking.primaryGuest.phone,
      booking.primaryGuest.name,
      booking.coupon?.code ?? "",
      booking.totalAmount,
      "",                                          // GRFORM
      "",                                          // Consent_ID (set after consent)
      `[ONLINE] ${booking.bookingRef}`,            // Note for staff
    ];

    await appendToSheet("Table 1", guestRow);
    await appendToSheet("Table 2", bookingRow);

    await prisma.appsheetSyncLog.update({
      where: { id: logId.id },
      data: { status: "SUCCESS", syncedAt: new Date() },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.appsheetSyncLog.update({
      where: { id: logId.id },
      data: { status: "FAILED", error: message },
    });
    // Don't throw — sync failure must never affect portal booking
    console.error("[AppSheet Sync] Failed:", message);
  }
}
