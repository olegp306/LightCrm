import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

describe("Google login route", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("redirects to Google OAuth with the public callback URL", async () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "google-client-id");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "google-client-secret");
    vi.stubEnv("LIGHTCRM_SESSION_SECRET", "session-secret");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://lightcrm.204-168-163-99.sslip.io");

    const response = await GET(
      new Request("http://0.0.0.0:3004/api/auth/google/login?returnTo=%2Fleads", {
        headers: {
          host: "localhost:3004"
        }
      })
    );
    const location = response.headers.get("location");

    expect(response.status).toBe(307);
    expect(location).toBeTruthy();
    const authUrl = new URL(location!);
    expect(authUrl.origin).toBe("https://accounts.google.com");
    expect(authUrl.searchParams.get("client_id")).toBe("google-client-id");
    expect(authUrl.searchParams.get("redirect_uri")).toBe("https://lightcrm.204-168-163-99.sslip.io/api/auth/google/callback");
    expect(authUrl.searchParams.get("scope")).toBe("openid email profile");
  });

  it("reports missing OAuth config with the public callback URL", async () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "");
    vi.stubEnv("LIGHTCRM_SESSION_SECRET", "");

    const response = await GET(
      new Request("http://0.0.0.0:3004/api/auth/google/login", {
        headers: {
          host: "localhost:3004"
        }
      })
    );

    await expect(response.json()).resolves.toMatchObject({
      missing: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "LIGHTCRM_SESSION_SECRET"],
      callbackUrl: "http://localhost:3004/api/auth/google/callback"
    });
    expect(response.status).toBe(501);
  });
});
