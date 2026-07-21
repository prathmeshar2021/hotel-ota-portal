import type { NextAuthConfig } from "next-auth";

/**
 * Edge-compatible auth config — NO bcrypt, NO prisma, NO Node.js native modules.
 * Used by middleware.ts (Edge runtime) and spread into auth.ts (Node.js runtime).
 */
export const authConfig = {
  session: { strategy: "jwt" as const },
  pages: { signIn: "/auth/login" },
  providers: [], // providers live in auth.ts (Node.js only)
  callbacks: {
    // Keep post-login redirects on our own site. The default only honours an
    // absolute callbackUrl when its origin EXACTLY matches AUTH_URL — so a
    // www ↔ apex mismatch silently sends the user home. Treat www and apex as
    // the same site, and always honour relative URLs.
    redirect({ url, baseUrl }) {
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      try {
        const target = new URL(url);
        const base = new URL(baseUrl);
        const strip = (h: string) => h.replace(/^www\./, "");
        if (strip(target.hostname) === strip(base.hostname)) return url;
      } catch { /* malformed url → fall through */ }
      return baseUrl;
    },
    jwt({ token, user }) {
      // user is only present on initial sign-in
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.hotelId = user.hotelId;
        token.hotelName = user.hotelName;
        token.hotelSlug = user.hotelSlug;
        token.phone = user.phone;
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
} satisfies NextAuthConfig;
