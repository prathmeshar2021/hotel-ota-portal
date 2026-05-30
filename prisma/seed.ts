import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import bcrypt from "bcryptjs";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as any);

async function main() {
  console.log("Seeding database...\n");

  // ─── 1. Create The Urban Escape hotel ────────────────────────────────────────

  const hotel = await prisma.hotel.upsert({
    where: { slug: "the-urban-escape-bhilai" },
    update: {},
    create: {
      name: "The Urban Escape, By Saubhagya Mangalam",
      slug: "the-urban-escape-bhilai",
      email: "theurbanescapebhilai@gmail.com",
      phone: "9876543210",
      description:
        "A serene retreat nestled in the heart of Bhilai. The Urban Escape offers luxury cottages with forest views, comfortable AC rooms, and budget-friendly Non-AC rooms. Perfect for families, couples, and solo travellers seeking a peaceful getaway.",
      address: "Near Civic Center, Bhilai",
      city: "Bhilai",
      state: "Chhattisgarh",
      pincode: "490006",
      starRating: 3,
      checkInTime: "12:00",
      checkOutTime: "11:00",
      isActive: true,
      isApproved: true,
      amenities: [
        "Free Wi-Fi",
        "Parking",
        "Room Service",
        "CCTV Security",
        "Power Backup",
        "Forest View",
        "Garden",
        "24/7 Front Desk",
      ],
      images: [],
    },
  });

  console.log(`Hotel created: ${hotel.name} (${hotel.id})`);

  // ─── 2. Create 15 rooms ──────────────────────────────────────────────────────

  // 6 Luxury Cottages
  const luxuryCottages = Array.from({ length: 6 }, (_, i) => ({
    hotelId: hotel.id,
    roomNumber: `LC-${i + 1}`,
    roomType: "LUXURY_COTTAGE" as const,
    floor: 0,
    capacity: 5,
    basePrice: 2500,
    description:
      "Spacious air-conditioned luxury cottage with a beautiful forest view. Ideal for families and groups of up to 5 guests.",
    amenities: [
      "Air Conditioning",
      "Forest View",
      "Attached Bathroom",
      "Hot Water",
      "TV",
      "Free Wi-Fi",
      "Room Service",
    ],
    images: [],
    isActive: true,
  }));

  // 5 AC Rooms
  const acRooms = Array.from({ length: 5 }, (_, i) => ({
    hotelId: hotel.id,
    roomNumber: `AC-${i + 1}`,
    roomType: "AC_ROOM" as const,
    floor: 1,
    capacity: 2,
    basePrice: 1200,
    description:
      "Comfortable air-conditioned room with modern amenities. Perfect for couples and solo travellers.",
    amenities: [
      "Air Conditioning",
      "Attached Bathroom",
      "Hot Water",
      "TV",
      "Free Wi-Fi",
    ],
    images: [],
    isActive: true,
  }));

  // 4 Non-AC Rooms
  const nonAcRooms = Array.from({ length: 4 }, (_, i) => ({
    hotelId: hotel.id,
    roomNumber: `NAC-${i + 1}`,
    roomType: "NON_AC_ROOM" as const,
    floor: 1,
    capacity: 2,
    basePrice: 800,
    description:
      "Budget-friendly room with essential amenities. Great for short stays and budget-conscious travellers.",
    amenities: [
      "Fan",
      "Attached Bathroom",
      "Hot Water",
      "Free Wi-Fi",
    ],
    images: [],
    isActive: true,
  }));

  const allRooms = [...luxuryCottages, ...acRooms, ...nonAcRooms];

  let createdCount = 0;
  for (const room of allRooms) {
    await prisma.room.upsert({
      where: {
        hotelId_roomNumber: {
          hotelId: hotel.id,
          roomNumber: room.roomNumber,
        },
      },
      update: {},
      create: room,
    });
    createdCount++;
  }

  console.log(`Rooms created: ${createdCount} rooms`);
  console.log("  - 6 Luxury Cottages (LC-1 to LC-6) @ Rs.2500/night, capacity 5");
  console.log("  - 5 AC Rooms (AC-1 to AC-5) @ Rs.1200/night, capacity 2");
  console.log("  - 4 Non-AC Rooms (NAC-1 to NAC-4) @ Rs.800/night, capacity 2");

  // ─── 3. Create a hotel admin account ─────────────────────────────────────────

  const adminPassword = await bcrypt.hash("admin123", 12);

  const admin = await prisma.hotelStaff.upsert({
    where: { email: "admin@urbanescape.com" },
    update: {},
    create: {
      hotelId: hotel.id,
      name: "Hotel Admin",
      email: "admin@urbanescape.com",
      password: adminPassword,
      role: "HOTEL_ADMIN",
      phone: "9876543210",
      isActive: true,
    },
  });

  console.log(`\nHotel admin created: ${admin.email} (password: admin123)`);

  // ─── 4. Create a super admin account ─────────────────────────────────────────

  const superPassword = await bcrypt.hash("superadmin123", 12);

  const superAdmin = await prisma.superAdmin.upsert({
    where: { email: "superadmin@stayindia.com" },
    update: {},
    create: {
      name: "Super Admin",
      email: "superadmin@stayindia.com",
      password: superPassword,
    },
  });

  console.log(`Super admin created: ${superAdmin.email} (password: superadmin123)`);

  // ─── 5. Create a sample coupon ───────────────────────────────────────────────

  await prisma.coupon.upsert({
    where: { code: "WELCOME10" },
    update: {},
    create: {
      hotelId: hotel.id,
      code: "WELCOME10",
      discountType: "PERCENT",
      discountValue: 10,
      minAmount: 1000,
      maxDiscount: 500,
      maxUses: 100,
      usedCount: 0,
      isActive: true,
      expiryDate: new Date("2027-12-31"),
    },
  });

  console.log(`\nSample coupon created: WELCOME10 (10% off, max Rs.500)`);

  console.log("\n--- Seeding complete! ---\n");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
