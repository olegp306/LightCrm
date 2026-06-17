import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function stateReturnTo(value: string | null) {
  if (!value) {
    return "/today";
  }
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as { returnTo?: string };
    return parsed.returnTo?.startsWith("/") ? parsed.returnTo : "/today";
  } catch {
    return "/today";
  }
}

export async function GET(request: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: "Google OAuth is not configured." }, { status: 501 });
  }

  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const returnTo = stateReturnTo(requestUrl.searchParams.get("state"));
  if (!code) {
    return NextResponse.redirect(new URL(`${returnTo}?gmail=missing-code`, requestUrl.origin));
  }

  const redirectUri = new URL("/api/crm/google/callback", requestUrl.origin);
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
  const token = await tokenResponse.json();
  if (!tokenResponse.ok || !token.access_token) {
    return NextResponse.json({ error: token?.error_description ?? "Google token exchange failed." }, { status: 400 });
  }

  const response = NextResponse.redirect(new URL(returnTo, requestUrl.origin));
  response.cookies.set("lightcrm_google_access_token", token.access_token, {
    httpOnly: true,
    sameSite: "lax",
    secure: requestUrl.protocol === "https:",
    maxAge: Math.max(60, Number(token.expires_in ?? 3600) - 60),
    path: "/"
  });
  if (token.refresh_token) {
    response.cookies.set("lightcrm_google_refresh_token", token.refresh_token, {
      httpOnly: true,
      sameSite: "lax",
      secure: requestUrl.protocol === "https:",
      maxAge: 60 * 60 * 24 * 30,
      path: "/"
    });
  }
  return response;
}
