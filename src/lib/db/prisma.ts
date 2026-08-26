import { PrismaClient, type Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

declare global {
  // eslint-disable-next-line no-var
  var prismaBase: PrismaClient | undefined;
}

function createPrismaClient() {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    // Serverless: limit to 1 connection per Lambda instance to avoid exhausting
    // Supabase's connection pool (15-connection limit in session mode).
    max: 1,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
  });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0]);
}

/**
 * Unfiltered client. Only the archive/restore endpoints and maintenance scripts
 * should reach for this — everything else wants `prisma`, below.
 */
export const prismaBase = globalThis.prismaBase ?? createPrismaClient();
if (process.env.NODE_ENV !== "production") globalThis.prismaBase = prismaBase;

/** Reads that must never see an archived booking. */
const READS = [
  "findFirst", "findFirstOrThrow", "findMany", "findUnique", "findUniqueOrThrow",
  "count", "aggregate", "groupBy",
] as const;

/**
 * Hide archived bookings from every read, everywhere.
 *
 * Staff can archive a booking ("delete" in the UI). The row survives, because
 * its payments and its GST invoice are records we're required to keep and the
 * invoice sequence must stay unbroken — but the booking has to vanish from
 * lists, the room board, availability, and the accounts statement.
 *
 * Doing that by editing each query would mean touching ~80 call sites and
 * trusting every future one to remember. One archived booking still occupying a
 * room, or still counted as revenue, is exactly the bug that would follow. So
 * the filter lives here: `deletedAt: null` is injected into every Booking read
 * and every BookingTxn read whose booking is archived.
 *
 * To deliberately include archived rows, pass `deletedAt` yourself in the where
 * clause (the archive/restore routes do) or use `prismaBase`.
 */
export const prisma = prismaBase.$extends({
  name: "hide-archived-bookings",
  query: {
    booking: Object.fromEntries(
      READS.map((op) => [
        op,
        ({ args, query }: { args: Record<string, unknown>; query: (a: unknown) => unknown }) => {
          const a = (args ?? {}) as { where?: Record<string, unknown> };
          const where = (a.where ?? {}) as Record<string, unknown>;
          // An explicit deletedAt means the caller knows what it's asking for.
          if (!("deletedAt" in where)) {
            a.where = { ...where, deletedAt: null };
          }
          return query(a);
        },
      ])
    ),
    bookingTxn: Object.fromEntries(
      READS.map((op) => [
        op,
        ({ args, query }: { args: Record<string, unknown>; query: (a: unknown) => unknown }) => {
          const a = (args ?? {}) as { where?: Record<string, unknown> };
          const where = (a.where ?? {}) as Record<string, unknown>;
          // Money belonging to an archived booking leaves the statement with it.
          if (!("booking" in where)) {
            a.where = { ...where, booking: { deletedAt: null } };
          }
          return query(a);
        },
      ])
    ),
  },
}) as unknown as PrismaClient;

export type { Prisma };
