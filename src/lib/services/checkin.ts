import { prisma } from "@/lib/db/prisma";

/**
 * Shared online/self check-in logic. Both the customer route
 * (`/api/checkin`, session-authenticated) and the kiosk route
 * (`/api/kiosk/checkin`, device + verified-lookup authenticated) call this so
 * the register-writing behaviour is identical and lives in one place.
 */

export type IdTypeEnum =
  | "AADHAR" | "DRIVING_LICENSE" | "PASSPORT" | "VOTER_ID" | "OTHER";

export interface CompanionInput {
  name: string;
  relation?: string;
  idType?: string;
  idNumber?: string;
  idFrontUrl?: string;
  idBackUrl?: string;
}

export interface CheckinData {
  idType: IdTypeEnum;
  idNumber: string;
  idFrontUrl: string;
  idBackUrl: string;
  comingFrom: string;
  goingTo: string;
  purpose: string;
  vehicleNo?: string;
  expectedCheckInTime: string;
  expectedCheckOutTime: string;
  companions?: CompanionInput[];
}

/** Thrown for guest-facing validation failures; carries an HTTP status. */
export class CheckinError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export async function performCheckin(params: {
  bookingId: string;
  primaryGuestId: string;
  noOfPersons: number;
  data: CheckinData;
}): Promise<void> {
  const { bookingId, primaryGuestId, noOfPersons, data } = params;

  // Group booking: require at least 1 fully-detailed companion.
  if (noOfPersons > 1) {
    const validCompanions = (data.companions ?? []).filter(
      (c) => c.name?.trim() && c.idNumber?.trim() && c.idFrontUrl && c.idBackUrl
    );
    if (validCompanions.length < 1) {
      throw new CheckinError(
        "Group booking requires at least 1 companion's name, ID number, and ID photos"
      );
    }
  }

  // 1. Update primary guest ID on their profile.
  await prisma.guest.update({
    where: { id: primaryGuestId },
    data: {
      idType: data.idType,
      idNumber: data.idNumber,
      idFrontUrl: data.idFrontUrl,
      idBackUrl: data.idBackUrl,
    },
  });

  // 2. Upsert the online check-in record.
  const checkinFields = {
    comingFrom: data.comingFrom,
    goingTo: data.goingTo,
    purpose: data.purpose,
    vehicleNo: data.vehicleNo,
    expectedCheckInTime: data.expectedCheckInTime,
    expectedCheckOutTime: data.expectedCheckOutTime,
    completedAt: new Date(),
  };
  await prisma.onlineCheckin.upsert({
    where: { bookingId },
    create: { bookingId, guestId: primaryGuestId, ...checkinFields },
    update: checkinFields,
  });

  // 3. Replace companions.
  await prisma.bookingCompanion.deleteMany({ where: { bookingId } });

  const companions = (data.companions ?? []).filter((c) => c.name?.trim());
  for (const c of companions) {
    let guestId: string | undefined;

    if (c.idNumber?.trim()) {
      const existing = await prisma.guest.findFirst({
        where: { idNumber: c.idNumber },
        select: { id: true },
      });
      const guestData = {
        name: c.name,
        idType: c.idType as IdTypeEnum | undefined,
        idNumber: c.idNumber,
        idFrontUrl: c.idFrontUrl || undefined,
        idBackUrl: c.idBackUrl || undefined,
      };
      if (existing) {
        await prisma.guest.update({ where: { id: existing.id }, data: guestData });
        guestId = existing.id;
      } else {
        const created = await prisma.guest.create({ data: guestData });
        guestId = created.id;
      }
    }

    await prisma.bookingCompanion.create({
      data: {
        bookingId,
        guestId,
        name: c.name,
        relation: c.relation,
        idType: c.idType as IdTypeEnum | undefined,
        idNumber: c.idNumber,
        idFrontUrl: c.idFrontUrl || undefined,
        idBackUrl: c.idBackUrl || undefined,
      },
    });
  }

  // 4. Mark the booking's online check-in complete.
  await prisma.booking.update({
    where: { id: bookingId },
    data: { onlineCheckinDone: true },
  });
}
