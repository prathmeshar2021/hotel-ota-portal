import { Resend } from "resend";
import { BUSINESS } from "@/lib/constants/business";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.EMAIL_FROM ?? `${BUSINESS.brand} <noreply@theurbanescapebhilai.com>`;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "";

function shell(bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f0;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f0;padding:32px 0;">
  <tr><td align="center">
    <table width="580" cellpadding="0" cellspacing="0" style="max-width:580px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
      <!-- Header -->
      <tr><td style="background:#071209;padding:28px 32px;text-align:center;">
        <img src="${APP_URL}/logo.png" alt="${BUSINESS.brand}" width="160" style="display:block;margin:0 auto;max-width:160px;height:auto;" />
        <p style="margin:8px 0 0;color:rgba(245,158,11,0.45);font-size:11px;letter-spacing:2px;text-transform:uppercase;">By ${BUSINESS.legalName}</p>
      </td></tr>
      <!-- Body -->
      <tr><td style="padding:32px;">
        ${bodyHtml}
      </td></tr>
      <!-- Footer -->
      <tr><td style="background:#f9f9f7;border-top:1px solid #eee;padding:20px 32px;text-align:center;">
        <p style="margin:0;color:#888;font-size:12px;">${BUSINESS.brand} · ${BUSINESS.addressLines.join(", ")}</p>
        <p style="margin:4px 0 0;color:#aaa;font-size:11px;">${BUSINESS.phone} · <a href="mailto:${BUSINESS.email}" style="color:#aaa;">${BUSINESS.email}</a></p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

function row(label: string, value: string) {
  return `<tr>
    <td style="padding:6px 0;color:#666;font-size:13px;width:140px;vertical-align:top;">${label}</td>
    <td style="padding:6px 0;color:#111;font-size:13px;font-weight:600;vertical-align:top;">${value}</td>
  </tr>`;
}

async function send(to: string, subject: string, html: string) {
  await resend.emails.send({ from: FROM, to: [to], subject, html });
}

export const email = {
  sendBookingConfirmation: (
    to: string,
    data: {
      guestName: string;
      bookingRef: string;
      hotelName: string;
      roomType: string;
      checkIn: string;
      checkOut: string;
      totalAmount: number;
      onlinePaid?: number;
      balanceDue?: number;
      isPartial?: boolean;
      payAtHotel?: boolean;
    }
  ) => {
    const amountRow =
      data.payAtHotel
        ? row("Due at Hotel", `₹${data.totalAmount.toLocaleString("en-IN")}`)
        : data.isPartial
        ? row("Advance Paid", `₹${(data.onlinePaid ?? 0).toLocaleString("en-IN")}`) +
          row("Balance Due", `₹${(data.balanceDue ?? 0).toLocaleString("en-IN")} at hotel`)
        : row("Amount Paid", `₹${data.totalAmount.toLocaleString("en-IN")}`);

    const notice =
      (data.payAtHotel || data.isPartial)
        ? `<div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:14px 16px;margin:20px 0;">
            <p style="margin:0;color:#92400e;font-size:13px;font-weight:600;">💰 Balance due at check-in</p>
            <p style="margin:4px 0 0;color:#92400e;font-size:13px;">Please carry ₹${(data.balanceDue ?? data.totalAmount).toLocaleString("en-IN")}. We accept cash and UPI at the front desk.</p>
          </div>`
        : "";

    const html = shell(`
      <p style="margin:0 0 4px;color:#333;font-size:16px;font-weight:700;">Booking Confirmed ✓</p>
      <p style="margin:0 0 24px;color:#666;font-size:14px;">Dear ${data.guestName}, your stay at <strong>${data.hotelName}</strong> is confirmed.</p>

      <div style="background:#f9f9f7;border-radius:8px;padding:16px 20px;margin-bottom:20px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          ${row("Booking Ref", data.bookingRef)}
          ${row("Room", data.roomType)}
          ${row("Check-in", data.checkIn)}
          ${row("Check-out", data.checkOut)}
          ${amountRow}
        </table>
      </div>

      ${notice}

      <a href="${APP_URL}/checkin/${data.bookingRef}" style="display:block;background:#F59E0B;color:#000;font-weight:700;font-size:14px;text-align:center;padding:13px 24px;border-radius:8px;text-decoration:none;margin-bottom:16px;">Complete Online Check-in →</a>
      <a href="${APP_URL}/my-bookings" style="display:block;background:#f4f4f0;color:#555;font-size:13px;text-align:center;padding:11px 24px;border-radius:8px;text-decoration:none;">View My Bookings</a>

      <p style="margin:24px 0 0;color:#999;font-size:12px;">Save time at check-in by uploading your ID in the online check-in portal.</p>
    `);
    return send(to, `Booking Confirmed – ${data.bookingRef}`, html);
  },

  sendCancellationConfirmation: (
    to: string,
    data: {
      guestName: string;
      bookingRef: string;
      hotelName: string;
      checkIn: string;
      cancellationCharge: number;
      totalRefund: number;
      tier: string;
    }
  ) => {
    const refundNote =
      data.totalRefund > 0
        ? `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px 16px;margin:20px 0;">
            <p style="margin:0;color:#166534;font-size:13px;font-weight:600;">Refund: ₹${data.totalRefund.toLocaleString("en-IN")}</p>
            <p style="margin:4px 0 0;color:#166534;font-size:13px;">Will reflect in your account within ${BUSINESS.refundWindow}.</p>
          </div>`
        : `<div style="background:#fff1f2;border:1px solid #fecdd3;border-radius:8px;padding:14px 16px;margin:20px 0;">
            <p style="margin:0;color:#9f1239;font-size:13px;">No refund applies for ${data.tier.toLowerCase().replace("_", " ")} cancellation.</p>
          </div>`;

    const html = shell(`
      <p style="margin:0 0 4px;color:#333;font-size:16px;font-weight:700;">Booking Cancelled</p>
      <p style="margin:0 0 24px;color:#666;font-size:14px;">Dear ${data.guestName}, your booking at <strong>${data.hotelName}</strong> has been cancelled.</p>

      <div style="background:#f9f9f7;border-radius:8px;padding:16px 20px;margin-bottom:20px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          ${row("Booking Ref", data.bookingRef)}
          ${row("Check-in Date", data.checkIn)}
          ${row("Cancellation Type", data.tier.replace("_", " "))}
          ${row("Charge Deducted", `₹${data.cancellationCharge.toLocaleString("en-IN")}`)}
        </table>
      </div>

      ${refundNote}

      <a href="${APP_URL}/my-bookings" style="display:block;background:#f4f4f0;color:#555;font-size:13px;text-align:center;padding:11px 24px;border-radius:8px;text-decoration:none;">View My Bookings</a>
    `);
    return send(to, `Booking Cancelled – ${data.bookingRef}`, html);
  },

  sendPasswordResetOtp: (
    to: string,
    data: { otp: string; name?: string }
  ) => {
    const html = shell(`
      <p style="margin:0 0 4px;color:#333;font-size:16px;font-weight:700;">Password Reset</p>
      <p style="margin:0 0 24px;color:#666;font-size:14px;">${data.name ? `Hi ${data.name}, use` : "Use"} the code below to reset your password.</p>

      <div style="background:#f9f9f7;border-radius:8px;padding:24px;text-align:center;margin-bottom:20px;">
        <p style="margin:0;color:#666;font-size:12px;text-transform:uppercase;letter-spacing:2px;">Your OTP</p>
        <p style="margin:8px 0 0;color:#111;font-size:36px;font-weight:700;letter-spacing:8px;font-family:monospace;">${data.otp}</p>
        <p style="margin:8px 0 0;color:#999;font-size:12px;">Valid for 10 minutes</p>
      </div>

      <p style="margin:0;color:#999;font-size:12px;">If you didn't request this, you can safely ignore this email.</p>
    `);
    return send(to, `Password Reset OTP – ${BUSINESS.brand}`, html);
  },

  sendInvoice: (
    to: string,
    data: {
      guestName: string;
      invoiceNumber: string;
      pdfUrl: string;
    }
  ) => {
    const html = shell(`
      <p style="margin:0 0 4px;color:#333;font-size:16px;font-weight:700;">Tax Invoice</p>
      <p style="margin:0 0 24px;color:#666;font-size:14px;">Dear ${data.guestName}, your GST invoice from ${BUSINESS.brand} is ready.</p>

      <div style="background:#f9f9f7;border-radius:8px;padding:16px 20px;margin-bottom:20px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          ${row("Invoice No.", data.invoiceNumber)}
          ${row("GSTIN", BUSINESS.gstin)}
        </table>
      </div>

      <a href="${data.pdfUrl}" style="display:block;background:#F59E0B;color:#000;font-weight:700;font-size:14px;text-align:center;padding:13px 24px;border-radius:8px;text-decoration:none;">Download Invoice PDF →</a>

      <p style="margin:24px 0 0;color:#999;font-size:12px;">The link above opens the invoice directly. Keep it for your records.</p>
    `);
    return send(to, `Tax Invoice ${data.invoiceNumber} – ${BUSINESS.brand}`, html);
  },

  sendSupportReply: (
    to: string,
    data: {
      guestName: string;
      staffName: string;
      message: string;
    }
  ) => {
    const html = shell(`
      <p style="margin:0 0 4px;color:#333;font-size:16px;font-weight:700;">New reply from ${BUSINESS.brand}</p>
      <p style="margin:0 0 24px;color:#666;font-size:14px;">Hi ${data.guestName}, <strong>${data.staffName}</strong> replied to your support query.</p>

      <div style="background:#f0fdf4;border-left:4px solid #22c55e;padding:14px 16px;border-radius:0 8px 8px 0;margin-bottom:20px;">
        <p style="margin:0;color:#111;font-size:14px;">${data.message.replace(/\n/g, "<br>")}</p>
      </div>

      <a href="${APP_URL}/support" style="display:block;background:#F59E0B;color:#000;font-weight:700;font-size:14px;text-align:center;padding:13px 24px;border-radius:8px;text-decoration:none;">Open Chat →</a>
    `);
    return send(to, `Reply from ${BUSINESS.brand} – Support`, html);
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
  }) => {
    const ownerEmail = process.env.OWNER_EMAIL;
    if (!ownerEmail) return Promise.resolve(undefined);

    const payLabel =
      data.payMode === "PAY_AT_HOTEL" ? "Pay at Hotel" :
      data.payMode === "PAY_PARTIAL"  ? "Partial Payment" : "Paid Online";

    const html = shell(`
      <p style="margin:0 0 4px;color:#333;font-size:16px;font-weight:700;">New Booking Received</p>
      <p style="margin:0 0 24px;color:#666;font-size:14px;">A new booking has just been confirmed on the portal.</p>

      <div style="background:#f9f9f7;border-radius:8px;padding:16px 20px;margin-bottom:20px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          ${row("Booking Ref", data.bookingRef)}
          ${row("Guest", data.guestName + (data.guestPhone ? ` · ${data.guestPhone}` : ""))}
          ${row("Room", data.roomType)}
          ${row("Check-in", data.checkIn)}
          ${row("Check-out", data.checkOut)}
          ${row("Nights", String(data.nights))}
          ${row("Total Amount", `₹${data.totalAmount.toLocaleString("en-IN")}`)}
          ${row("Payment Mode", payLabel)}
        </table>
      </div>

      <a href="${APP_URL}/hotel-admin/bookings" style="display:block;background:#F59E0B;color:#000;font-weight:700;font-size:14px;text-align:center;padding:13px 24px;border-radius:8px;text-decoration:none;">View in Admin Panel →</a>
    `);
    return send(ownerEmail, `New Booking – ${data.bookingRef} | ${data.roomType}`, html);
  },

  /**
   * A booking was archived by staff. Sent to the owner every time, because this
   * is the one action that makes a booking — and any money on it — disappear
   * from the panel, so it should never happen without them hearing about it.
   */
  sendOwnerBookingDeleted: (data: {
    bookingRef: string;
    guestName: string;
    guestPhone?: string;
    roomType: string;
    checkIn: string;
    checkOut: string;
    status: string;
    totalAmount: number;
    amountPaid: number;
    deletedBy: string;
    reason?: string;
  }) => {
    const ownerEmail = process.env.OWNER_EMAIL;
    if (!ownerEmail) return Promise.resolve(undefined);

    const html = shell(`
      <p style="margin:0 0 4px;color:#B91C1C;font-size:16px;font-weight:700;">Booking Deleted</p>
      <p style="margin:0 0 24px;color:#666;font-size:14px;">${data.deletedBy} removed a booking from the admin panel. It no longer holds a room or counts towards your accounts.</p>

      <div style="background:#f9f9f7;border-radius:8px;padding:16px 20px;margin-bottom:20px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          ${row("Booking Ref", data.bookingRef)}
          ${row("Guest", data.guestName + (data.guestPhone ? ` · ${data.guestPhone}` : ""))}
          ${row("Room", data.roomType)}
          ${row("Stay", `${data.checkIn} → ${data.checkOut}`)}
          ${row("Status when deleted", data.status)}
          ${row("Booking Total", `₹${data.totalAmount.toLocaleString("en-IN")}`)}
          ${row("Amount Paid", `₹${data.amountPaid.toLocaleString("en-IN")}`)}
          ${row("Deleted By", data.deletedBy)}
          ${row("Reason", data.reason || "Not given")}
        </table>
      </div>

      ${data.amountPaid > 0 ? `<p style="margin:0 0 20px;padding:12px 16px;background:#FEF2F2;border-left:3px solid #B91C1C;color:#7F1D1D;font-size:13px;line-height:1.6;">₹${data.amountPaid.toLocaleString("en-IN")} had been collected on this booking. That money has been removed from your revenue figures — check whether it needs refunding.</p>` : ""}

      <p style="margin:0 0 20px;color:#666;font-size:13px;line-height:1.6;">Nothing has been erased. The booking, its payments and any tax invoice are retained and can be restored.</p>

      <a href="${APP_URL}/hotel-admin/bookings" style="display:block;background:#F59E0B;color:#000;font-weight:700;font-size:14px;text-align:center;padding:13px 24px;border-radius:8px;text-decoration:none;">Open Admin Panel →</a>
    `);
    return send(ownerEmail, `Booking Deleted – ${data.bookingRef} | ${data.guestName}`, html);
  },
};
