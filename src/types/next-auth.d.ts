import { Role } from "@prisma/client";
import type { DefaultSession, DefaultUser } from "next-auth";
import type { DefaultJWT } from "next-auth/jwt";

declare module "next-auth" {
  /** Augment User so authorize() custom fields survive into the jwt callback */
  interface User extends DefaultUser {
    role?: Role;
    hotelId?: string;
    hotelName?: string;
    hotelSlug?: string;
    phone?: string;
  }

  interface Session {
    user: {
      id: string;
      role: Role;
      hotelId?: string;
      hotelName?: string;
      hotelSlug?: string;
      phone?: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  /** Augment JWT so token.role etc. are known to TypeScript */
  interface JWT extends DefaultJWT {
    id?: string;
    role?: Role;
    hotelId?: string;
    hotelName?: string;
    hotelSlug?: string;
    phone?: string;
  }
}
