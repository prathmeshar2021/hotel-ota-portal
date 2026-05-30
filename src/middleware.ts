import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth/auth.config";
import { NextResponse } from "next/server";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const session = req.auth;

  // Hotel admin routes require HOTEL_ADMIN or HOTEL_STAFF role
  if (pathname.startsWith("/hotel-admin")) {
    if (!session) {
      return NextResponse.redirect(new URL("/auth/staff-login", req.url));
    }
    const role = session.user.role;
    if (role !== "HOTEL_ADMIN" && role !== "HOTEL_STAFF") {
      return NextResponse.redirect(new URL("/", req.url));
    }
  }

  // Super admin routes
  if (pathname.startsWith("/admin")) {
    if (!session || session.user.role !== "SUPER_ADMIN") {
      return NextResponse.redirect(new URL("/auth/admin-login", req.url));
    }
  }

  // Protected customer routes
  if (pathname.startsWith("/my-bookings") || pathname.startsWith("/checkin/")) {
    if (!session || session.user.role !== "CUSTOMER") {
      const loginUrl = new URL("/auth/login", req.url);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/hotel-admin/:path*",
    "/admin/:path*",
    "/my-bookings/:path*",
    "/checkin/:path*",
  ],
};
