import { prisma } from '../src/lib/db/prisma';

async function main() {
  const hotel = await prisma.hotel.findFirst({ select: { id: true, amenities: true } });
  console.log('Current amenities:', hotel?.amenities);
  if (!hotel) { console.log('No hotel found'); return; }
  const updated = hotel.amenities.filter(a => a !== '24/7 Front Desk');
  await prisma.hotel.update({ where: { id: hotel.id }, data: { amenities: updated } });
  console.log('Updated amenities:', updated);
}

main().then(() => prisma.$disconnect()).catch(e => { console.error(e); process.exit(1); });
