import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import bcrypt from "bcryptjs";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0]);

async function main() {
  const hotel = await prisma.hotel.findFirst();
  if (!hotel) {
    console.log("❌ No hotel found in DB. Run the seed first.");
    process.exit(1);
  }
  console.log(`✅ Hotel: ${hotel.name}`);

  const existing = await prisma.hotelStaff.findFirst({
    where: { email: "admin@theurbanscape.com" },
  });
  if (existing) {
    console.log("ℹ️  Staff account already exists. Login with admin@theurbanscape.com / admin123");
    process.exit(0);
  }

  const hash = await bcrypt.hash("admin123", 12);
  await prisma.hotelStaff.create({
    data: {
      hotelId: hotel.id,
      name: "Admin",
      email: "admin@theurbanscape.com",
      password: hash,
      role: "HOTEL_ADMIN",
    },
  });

  console.log("✅ Staff account created!");
  console.log("   Email:    admin@theurbanscape.com");
  console.log("   Password: admin123");
  console.log("   Login at: http://localhost:3000/auth/staff-login");
}

main().finally(async () => {
  await prisma.$disconnect();
  await pool.end();
});
