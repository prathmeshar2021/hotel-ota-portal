import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db/prisma";
import { Role } from "@prisma/client";
import { authConfig } from "./auth.config";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    // ── Customer login (phone + password) ────────────────────────────────────
    Credentials({
      id: "guest-login",
      name: "Customer Login",
      credentials: {
        phone: { label: "Phone", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.phone || !credentials?.password) return null;

        const guest = await prisma.guest.findUnique({
          where: { phone: credentials.phone as string },
        });

        if (!guest?.password) return null;

        const valid = await bcrypt.compare(
          credentials.password as string,
          guest.password
        );
        if (!valid) return null;

        return {
          id: guest.id,
          name: guest.name,
          email: guest.email ?? undefined,
          phone: guest.phone ?? undefined,
          role: "CUSTOMER" as Role,
        };
      },
    }),

    // ── Hotel staff login (email + password) ─────────────────────────────────
    Credentials({
      id: "staff-login",
      name: "Hotel Staff Login",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const staff = await prisma.hotelStaff.findUnique({
          where: { email: credentials.email as string },
          include: { hotel: { select: { id: true, name: true, slug: true } } },
        });

        if (!staff?.isActive) return null;

        const valid = await bcrypt.compare(
          credentials.password as string,
          staff.password
        );
        if (!valid) return null;

        return {
          id: staff.id,
          name: staff.name,
          email: staff.email,
          role: staff.role,
          hotelId: staff.hotelId,
          hotelName: staff.hotel.name,
          hotelSlug: staff.hotel.slug,
        };
      },
    }),

    // ── Super admin login ─────────────────────────────────────────────────────
    Credentials({
      id: "admin-login",
      name: "Admin Login",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const admin = await prisma.superAdmin.findUnique({
          where: { email: credentials.email as string },
        });

        if (!admin) return null;

        const valid = await bcrypt.compare(
          credentials.password as string,
          admin.password
        );
        if (!valid) return null;

        // Attach the default (single) hotel context so the super admin can use
        // all hotel-admin features that rely on session.user.hotelId.
        const hotel = await prisma.hotel.findFirst({
          where: { isActive: true },
          orderBy: { createdAt: "asc" },
          select: { id: true, name: true, slug: true },
        });

        return {
          id: admin.id,
          name: admin.name,
          email: admin.email,
          role: "SUPER_ADMIN" as Role,
          hotelId: hotel?.id,
          hotelName: hotel?.name,
          hotelSlug: hotel?.slug,
        };
      },
    }),

    // ── Google OAuth (customers only) ─────────────────────────────────────────
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      allowDangerousEmailAccountLinking: true,
    }),
  ],

  // Override callbacks to handle Google guest creation (Node.js runtime only)
  callbacks: {
    async jwt({ token, user, account }) {
      // ── Credentials sign-in (guest-login / staff-login / admin-login) ────────
      // user is only present on the very first sign-in; account is null for
      // credentials providers in some NextAuth v5 builds, so we check by exclusion.
      if (user && account?.provider !== "google") {
        token.id = user.id;
        token.role = (user as { role?: Role }).role;
        token.hotelId = (user as { hotelId?: string }).hotelId;
        token.hotelName = (user as { hotelName?: string }).hotelName;
        token.hotelSlug = (user as { hotelSlug?: string }).hotelSlug;
        token.phone = (user as { phone?: string }).phone;
      }

      // ── Google OAuth sign-in: find or create Guest record ───────────────────
      if (account?.provider === "google" && user?.email) {
        // Try to find existing guest by email
        let guest = await prisma.guest.findUnique({
          where: { email: user.email },
        });

        // Create new guest if first time
        if (!guest) {
          guest = await prisma.guest.create({
            data: {
              name: user.name ?? user.email.split("@")[0],
              email: user.email,
              isVerified: true, // Google verifies email
            },
          });
        }

        token.id = guest.id;
        token.role = "CUSTOMER" as Role;
        token.phone = guest.phone ?? undefined;
      }

      return token;
    },

    session({ session, token }) {
      session.user.id = token.id as string;
      session.user.role = token.role!;
      session.user.hotelId = token.hotelId;
      session.user.hotelName = token.hotelName;
      session.user.hotelSlug = token.hotelSlug;
      session.user.phone = token.phone;
      return session;
    },
  },
});
