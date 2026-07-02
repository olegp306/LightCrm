import { afterEach, describe, expect, it, vi } from "vitest";
import { authSessionCookieName, readSessionCookieValue } from "../../../../../auth/session";
import { GET } from "./route";

function state(returnTo: string) {
  return Buffer.from(JSON.stringify({ returnTo }), "utf8").toString("base64url");
}

describe("Google callback route", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  function configureAuthEnv() {
    vi.stubEnv("GOOGLE_CLIENT_ID", "google-client-id");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "google-client-secret");
    vi.stubEnv("LIGHTCRM_SESSION_SECRET", "session-secret");
  }

  function mockGoogleEmail(email: string) {
    return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === "https://oauth2.googleapis.com/token") {
        return Response.json({ access_token: "google-access-token" });
      }
      if (url === "https://www.googleapis.com/oauth2/v2/userinfo") {
        return Response.json({ email, email_verified: true });
      }
      return Response.json({ error: "unexpected url" }, { status: 500 });
    });
  }

  it("creates a signed session for an allowed Gmail account", async () => {
    configureAuthEnv();
    mockGoogleEmail("Ekaterina.Reyzbikh@Gmail.com");

    const response = await GET(
      new Request(`http://0.0.0.0:3004/api/auth/google/callback?code=abc&state=${state("/leads")}`, {
        headers: {
          host: "localhost:3004"
        }
      })
    );
    const cookie = response.headers.get("set-cookie") ?? "";
    const cookieValue = cookie.match(new RegExp(`${authSessionCookieName}=([^;]+)`))?.[1];

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3004/leads");
    expect(cookieValue).toBeTruthy();
    await expect(readSessionCookieValue(cookieValue, { secret: "session-secret" })).resolves.toMatchObject({
      email: "ekaterina.reyzbikh@gmail.com"
    });
  });

  it("rejects Gmail accounts outside the allowlist", async () => {
    configureAuthEnv();
    mockGoogleEmail("someone@example.com");

    const response = await GET(
      new Request(`http://0.0.0.0:3004/api/auth/google/callback?code=abc&state=${state("/leads")}`, {
        headers: {
          host: "localhost:3004"
        }
      })
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3004/login?error=not-allowed&email=someone%40example.com");
    expect(response.headers.get("set-cookie")).toContain(`${authSessionCookieName}=`);
  });
});
