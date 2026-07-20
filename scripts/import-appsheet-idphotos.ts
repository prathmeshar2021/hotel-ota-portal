/**
 * Migrate guest ID photos from (temporarily public) Google Drive → Cloudinary,
 * and attach them to already-imported guests.
 *
 * Source: the Guest_registration_form export, whose ID_front / ID_back columns
 * hold Google Drive links. Cloudinary fetches each Drive image by URL directly
 * (no local download), stores it in the same `guest_ids` folder the app uses,
 * and we set idFrontUrl / idBackUrl on the matching guest.
 *
 * Usage:
 *   1. Make the Drive ID-photos folder public (link-viewable) TEMPORARILY.
 *   2. Export the registration-form tab as CSV → scripts/appsheet/regform.csv
 *   3. Test on a few first:   npx tsx scripts/import-appsheet-idphotos.ts --limit 5
 *   4. Full run:              npx tsx scripts/import-appsheet-idphotos.ts
 *   5. ⚠️  Make the Drive folder PRIVATE again immediately after.
 *
 * Safe + resumable:
 *   • Only fills a side (front/back) that the guest is missing — re-runnable.
 *   • Matches a guest by phone, then by normalized ID number.
 *   • Unmatched / unfetchable rows are reported; nothing else is touched.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import fs from "fs";
import path from "path";

const CLOUD = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
const PRESET = "hotel_ota_upload";
const FOLDER = "guest_ids";

const LIMIT = (() => {
  const i = process.argv.indexOf("--limit");
  return i >= 0 ? parseInt(process.argv[i + 1], 10) : Infinity;
})();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) } as never);

// ─── CSV (RFC-4180) ────────────────────────────────────────────────────────────
function parseCSV(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = "", row: string[] = [], q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((x) => x.trim() !== "")) rows.push(row);
  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? "").trim()])));
}

function col(row: Record<string, string>, ...names: string[]): string {
  for (const n of names) {
    const k = Object.keys(row).find((x) => x.trim().toLowerCase() === n.toLowerCase());
    if (k && row[k]) return row[k];
  }
  return "";
}

function normalizePhone(raw: string): string | null {
  const d = raw.replace(/\D/g, "");
  const local = d.startsWith("91") && d.length === 12 ? d.slice(2) : d.startsWith("0") && d.length === 11 ? d.slice(1) : d;
  return /^[6-9]\d{9}$/.test(local) ? local : null;
}
function normalizeId(raw: string): string | null {
  const k = raw.replace(/[\s-]/g, "").toUpperCase();
  return k.length >= 6 ? k : null;
}

/** Pull the Drive file id out of any common link/path shape. */
function driveFileId(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  const patterns = [
    /\/file\/d\/([a-zA-Z0-9_-]{20,})/,   // .../file/d/<id>/view
    /[?&]id=([a-zA-Z0-9_-]{20,})/,       // ...open?id=<id> , uc?id=<id>
    /\/d\/([a-zA-Z0-9_-]{20,})/,          // lh3.../d/<id>
  ];
  for (const p of patterns) { const m = v.match(p); if (m) return m[1]; }
  if (/^[a-zA-Z0-9_-]{20,}$/.test(v)) return v; // bare id
  return null;
}

/** Ask Cloudinary to fetch a public image URL and store it. Returns secure_url. */
async function uploadRemote(imageUrl: string, folder = FOLDER): Promise<string> {
  const form = new FormData();
  form.append("file", imageUrl);
  form.append("upload_preset", PRESET);
  form.append("folder", folder);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD}/image/upload`, { method: "POST", body: form });
  const data = await res.json();
  if (!res.ok || !data.secure_url) throw new Error(data?.error?.message || `HTTP ${res.status}`);
  return data.secure_url as string;
}

/** Upload a Drive file id via Cloudinary remote fetch (CDN URL, then download URL). */
async function migratePhoto(fileId: string): Promise<string> {
  const candidates = [
    `https://lh3.googleusercontent.com/d/${fileId}`,
    `https://drive.google.com/uc?export=download&id=${fileId}`,
  ];
  let lastErr: unknown;
  for (const url of candidates) {
    try { return await uploadRemote(url); } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  if (!CLOUD) { console.error("❌  NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME not set"); process.exit(1); }
  const csvPath = path.resolve("scripts/appsheet/regform.csv");
  if (!fs.existsSync(csvPath)) {
    console.error("❌  scripts/appsheet/regform.csv not found. Export the registration-form tab as CSV.");
    process.exit(1);
  }

  const rows = parseCSV(fs.readFileSync(csvPath, "utf-8"));
  console.log(`📋  ${rows.length} form rows${LIMIT !== Infinity ? `  (processing first ${LIMIT})` : ""}\n`);

  let front = 0, back = 0, matched = 0;
  const unmatched: string[] = [];
  const failed: string[] = [];
  let processed = 0;

  for (const row of rows) {
    if (processed >= LIMIT) break;

    const name  = col(row, "Name");
    const phone = normalizePhone(col(row, "Contactno.", "Contact no", "Phone"));
    const normId = normalizeId(col(row, "ID number", "ID Number"));
    const frontId = driveFileId(col(row, "ID_front", "id_front"));
    const backId  = driveFileId(col(row, "ID_back", "id_back"));
    if (!frontId && !backId) continue; // nothing to migrate for this row

    // Match the guest we already imported.
    let guest = phone ? await prisma.guest.findUnique({ where: { phone } }) : null;
    if (!guest && normId) {
      const all = await prisma.guest.findMany({ where: { idNumber: { not: null } }, select: { id: true, idNumber: true, idFrontUrl: true, idBackUrl: true, name: true } });
      guest = (all.find((g) => normalizeId(g.idNumber ?? "") === normId) ?? null) as never;
    }
    if (!guest) { unmatched.push(`${name} (${phone ?? "no phone"})`); continue; }

    processed++;
    matched++;
    const patch: Record<string, string> = {};

    if (frontId && !guest.idFrontUrl) {
      try { patch.idFrontUrl = await migratePhoto(frontId); front++; }
      catch (e) { failed.push(`${name} front: ${e instanceof Error ? e.message : e}`); }
    }
    if (backId && !guest.idBackUrl) {
      try { patch.idBackUrl = await migratePhoto(backId); back++; }
      catch (e) { failed.push(`${name} back: ${e instanceof Error ? e.message : e}`); }
    }

    if (Object.keys(patch).length > 0) {
      await prisma.guest.update({ where: { id: guest.id }, data: patch });
      console.log(`🖼️   ${name}: ${Object.keys(patch).map((k) => k.replace("Url", "")).join(" + ")}`);
    }
  }

  console.log(`\n─────────────────────────────`);
  console.log(`👤  Guests matched : ${matched}`);
  console.log(`🖼️   Front uploaded : ${front}`);
  console.log(`🖼️   Back uploaded  : ${back}`);
  console.log(`❓  Unmatched rows : ${unmatched.length}`);
  console.log(`❌  Failed uploads : ${failed.length}`);
  console.log(`─────────────────────────────`);
  if (unmatched.length) console.log(`\nUnmatched (no guest for these form rows):\n  ${unmatched.slice(0, 20).join("\n  ")}${unmatched.length > 20 ? `\n  …and ${unmatched.length - 20} more` : ""}`);
  if (failed.length) console.log(`\nFailed:\n  ${failed.slice(0, 20).join("\n  ")}`);

  await prisma.$disconnect();
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
