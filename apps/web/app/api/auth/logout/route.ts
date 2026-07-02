import { NextResponse } from "next/server";
import { originFromHeaders } from "../../../../auth/config";
import { authSessionCookieName } from "../../../../auth/session";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const response = NextResponse.redirect(new URL("/login", originFromHeaders(request.headers, requestUrl.origin)));
  response.cookies.delete(authSessionCookieName);
  return response;
}

export async function POST(request: Request) {
  return GET(request);
}
