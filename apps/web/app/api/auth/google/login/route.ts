import { NextResponse } from "next/server";
import { googleLoginConfig, publicOriginFromRequest } from "../../../../../auth/config";

export const dynamic = "force-dynamic";

function safeReturnTo(value: string | null) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/today";
}

export async function GET(request: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  const requestUrl = new URL(request.url);
  const publicOrigin = publicOriginFromRequest(request.headers, requestUrl.origin);
  const config = googleLoginConfig(publicOrigin);
  if (!clientId || !clientSecret || !config.configured) {
    return NextResponse.json(
      {
        error: "Google OAuth is not configured.",
        missing: config.missing,
        callbackUrl: config.callbackUrl
      },
      { status: 501 }
    );
  }
  const returnTo = safeReturnTo(requestUrl.searchParams.get("returnTo"));
  const redirectUri = new URL("/api/auth/google/callback", publicOrigin);
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri.toString());
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid email profile");
  authUrl.searchParams.set("prompt", "select_account");
  authUrl.searchParams.set("state", Buffer.from(JSON.stringify({ returnTo }), "utf8").toString("base64url"));
  return NextResponse.redirect(authUrl);
}
