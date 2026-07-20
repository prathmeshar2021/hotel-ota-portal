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
 * Identity & uniqueness (both enforced; safe to re-run):
 *   • Government ID is the primary key — the same ID across multiple rows
 *     collapses into ONE guest, so every ID is unique.
 *   • Phone is the secondary key and stays unique — if a phone is already held
 *     by a DIFFERENT-named person, the new row never takes that number (it is
 *     imported phone-less by ID instead, or skipped if it has no ID).
 *   • A phone-less guest (companion) can adopt a free phone from a later row
 *     that shares its ID.
 *
 * Behaviour:
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

import { PrismaClient, Gender, IdType } from "@prisma/client";
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
function mapGender(raw: string): Gender | null {
  const v = raw.trim().toUpperCase();
  if (v === "MALE" || v === "M") return "MALE";
  if (v === "FEMALE" || v === "F") return "FEMALE";
  if (v) return "OTHER";
  return null;
}

// AppSheet values: "Aadhar card" | "Driving License" | "any id photo and address proof"
function mapIdType(raw: string): IdType | null {
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

/**
 * Normalized ID key for de-duplication — strip spaces/punctuation, uppercase.
 * "296853607805" and "CG08 20100000104" collapse to a stable comparable key.
 * Returns null for values too short to be a real government ID.
 */
function normalizeId(raw: string): string | null {
  const key = raw.replace(/[\s-]/g, "").toUpperCase();
  return key.length >= 6 ? key : null;
}

/** null → undefined so Prisma create skips empty optional fields. */
function undefinedify<T extends Record<string, unknown>>(o: T): { [K in keyof T]: NonNullable<T[K]> | undefined } {
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v ?? undefined])) as never;
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

  // Fields we import; used for gap-fill comparisons in both dedup paths.
  type GapFields = {
    gender: Gender | null; address: string | null; occupation: string | null;
    idType: IdType | null; idNumber: string | null; idFrontUrl: string | null; idBackUrl: string | null;
  };
  const patchOf = (ex: GapFields, inc: GapFields): Record<string, unknown> => {
    const p: Record<string, unknown> = {};
    if (!ex.gender && inc.gender)         p.gender = inc.gender;
    if (!ex.address && inc.address)       p.address = inc.address;
    if (!ex.occupation && inc.occupation) p.occupation = inc.occupation;
    if (!ex.idType && inc.idType)         p.idType = inc.idType;
    if (!ex.idNumber && inc.idNumber)     p.idNumber = inc.idNumber;
    if (!ex.idFrontUrl && inc.idFrontUrl) p.idFrontUrl = inc.idFrontUrl;
    if (!ex.idBackUrl && inc.idBackUrl)   p.idBackUrl = inc.idBackUrl;
    return p;
  };

  type GuestRec = GapFields & { id: string; name: string; phone: string | null };
  const sameName = (a: string, b: string) =>
    a.trim().toLowerCase().replace(/\s+/g, " ") === b.trim().toLowerCase().replace(/\s+/g, " ");

  // Preload EVERY guest into two indexes — by phone and by normalized ID —
  // so both uniqueness rules hold and dedup works even in --dry-run.
  // The same record object is shared between both maps, so an update via one is
  // seen by the other.
  const byPhone = new Map<string, GuestRec>();
  const byNormId = new Map<string, GuestRec>();
  for (const g of await prisma.guest.findMany({
    select: { id: true, name: true, phone: true, gender: true, address: true, occupation: true, idType: true, idNumber: true, idFrontUrl: true, idBackUrl: true },
  })) {
    const rec = g as GuestRec;
    if (g.phone) byPhone.set(g.phone, rec);
    const k = normalizeId(g.idNumber ?? "");
    if (k && !byNormId.has(k)) byNormId.set(k, rec);
  }

  let createdPhone = 0, createdId = 0, updated = 0, unchanged = 0;
  const skipped: { reason: string; row: Record<string, string> }[] = [];
  let dryId = 0;

  async function createGuest(name: string, phone: string | null, inc: GapFields, normId: string | null): Promise<GuestRec> {
    let id = `dry_${dryId++}`;
    if (!DRY_RUN) {
      const g = await prisma.guest.create({ data: { name, phone: phone ?? undefined, ...undefinedify(inc) }, select: { id: true } });
      id = g.id;
    }
    const rec: GuestRec = { id, name, phone, ...inc };
    if (phone) byPhone.set(phone, rec);
    if (normId) byNormId.set(normId, rec);
    return rec;
  }

  async function fillGaps(rec: GuestRec, patch: Record<string, unknown>) {
    if (Object.keys(patch).length === 0) { unchanged++; return; }
    if (!DRY_RUN) await prisma.guest.update({ where: { id: rec.id }, data: patch });
    if (typeof patch.phone === "string") byPhone.set(patch.phone, rec); // newly-added phone → index it
    Object.assign(rec, patch);
    updated++;
    console.log(`✏️   Filled ${Object.keys(patch).join(", ")}  →  ${rec.name}`);
  }

  for (const row of rows) {
    const name       = col(row, "Name").trim();
    const phoneRaw   = col(row, "Contactno.", "Contact no", "Contactno", "Phone");
    const phone      = normalizePhone(phoneRaw);
    const idNumberRaw= col(row, "ID number", "ID Number", "id_number") || null;
    const normId     = normalizeId(idNumberRaw ?? "");
    const inc: GapFields = {
      gender:     mapGender(col(row, "Gender")),
      address:    col(row, "Address") || null,
      occupation: col(row, "Occupation") || null,
      idType:     mapIdType(col(row, "ID Type", "IDType", "id_type")),
      idNumber:   idNumberRaw,
      idFrontUrl: urlOrNull(col(row, "ID_front", "id_front")),
      idBackUrl:  urlOrNull(col(row, "ID_back", "id_back")),
    };

    if (!name) { skipped.push({ reason: "no name", row }); continue; }

    try {
      // 1) Same government ID = same person (strongest identity). Merge into it.
      const rec = normId ? byNormId.get(normId) : undefined;
      if (rec) {
        const patch = patchOf(rec, inc);
        // A phone-less record can adopt a free phone from a later row.
        if (!rec.phone && phone && !byPhone.has(phone)) patch.phone = phone;
        await fillGaps(rec, patch);
        continue;
      }

      // 2) Phone already taken by a DIFFERENT-named person → never reuse it.
      if (phone) {
        const holder = byPhone.get(phone);
        if (holder && !sameName(holder.name, name)) {
          if (normId) { await createGuest(name, null, inc, normId); createdId++; console.log(`✅  Created  ${name} (shared phone → kept phone-less · ID ${idNumberRaw})`); }
          else skipped.push({ reason: `phone "${phoneRaw}" already used by "${holder.name}", no ID to separate`, row });
          continue;
        }
        if (holder) { // same name on that phone → same person, just fill gaps (+ID)
          await fillGaps(holder, patchOf(holder, inc));
          if (normId && !byNormId.has(normId)) byNormId.set(normId, holder);
          continue;
        }
        // Fresh person with a free phone.
        await createGuest(name, phone, inc, normId); createdPhone++;
        console.log(`✅  Created  ${name} (${phone})`);
        continue;
      }

      // 3) No phone. Create by ID, else nothing to identify them by → skip.
      if (normId) { await createGuest(name, null, inc, normId); createdId++; console.log(`✅  Created  ${name} (no phone · ID ${idNumberRaw})`); }
      else skipped.push({ reason: `no phone & no usable ID ("${phoneRaw}")`, row });
    } catch (e) {
      skipped.push({ reason: `db error: ${e instanceof Error ? e.message : e}`, row });
    }
  }
  const created = createdPhone + createdId;

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
  console.log(`✅  Created  : ${created}   (${createdPhone} by phone · ${createdId} by ID, no phone)`);
  console.log(`✏️   Updated  : ${updated}  (gaps filled on existing guests)`);
  console.log(`⏭️   Unchanged: ${unchanged}`);
  console.log(`⚠️   Skipped  : ${skipped.length}`);
  if (DRY_RUN) console.log(`\n(dry run — nothing was written; run without --dry-run to import)`);
  console.log(`─────────────────────────────`);

  await prisma.$disconnect();
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
