import { NextResponse } from "next/server";
import { publicOriginFromRequest } from "../../../../../auth/config";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: "Google OAuth is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET." }, { status: 501 });
  }

  const requestUrl = new URL(request.url);
  const publicOrigin = publicOriginFromRequest(request.headers, requestUrl.origin);
  const returnTo = requestUrl.searchParams.get("returnTo") ?? "/today";
  const redirectUri = new URL("/api/crm/google/callback", publicOrigin);
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri.toString());
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "https://www.googleapis.com/auth/gmail.send");
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  authUrl.searchParams.set("state", Buffer.from(JSON.stringify({ returnTo }), "utf8").toString("base64url"));
  return NextResponse.redirect(authUrl);
}
