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
  const url = new URL("/api/crm/google/auth", request.url);
  if (returnTo) {
    url.searchParams.set("returnTo", returnTo);
  }
  return NextResponse.json({ authRequired: true, authUrl: url.toString(), error: message }, { status: 401 });
}

export async function POST(request: Request) {
  try {
    const input = sendSchema.parse(await request.json());
    const token = cookies().get("lightcrm_google_access_token")?.value;
    if (!token) {
      return authRequired(request, input.returnTo);
    }

    const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ raw: base64Url(messagePayload(input)) })
    });
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401 || response.status === 403) {
      return authRequired(request, input.returnTo, "Google Gmail authorization expired.");
    }
    if (!response.ok) {
      return NextResponse.json({ error: payload?.error?.message ?? "Gmail send failed." }, { status: response.status });
    }
    return NextResponse.json({ sent: true, id: payload.id ?? null });
  } catch (error) {
    return handleRouteError(error);
  }
}
