// ─── Session messaging (free-form, requires 24h opt-in window) ───────────────
const SESSION_API = "https://api.gupshup.io/wa/api/v1/msg";

// ─── Template messaging (no opt-in required, requires Meta-approved templates) ─
// Uses the WA-namespaced template endpoint with the per-app API key,
// which is distinct from the SM API that needs a separate partner key.
const TEMPLATE_API = "https://api.gupshup.io/wa/api/v1/template/msg";

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

// ─── Session send (free-form) ─────────────────────────────────────────────────
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

  const res = await fetch(SESSION_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      apikey: apiKey,
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gupshup session error ${res.status}: ${text}`);
  }

  return res.json();
}

// ─── Template send (works without user opt-in) ────────────────────────────────
// Uses the SM API with the account-level API key (GUPSHUP_TEMPLATE_API_KEY).
// templateId     : UUID from the Gupshup template dashboard
// params         : ordered values matching {{1}}, {{2}}, ... in the template body
// headerDocument : for document-header templates — pass the dynamic PDF URL + filename
async function sendTemplate(
  phone: string,
  templateId: string,
  params: string[],
  headerDocument?: { url: string; filename: string },
) {
  const source = process.env.GUPSHUP_SOURCE_NUMBER!;
  const apiKey = process.env.GUPSHUP_API_KEY!;
  const appName = process.env.GUPSHUP_APP_NAME!;

  const destination = phone.startsWith("91") ? phone : `91${phone}`;

  // WhatsApp/Meta rejects a template send if ANY parameter is empty or contains
  // newlines/tabs — the whole message silently fails. Sanitise every param so a
  // missing value (e.g. a coupon with no promo name) can't break delivery.
  const safeParams = params.map((p) => {
    const v = (p ?? "").replace(/[\t\n\r]+/g, " ").trim();
    return v === "" ? "-" : v;
  });

  const body = new URLSearchParams({
    channel: "whatsapp",
    source,
    destination,
    template: JSON.stringify({ id: templateId, params: safeParams }),
    "src.name": appName,
  });

  if (headerDocument) {
    body.append(
      "message",
      JSON.stringify({
        type: "document",
        document: { link: headerDocument.url, filename: headerDocument.filename },
      }),
    );
  }

  const res = await fetch(TEMPLATE_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      apikey: apiKey,
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gupshup template error ${res.status}: ${text}`);
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
    payAtHotel?: boolean;
    isPartial?: boolean;
    onlinePaid?: number;
    balanceDue?: number;
  }) => {
    if (process.env.GUPSHUP_TEMPLATE_BOOKING_CONFIRMED) {
      const amountLine = data.payAtHotel
        ? `₹${data.totalAmount} due at hotel`
        : data.isPartial
          ? `₹${data.onlinePaid} paid · ₹${data.balanceDue} due at hotel`
          : `₹${data.totalAmount} paid`;

      return sendTemplate(phone, process.env.GUPSHUP_TEMPLATE_BOOKING_CONFIRMED, [
        data.guestName,
        data.bookingRef,
        data.hotelName,
        data.checkIn,
        data.checkOut,
        amountLine,
        `${process.env.NEXT_PUBLIC_APP_URL}/checkin/${data.bookingRef}`,
      ]);
    }

    // Fallback: session message (only works within 24h opt-in window)
    return send({
      to: phone,
      message:
        `✅ *Booking Confirmed!*\n\n` +
        `Dear ${data.guestName},\n\n` +
        `Your booking at *${data.hotelName}* is confirmed.\n\n` +
        `📋 *Booking Ref:* ${data.bookingRef}\n` +
        `🛏️ *Room:* ${data.roomType}\n` +
        `📅 *Check-in:* ${data.checkIn}\n` +
        `📅 *Check-out:* ${data.checkOut}\n` +
        (data.payAtHotel
          ? `💰 *Amount Due at Hotel:* ₹${data.totalAmount}\n`
          : data.isPartial
            ? `💰 *Advance Paid:* ₹${data.onlinePaid}\n💰 *Balance Due at Hotel:* ₹${data.balanceDue}\n`
            : `💰 *Amount Paid:* ₹${data.totalAmount}\n`) +
        `\nComplete your *online check-in* at:\n` +
        `${process.env.NEXT_PUBLIC_APP_URL}/checkin/${data.bookingRef}\n\n` +
        `This saves you time at the hotel. 🙏`,
    });
  },

  // Refundable security deposit link. Reuses the payment-link template when one
  // is configured ({{1}} guest, {{2}} hotel, {{3}} ref, {{4}} amount, {{5}} dates,
  // {{6}} URL); otherwise falls back to a session message.
  // Refundable security deposit link.
  //
  // Needs its OWN approved template: the phone-booking payment-link template has
  // a stay-dates parameter that a deposit has nothing sensible to put in, so
  // reusing it would send a garbled message. Params for
  // GUPSHUP_TEMPLATE_DEPOSIT_LINK: {{1}} guest, {{2}} hotel, {{3}} booking ref,
  // {{4}} amount, {{5}} payment URL.
  //
  // Wording deliberately avoids promising a full refund — staff can withhold
  // part of the deposit at checkout for damage or extra charges.
  //
  // With no template configured this falls back to a session message, which
  // only reaches guests who have messaged the hotel in the last 24h — so the
  // caller reports delivery failures rather than assuming it landed.
  sendDepositLink: (phone: string, data: {
    guestName: string;
    hotelName: string;
    bookingRef: string;
    amount: number;
    paymentUrl: string;
  }) => {
    const amount = `\u20b9${data.amount.toLocaleString("en-IN")}`;
    if (process.env.GUPSHUP_TEMPLATE_DEPOSIT_LINK) {
      return sendTemplate(phone, process.env.GUPSHUP_TEMPLATE_DEPOSIT_LINK, [
        data.guestName,
        data.hotelName,
        data.bookingRef,
        amount,
        data.paymentUrl,
      ]);
    }
    return send({
      to: phone,
      message:
        `\ud83c\udfe8 *${data.hotelName}*\n\n` +
        `Hi ${data.guestName}, please pay the refundable security deposit of ` +
        `*${amount}* for booking *${data.bookingRef}*:\n\n` +
        `${data.paymentUrl}\n\n` +
        `The deposit is returned to the same account at check-out, after any\n` +
        `deduction for extra charges or damage.`,
    });
  },

  sendPasswordResetOtp: (phone: string, data: { otp: string; name?: string }) => {
    if (process.env.GUPSHUP_TEMPLATE_OTP) {
      return sendTemplate(phone, process.env.GUPSHUP_TEMPLATE_OTP, [data.otp]);
    }
    return send({
      to: phone,
      message:
        `🔐 *Password Reset*\n\n` +
        (data.name ? `Hi ${data.name},\n\n` : "") +
        `Your password reset code is:\n\n*${data.otp}*\n\n` +
        `It is valid for 10 minutes. If you didn't request this, you can ignore this message.`,
    });
  },

  sendOwnerBookingAlert: (data: {
    guestName: string;
    guestPhone?: string;
    bookingRef: string;
    roomType: string;
    checkIn: string;
    checkOut: string;
    nights: number;
    totalAmount: number;
    payMode: string;
    source?: string;
  }) => {
    const ownerPhone = process.env.OWNER_WHATSAPP;
    if (!ownerPhone) return Promise.resolve(null);

    const payLabel =
      data.payMode === "PAY_AT_HOTEL" ? "Pay at Hotel" :
      data.payMode === "PAY_PARTIAL"  ? "Partial Paid" : "Paid Online";

    if (process.env.GUPSHUP_TEMPLATE_OWNER_ALERT) {
      return sendTemplate(ownerPhone, process.env.GUPSHUP_TEMPLATE_OWNER_ALERT, [
        data.bookingRef,
        data.guestName,
        data.guestPhone ?? "Not provided",
        data.roomType,
        `${data.checkIn} to ${data.checkOut} (${data.nights} nights)`,
        `₹${data.totalAmount.toLocaleString("en-IN")} - ${payLabel}`,
      ]);
    }

    const OTA_SOURCES = ["MMT", "GOIBIBO", "BOOKING_COM"];
    return send({
      to: ownerPhone,
      message:
        `🔔 *New Booking — ${data.bookingRef}*\n\n` +
        `👤 ${data.guestName}` + (data.guestPhone ? ` · ${data.guestPhone}` : "") + `\n` +
        `🛏️ ${data.roomType}\n` +
        `📅 ${data.checkIn} → ${data.checkOut} (${data.nights}N)\n` +
        `💰 ₹${data.totalAmount.toLocaleString("en-IN")} · ${payLabel}` +
        (data.source && OTA_SOURCES.includes(data.source) ? `\n📡 via ${data.source}` : ""),
    });
  },

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
    discountLabel: string;
    expiry?: string;
    guestName?: string;
    note?: string;
  }) => {
    if (process.env.GUPSHUP_TEMPLATE_COUPON) {
      return sendTemplate(phone, process.env.GUPSHUP_TEMPLATE_COUPON, [
        data.guestName ?? "Guest",
        data.hotelName,
        data.note?.trim() || "Here's an exclusive discount on your next stay",
        data.code,
        data.discountLabel,
        data.expiry ?? "No expiry",
      ]);
    }
    return send({
      to: phone,
      message:
        `🎁 *A Special Offer from ${data.hotelName}!*\n\n` +
        (data.guestName ? `Dear ${data.guestName},\n\n` : "") +
        (data.note ? `${data.note}\n\n` : "") +
        `Use coupon code:\n\n*${data.code}*\n\n` +
        `🏷️ *${data.discountLabel}* on your stay.\n` +
        (data.expiry ? `⏳ Valid until *${data.expiry}*.\n` : "") +
        `\nBook directly with us to redeem. We look forward to hosting you! 🌿`,
    });
  },

  sendConsentDocument: async (phone: string, data: {
    guestName: string;
    pdfUrl: string;
    acceptUrl?: string;
  }) => {
    // 1. The registration & consent form itself, as a document.
    const res = await send({
      to: phone,
      type: "document",
      documentUrl: data.pdfUrl,
      caption:
        `Dear ${data.guestName}, please review the attached Guest Registration & Consent Form for your check-in.`,
      filename: "Guest_Consent_Form.pdf",
    });

    // 2. A follow-up text with the secure link to record electronic acceptance.
    if (data.acceptUrl) {
      await send({
        to: phone,
        message:
          `✅ To complete your *paperless check-in*, tap below to review and accept:\n\n` +
          `${data.acceptUrl}\n\n` +
          `Your acceptance is recorded securely and is valid under the IT Act, 2000 & DPDP Act, 2023. 🙏`,
      });
    }

    return res;
  },

  sendInvoiceDocument: (phone: string, data: {
    guestName: string;
    hotelName: string;
    invoiceNumber: string;
    pdfUrl: string;
  }) => {
    if (process.env.GUPSHUP_TEMPLATE_INVOICE) {
      return sendTemplate(
        phone,
        process.env.GUPSHUP_TEMPLATE_INVOICE,
        [data.guestName, data.invoiceNumber, data.hotelName],
        { url: data.pdfUrl, filename: `Invoice_${data.invoiceNumber}.pdf` },
      );
    }
    // Fallback: session document message (requires 24h opt-in window)
    return send({
      to: phone,
      type: "document",
      documentUrl: data.pdfUrl,
      caption:
        `🧾 *Tax Invoice from ${data.hotelName}*\n\n` +
        `Dear ${data.guestName}, please find your GST invoice (${data.invoiceNumber}) attached. ` +
        `Thank you for staying with us! 🌿`,
      filename: `Invoice_${data.invoiceNumber}.pdf`,
    });
  },
};
