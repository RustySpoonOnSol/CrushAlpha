// middleware.js
// Basic-auth lock for the app while *excluding* API routes and static assets.
// Controlled by env vars: STAGING_LOCK, STAGING_USER, STAGING_PASS

import { NextResponse } from "next/server";

const LOCK = process.env.STAGING_LOCK === "1";
const USER = process.env.STAGING_USER || "";
const PASS = process.env.STAGING_PASS || "";

export function middleware(req) {
  // If not locked, allow everything
  if (!LOCK) return NextResponse.next();

  const url = new URL(req.url);
  const path = url.pathname;

  // Allow API & static without auth
  if (
    path.startsWith("/api") ||          // <-- do NOT gate API
    path.startsWith("/_next") ||        // Next.js assets
    path === "/favicon.ico" ||
    /\.(png|jpg|jpeg|svg|gif|webp|ico|txt|xml)$/.test(path)
  ) {
    return NextResponse.next();
  }

  // Basic auth
  const auth = req.headers.get("authorization") || "";
  const [scheme, token] = auth.split(" ");
  if (scheme === "Basic" && token) {
    const [u, p] = Buffer.from(token, "base64").toString().split(":");
    if (u === USER && p === PASS) {
      return NextResponse.next();
    }
  }

  // Challenge
  return new NextResponse("Auth required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Secure Area"' },
  });
}

// Apply to everything *except* the explicit exclusions above
export const config = {
  matcher: [
    // Protect all paths except API & static handled in code above.
    "/:path*",
  ],
};
