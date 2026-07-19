/**
 * One-time import of the AppSheet guest master ("Table 1") into Guest.
 *
 * Usage:
 *   1. Open the backing Google Sheet → "Table 1" tab →
 *      File → Download → Comma Separated Values (.csv)
 *   2. Save it as  scripts/appsheet/table1.csv
 *   3. Dry run (no writes):   npx tsx scripts/import-appsheet-guests.ts --dry-run
 *   4. Real run:              npx tsx scripts/import-appsheet-guests.ts
 *
 * Behaviour:
 *   • Upserts by normalized 10-digit phone. Safe to re-run.
 *   • NEW guests: all mapped fields are written.
 *   • EXISTING guests (incl. portal customers): only EMPTY fields are filled —
 *     nothing a guest or staff already entered is ever overwritten.
 *   • ID_front / ID_back are Drive file paths in AppSheet, not URLs — they are
 *     skipped unless the value is a real http(s) URL. (Image migration is a
 *     separate later phase.)
 *   • Rows without a valid phone are written to scripts/appsheet/skipped.csv
 *     for manual review.
 *
 * Expected headers (extra columns like "Row ID" are ignored):
 *   Name, ID number, Gender, Address, Occupation, Contactno., ID Type,
 *   ID_front, ID_back
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import fs from "fs";
import path from "path";

const DRY_RUN = process.argv.includes("--dry-run");

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as never);

// ─── CSV parser (RFC-4180: quoted fields may contain commas, quotes, newlines) ─
function parseCSV(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } // escaped quote
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field); field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim() !== "")) rows.push(row);

  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) =>
    Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? "").trim()]))
  );
}

// ─── Mappers (AppSheet enum values → Prisma enums) ────────────────────────────
function mapGender(raw: string): "MALE" | "FEMALE" | "OTHER" | null {
  const v = raw.trim().toUpperCase();
  if (v === "MALE" || v === "M") return "MALE";
  if (v === "FEMALE" || v === "F") return "FEMALE";
  if (v) return "OTHER";
  return null;
}

// AppSheet values: "Aadhar card" | "Driving License" | "any id photo and address proof"
function mapIdType(raw: string): "AADHAR" | "DRIVING_LICENSE" | "PASSPORT" | "VOTER_ID" | "OTHER" | null {
  const v = raw.trim().toUpperCase();
  if (!v) return null;
  if (v.includes("AADHAR") || v.includes("AADHAAR")) return "AADHAR";
  if (v.includes("DRIVING") || v === "DL") return "DRIVING_LICENSE";
  if (v.includes("PASSPORT")) return "PASSPORT";
  if (v.includes("VOTER")) return "VOTER_ID";
  return "OTHER";
}

function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  const local =
    digits.startsWith("91") && digits.length === 12 ? digits.slice(2) :
    digits.startsWith("0") && digits.length === 11 ? digits.slice(1) :
    digits;
  return /^[6-9]\d{9}$/.test(local) ? local : null;
}

/** Only real URLs — AppSheet image values are Drive paths and get skipped. */
function urlOrNull(raw: string): string | null {
  const v = raw.trim();
  return /^https?:\/\//i.test(v) ? v : null;
}

