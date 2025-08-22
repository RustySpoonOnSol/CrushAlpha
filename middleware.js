import { NextResponse } from "next/server";

export function middleware(req) {
  const url = req.nextUrl;
  const pathname = url.pathname;

  // Don't gate API or static assets
  if (pathname.startsWith("/api") || pathname.startsWith("/_next") || pathname.startsWith("/favicon")) {
    return NextResponse.next();
  }

  const pass = process.env.ALPHA_PASSWORD || "";
  if (!pass) return NextResponse.next();

  const header = req.headers.get("authorization") || "";
  const expected = "Basic " + Buffer.from("tester:" + pass).toString("base64");

  if (header === expected) return NextResponse.next();

  return new NextResponse("Auth required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Crush AI Alpha"' },
  });
}

export const config = {
  matcher: ["/((?!_next|favicon.ico).*)"],
};
