import { prisma } from "@/lib/db/prisma";
import { email } from "@/lib/services/email";
import { gupshup } from "@/lib/services/gupshup";
import {
  buildDailyAccounts,
  renderDailyAccountsPdf,
  sheetFilename,
  sheetHeadlines,
  sheetTitleDate,
  signedSheetUrl,
} from "@/lib/services/daily-accounts";

export interface DeliveryResult {
  hotel: string;
  date: string;
  checkins: number;
  moneyIn: number;
  moneyOut: number;
  drawer: number;
  balances: boolean;
  email: string;
  whatsapp: string;
}

const describe = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 300);

/**
 * Builds the day's sheet for every active hotel and sends it to the owner by
 * email and WhatsApp. The two go independently: one failing never stops the
 * other, and each says what happened in the result, so a missing sheet can be
 * traced from the cron log instead of guessed at.
 */
export async function deliverDailyAccounts(opts: { date: string; dryRun?: boolean; now?: Date }): Promise<DeliveryResult[]> {
  const hotels = await prisma.hotel.findMany({ where: { isActive: true }, select: { id: true } });
  const results: DeliveryResult[] = [];

  for (const h of hotels) {
    const sheet = await buildDailyAccounts(h.id, opts.date, opts.now);
    const pdf = Buffer.from(renderDailyAccountsPdf(sheet));
    const filename = sheetFilename(sheet);
    const dateLabel = sheetTitleDate(sheet.date);
    // Messages can carry ₹; only the PDF's font cannot.
    const hl = Object.fromEntries(
      Object.entries(sheetHeadlines(sheet)).map(([k, v]) => [k, v.replace(/Rs\. /g, "₹")]),
    ) as ReturnType<typeof sheetHeadlines>;

    const result: DeliveryResult = {
      hotel: sheet.hotelName,
      date: sheet.date,
      checkins: sheet.checkins.length,
      moneyIn: sheet.moneyIn.total,
      moneyOut: sheet.moneyOut.total,
      drawer: sheet.drawer.closing,
      balances: sheet.drawer.balances,
      email: "dry run",
      whatsapp: "dry run",
    };
    if (!sheet.drawer.balances) {
      console.error("[daily-accounts] drawer did not balance", sheet.date, sheet.drawer);
    }

    if (!opts.dryRun) {
      const [mail, wa] = await Promise.allSettled([
        email.sendOwnerDailyAccounts({ dateLabel, ...hl, pdf, filename }),
        (async () => {
          if (!process.env.OWNER_WHATSAPP) return "skipped: OWNER_WHATSAPP is not set";
          const pdfUrl = signedSheetUrl(h.id, sheet.date);
          await gupshup.sendOwnerDailyAccounts({
            pdfUrl,
            filename,
            caption:
              `*Daily Accounts — ${dateLabel}*\n` +
              `Check-ins: ${hl.checkins}\n` +
              `Money received: ${hl.moneyIn}\n` +
              `Money paid out: ${hl.moneyOut}\n` +
              `Cash in drawer at 11 pm: ${hl.drawer}`,
            params: [dateLabel, hl.checkins, hl.moneyIn, hl.moneyOut, hl.drawer],
          });
          return process.env.GUPSHUP_TEMPLATE_DAILY_ACCOUNTS
            ? "submitted (template)"
            : "submitted (session message — delivered only if the owner messaged the business number in the last 24 hours)";
        })(),
      ]);
      result.email = mail.status === "fulfilled"
        ? ("sentTo" in mail.value ? `sent to ${mail.value.sentTo}` : `skipped: ${mail.value.skipped}`)
        : `failed: ${describe(mail.reason)}`;
      result.whatsapp = wa.status === "fulfilled" ? wa.value : `failed: ${describe(wa.reason)}`;
    }

    results.push(result);
  }
  return results;
}
