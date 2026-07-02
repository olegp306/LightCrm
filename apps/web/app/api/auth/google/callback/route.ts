import { NextResponse } from "next/server";
import { publicOriginFromRequest } from "../../../../../auth/config";
import { authSessionCookieName, authSessionMaxAgeSeconds, createSessionCookieValue, isAllowedLoginEmail } from "../../../../../auth/session";

export const dynamic = "force-dynamic";

type GoogleTokenResponse = {
  access_token?: string;
  error_description?: string;
};

type GoogleUserInfo = {
  email?: string;
  email_verified?: boolean;
};

function stateReturnTo(value: string | null) {
  if (!value) {
    return "/today";
  }
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as { returnTo?: string };
    return parsed.returnTo?.startsWith("/") && !parsed.returnTo.startsWith("//") ? parsed.returnTo : "/today";
  } catch {
    return "/today";
  }
}

function loginRedirect(origin: string, reason: string, email?: string) {
  const url = new URL("/login", origin);
  url.searchParams.set("error", reason);
  if (email) {
    url.searchParams.set("email", email);
  }
  const response = NextResponse.redirect(url);
  response.cookies.delete(authSessionCookieName);
  return response;
}

export async function GET(request: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: "Google OAuth is not configured." }, { status: 501 });
  }

  const requestUrl = new URL(request.url);
  const publicOrigin = publicOriginFromRequest(request.headers, requestUrl.origin);
  const publicUrl = new URL(publicOrigin);
  const code = requestUrl.searchParams.get("code");
  const returnTo = stateReturnTo(requestUrl.searchParams.get("state"));
  if (!code) {
    return loginRedirect(publicOrigin, "missing-code");
  }

  const redirectUri = new URL("/api/auth/google/callback", publicOrigin);
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri.toString(),
      grant_type: "authorization_code"
    })
  });
  const token = (await tokenResponse.json()) as GoogleTokenResponse;
  if (!tokenResponse.ok || !token.access_token) {
    return NextResponse.json({ error: token.error_description ?? "Google token exchange failed." }, { status: 400 });
  }

  const userInfoResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${token.access_token}` }
  });
  const userInfo = (await userInfoResponse.json()) as GoogleUserInfo;
  const email = userInfo.email?.trim().toLowerCase();
  if (!userInfoResponse.ok || !email || userInfo.email_verified === false) {
    return loginRedirect(publicOrigin, "unverified-email", email);
  }
  if (!isAllowedLoginEmail(email)) {
    return loginRedirect(publicOrigin, "not-allowed", email);
  }

  const response = NextResponse.redirect(new URL(returnTo, publicOrigin));
  response.cookies.set(authSessionCookieName, await createSessionCookieValue({ email }), {
    httpOnly: true,
    sameSite: "lax",
    secure: publicUrl.protocol === "https:",
    maxAge: authSessionMaxAgeSeconds(),
    path: "/"
  });
  return response;
}
