import { NextResponse, type NextRequest } from "next/server";

function isAllowedLocalHostname(hostname: string) {
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return true;
  }

  const privateIpv4 = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/;
  return privateIpv4.test(hostname);
}

function applyMobileCors(request: NextRequest, response: NextResponse) {
  const origin = request.headers.get("origin")?.trim();
  let allowOrigin = "*";

  if (origin) {
    try {
      const hostname = new URL(origin).hostname;
      if (isAllowedLocalHostname(hostname)) {
        allowOrigin = origin;
      }
    } catch {
      allowOrigin = "*";
    }
  }

  response.headers.set("Access-Control-Allow-Origin", allowOrigin);
  response.headers.set("Access-Control-Allow-Headers", "Content-Type, x-mobile-dev-key");
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.headers.set("Vary", "Origin");
  return response;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/api/mobile")) {
    if (request.method === "OPTIONS") {
      return applyMobileCors(request, new NextResponse(null, { status: 204 }));
    }

    return applyMobileCors(request, NextResponse.next());
  }

  // Allow public routes
  if (pathname === "/login" || pathname.startsWith("/_next") || pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  // Check auth cookie
  const authCookie = request.cookies.get("auth");

  if (!authCookie || authCookie.value !== "true") {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
