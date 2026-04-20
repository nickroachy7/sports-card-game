import { type NextRequest, NextResponse } from "next/server";

import { updateSession } from "@/lib/auth/session-middleware";

const PUBLIC_PATHS = [
  "/signin",
  "/signup",
  "/auth/callback",
  "/palette",
  "/api/config/economy",
  "/api/leaderboards",
  "/api/profile",
  "/api/webhooks",
  "/api/cron",
];

function isPublicPath(pathname: string): boolean {
  if (pathname === "/") return true;
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const { response, userId } = await updateSession(request);

  if (!userId && !isPublicPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/signin";
    url.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(url);
  }

  if (userId && (pathname === "/signin" || pathname === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/lineup";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image  (image optimization)
     * - favicon.ico
     * - public files with a file extension (images, fonts, etc.)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)",
  ],
};
