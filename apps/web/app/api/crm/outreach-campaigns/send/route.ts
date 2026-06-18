import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { handleRouteError } from "../../_shared";

export const dynamic = "force-dynamic";

const sendSchema = z.object({
  email: z.string().email(),
  subject: z.string().trim().min(1),
  body: z.string().trim().min(1),
  htmlBody: z.string().trim().optional().nullable(),
  returnTo: z.string().optional().nullable()
});

function base64Url(value: string) {
  return Buffer.from(value, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function encodedHeader(value: string) {
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function messagePayload(input: z.infer<typeof sendSchema>) {
  const html = input.htmlBody?.trim();
  if (!html) {
    return [
      `To: ${input.email}`,
      `Subject: ${encodedHeader(input.subject)}`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
      "",
      input.body
    ].join("\r\n");
  }
  const boundary = `lightcrm-${Date.now().toString(36)}`;
  return [
    `To: ${input.email}`,
    `Subject: ${encodedHeader(input.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "",
    input.body,
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "",
    html,
    `--${boundary}--`
  ].join("\r\n");
}

function authRequired(request: Request, returnTo: string | null | undefined, message = "Google Gmail authorization required.") {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.json(
      {
        authRequired: true,
        error: "Google OAuth is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET."
      },
      { status: 501 }
    );
  }
  const url = new URL("/api/crm/google/auth", request.url);
  if (returnTo) {
    url.searchParams.set("returnTo", returnTo);
  }
  return NextResponse.json(
    {
      authRequired: true,
      authUrl: url.toString(),
      error: message,
      description:
        "Google will ask you to choose an account and allow LightCrm to send this prepared email from your Gmail account."
    },
    { status: 401 }
  );
}

async function refreshAccessToken(refreshToken: string, requestUrl: URL) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return null;
  }
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token"
    })
  });
  const token = (await response.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!response.ok || !token.access_token) {
    return null;
  }
  return { accessToken: token.access_token, maxAge: Math.max(60, Number(token.expires_in ?? 3600) - 60) };
}

async function sendGmailMessage(accessToken: string, input: z.infer<typeof sendSchema>) {
  return fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ raw: base64Url(messagePayload(input)) })
  });
}

function withAccessCookie(response: NextResponse, refreshed: Awaited<ReturnType<typeof refreshAccessToken>>, requestUrl: URL) {
  if (!refreshed) {
    return response;
  }
  response.cookies.set("lightcrm_google_access_token", refreshed.accessToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: requestUrl.protocol === "https:",
    maxAge: refreshed.maxAge,
    path: "/"
  });
  return response;
}

export async function POST(request: Request) {
  try {
    const input = sendSchema.parse(await request.json());
    const requestUrl = new URL(request.url);
    const cookieStore = cookies();
    const refreshToken = cookieStore.get("lightcrm_google_refresh_token")?.value;
    const refreshedBeforeSend = cookieStore.get("lightcrm_google_access_token")?.value
      ? null
      : refreshToken
        ? await refreshAccessToken(refreshToken, requestUrl)
        : null;
    const token = cookieStore.get("lightcrm_google_access_token")?.value ?? refreshedBeforeSend?.accessToken;
    if (!token) {
      return authRequired(request, input.returnTo);
    }

    let response = await sendGmailMessage(token, input);
    let payload = await response.json().catch(() => ({}));
    if (response.status === 401 || response.status === 403) {
      const refreshedAfterFailure = refreshToken ? await refreshAccessToken(refreshToken, requestUrl) : null;
      if (refreshedAfterFailure) {
        response = await sendGmailMessage(refreshedAfterFailure.accessToken, input);
        payload = await response.json().catch(() => ({}));
        if (response.ok) {
          return withAccessCookie(NextResponse.json({ sent: true, id: payload.id ?? null }), refreshedAfterFailure, requestUrl);
        }
      }
      return authRequired(request, input.returnTo, "Google Gmail authorization expired. Please choose your Gmail account again.");
    }
    if (!response.ok) {
      return NextResponse.json({ error: payload?.error?.message ?? "Gmail send failed." }, { status: response.status });
    }
    return withAccessCookie(NextResponse.json({ sent: true, id: payload.id ?? null }), refreshedBeforeSend, requestUrl);
  } catch (error) {
    return handleRouteError(error);
  }
}
