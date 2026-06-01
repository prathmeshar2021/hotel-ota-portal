const GUPSHUP_API_URL = "https://api.gupshup.io/sm/api/v1/msg";

interface WhatsAppTextMessage {
  to: string;
  message: string;
  type?: "text";
}

interface WhatsAppDocumentMessage {
  to: string;
  message?: never;
  type: "document";
  documentUrl: string;
  caption?: string;
  filename?: string;
}

type WhatsAppMessage = WhatsAppTextMessage | WhatsAppDocumentMessage;

async function send(payload: WhatsAppMessage) {
  const source = process.env.GUPSHUP_SOURCE_NUMBER!;
  const apiKey = process.env.GUPSHUP_API_KEY!;
  const appName = process.env.GUPSHUP_APP_NAME!;

  const destination = payload.to.startsWith("91") ? payload.to : `91${payload.to}`;

  let message: string;
  if (payload.type === "document") {
    message = JSON.stringify({
      type: "document",
      document: {
        link: payload.documentUrl,
        caption: payload.caption ?? "",
        filename: payload.filename ?? "document.pdf",
      },
    });
  } else {
    message = JSON.stringify({ type: "text", text: payload.message });
  }

  const body = new URLSearchParams({
    channel: "whatsapp",
    source,
    destination,
    message,
    "src.name": appName,
  });

  const res = await fetch(GUPSHUP_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      apikey: apiKey,
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gupshup error ${res.status}: ${text}`);
  }

  return res.json();
}

export const gupshup = {
  sendBookingConfirmation: (phone: string, data: {
    guestName: string;
    bookingRef: string;
    hotelName: string;
    roomType: string;
    checkIn: string;
    checkOut: string;
    totalAmount: number;
  }) =>
    send({
      to: phone,
      message:
        `✅ *Booking Confirmed!*\n\n` +
        `Dear ${data.guestName},\n\n` +
        `Your booking at *${data.hotelName}* is confirmed.\n\n` +
        `📋 *Booking Ref:* ${data.bookingRef}\n` +
        `🛏️ *Room:* ${data.roomType}\n` +
        `📅 *Check-in:* ${data.checkIn}\n` +
        `📅 *Check-out:* ${data.checkOut}\n` +
        `💰 *Amount Paid:* ₹${data.totalAmount}\n\n` +
        `Complete your *online check-in* at:\n` +
        `${process.env.NEXT_PUBLIC_APP_URL}/checkin/${data.bookingRef}\n\n` +
        `This saves you time at the hotel. 🙏`,
    }),

  sendCheckinReminder: (phone: string, data: {
    guestName: string;
    bookingRef: string;
    checkIn: string;
  }) =>
    send({
      to: phone,
      message:
        `🏨 *Check-in Tomorrow!*\n\n` +
        `Dear ${data.guestName}, your check-in is on *${data.checkIn}*.\n\n` +
        `Save time by completing online check-in:\n` +
        `${process.env.NEXT_PUBLIC_APP_URL}/checkin/${data.bookingRef}`,
    }),

  sendCoupon: (phone: string, data: {
    code: string;
    hotelName: string;
    discountLabel: string; // e.g. "₹200 off" or "15% off"
    expiry?: string; // formatted expiry date, optional
    guestName?: string;
    note?: string; // optional custom line (e.g. promotion name)
  }) =>
    send({
      to: phone,
      message:
        `🎁 *A Special Offer from ${data.hotelName}!*\n\n` +
        (data.guestName ? `Dear ${data.guestName},\n\n` : "") +
        (data.note ? `${data.note}\n\n` : "") +
        `Use coupon code:\n\n*${data.code}*\n\n` +
        `🏷️ *${data.discountLabel}* on your stay.\n` +
        (data.expiry ? `⏳ Valid until *${data.expiry}*.\n` : "") +
        `\nBook directly with us to redeem. We look forward to hosting you! 🌿`,
    }),

  sendConsentDocument: (phone: string, data: {
    guestName: string;
    pdfUrl: string;
  }) =>
    send({
      to: phone,
      type: "document",
      documentUrl: data.pdfUrl,
      caption: `Dear ${data.guestName}, please read the attached declaration. Reply *I Agree* to confirm.`,
      filename: "Guest_Consent.pdf",
    }),
};
