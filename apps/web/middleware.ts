import { NextResponse, type NextRequest } from "next/server";
import { publicOriginFromRequest } from "./auth/config";
import { authSessionCookieName, isValidInternalApiToken, readSessionCookieValue } from "./auth/session";

const publicPathPrefixes = [
  "/login",
  "/api/auth",
  "/_next",
  "/favicon.ico",
  "/lead-progress",
  "/sounds"
];

function isPublicPath(pathname: string) {
  return publicPathPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function isApiRequest(pathname: string) {
  return pathname.startsWith("/api/");
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  if (isApiRequest(pathname) && isValidInternalApiToken(request.headers.get("authorization") ?? request.headers.get("x-lightcrm-internal-token"))) {
    return NextResponse.next();
  }

  const session = await readSessionCookieValue(request.cookies.get(authSessionCookieName)?.value);
  if (session) {
    return NextResponse.next();
  }

  if (isApiRequest(pathname)) {
    return NextResponse.json({ error: "LightCRM login required." }, { status: 401 });
  }

  const loginUrl = new URL("/login", publicOriginFromRequest(request.headers, request.nextUrl.origin));
  loginUrl.searchParams.set("returnTo", `${pathname}${search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!.*\\..*).*)", "/api/:path*"]
};