function col(row: Record<string, string>, ...names: string[]): string {
  for (const n of names) {
    const key = Object.keys(row).find((k) => k.trim().toLowerCase() === n.toLowerCase());
    if (key && row[key]) return row[key];
  }
  return "";
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const csvPath = path.resolve("scripts/appsheet/table1.csv");
  if (!fs.existsSync(csvPath)) {
    console.error("❌  File not found: scripts/appsheet/table1.csv");
    console.error("    Export the 'Table 1' tab of the AppSheet Google Sheet as CSV and save it there.");
    process.exit(1);
  }

  const rows = parseCSV(fs.readFileSync(csvPath, "utf-8"));
  console.log(`📋  ${rows.length} rows in CSV${DRY_RUN ? "   (DRY RUN — no writes)" : ""}\n`);

  let created = 0, updated = 0, unchanged = 0;
  const skipped: { reason: string; row: Record<string, string> }[] = [];

  for (const row of rows) {
    const name       = col(row, "Name");
    const phoneRaw   = col(row, "Contactno.", "Contact no", "Contactno", "Phone");
    const phone      = normalizePhone(phoneRaw);
    const gender     = mapGender(col(row, "Gender"));
    const address    = col(row, "Address") || null;
    const occupation = col(row, "Occupation") || null;
    const idType     = mapIdType(col(row, "ID Type", "IDType", "id_type"));
    const idNumber   = col(row, "ID number", "ID Number", "id_number") || null;
    const idFrontUrl = urlOrNull(col(row, "ID_front", "id_front"));
    const idBackUrl  = urlOrNull(col(row, "ID_back", "id_back"));

    if (!name.trim()) { skipped.push({ reason: "no name", row }); continue; }
    if (!phone) { skipped.push({ reason: `invalid phone "${phoneRaw}"`, row }); continue; }

    try {
      const existing = await prisma.guest.findUnique({ where: { phone } });

      if (existing) {
        // Fill gaps only — never overwrite anything already present.
        const patch: Record<string, unknown> = {};
        if (!existing.gender && gender)         patch.gender = gender;
        if (!existing.address && address)       patch.address = address;
        if (!existing.occupation && occupation) patch.occupation = occupation;
        if (!existing.idType && idType)         patch.idType = idType;
        if (!existing.idNumber && idNumber)     patch.idNumber = idNumber;
        if (!existing.idFrontUrl && idFrontUrl) patch.idFrontUrl = idFrontUrl;
        if (!existing.idBackUrl && idBackUrl)   patch.idBackUrl = idBackUrl;

        if (Object.keys(patch).length === 0) {
          unchanged++;
        } else {
          if (!DRY_RUN) await prisma.guest.update({ where: { phone }, data: patch });
          updated++;
          console.log(`✏️   Filled ${Object.keys(patch).join(", ")}  →  ${existing.name} (${phone})`);
        }
      } else {
        if (!DRY_RUN) {
          await prisma.guest.create({
            data: {
              name: name.trim(),
              phone,
              gender:     gender     ?? undefined,
              address:    address    ?? undefined,
              occupation: occupation ?? undefined,
              idType:     idType     ?? undefined,
              idNumber:   idNumber   ?? undefined,
              idFrontUrl: idFrontUrl ?? undefined,
              idBackUrl:  idBackUrl  ?? undefined,
            },
          });
        }
        created++;
        console.log(`✅  Created  ${name.trim()} (${phone})`);
      }
    } catch (e) {
      skipped.push({ reason: `db error: ${e instanceof Error ? e.message : e}`, row });
    }
  }

  // Skipped-rows report for manual review
  if (skipped.length > 0) {
    const out = path.resolve("scripts/appsheet/skipped.csv");
    const headers = Object.keys(rows[0] ?? {});
    const lines = [
      ["skip_reason", ...headers].join(","),
      ...skipped.map(({ reason, row }) =>
        [reason, ...headers.map((h) => row[h] ?? "")]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")
      ),
    ];
    fs.writeFileSync(out, lines.join("\n"));
    console.log(`\n⚠️   ${skipped.length} skipped row(s) written to scripts/appsheet/skipped.csv`);
  }

  console.log(`\n─────────────────────────────`);
  console.log(`✅  Created  : ${created}`);
  console.log(`✏️   Updated  : ${updated}  (gaps filled on existing guests)`);
  console.log(`⏭️   Unchanged: ${unchanged}`);
  console.log(`⚠️   Skipped  : ${skipped.length}`);
  if (DRY_RUN) console.log(`\n(dry run — nothing was written; run without --dry-run to import)`);
  console.log(`─────────────────────────────`);

  await prisma.$disconnect();
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
