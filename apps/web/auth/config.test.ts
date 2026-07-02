import { describe, expect, it } from "vitest";
import { googleLoginConfig, originFromHeaders, publicOriginFromRequest } from "./config";

describe("googleLoginConfig", () => {
  it("reports missing Google OAuth settings and the expected callback URL", () => {
    expect(googleLoginConfig("http://localhost:3004", {})).toEqual({
      configured: false,
      missing: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "LIGHTCRM_SESSION_SECRET"],
      callbackUrl: "http://localhost:3004/api/auth/google/callback"
    });
  });

  it("reports configured Google login when required env is present", () => {
    expect(
      googleLoginConfig("https://crm.example.com", {
        GOOGLE_CLIENT_ID: "client-id",
        GOOGLE_CLIENT_SECRET: "client-secret",
        LIGHTCRM_SESSION_SECRET: "session-secret"
      })
    ).toEqual({
      configured: true,
      missing: [],
      callbackUrl: "https://crm.example.com/api/auth/google/callback"
    });
  });

  it("uses forwarded headers for the public origin", () => {
    const headers = new Headers({
      "x-forwarded-proto": "https",
      "x-forwarded-host": "crm.test.example"
    });

    expect(originFromHeaders(headers, "http://0.0.0.0:3004")).toBe("https://crm.test.example");
  });

  it("prefers the configured public app URL over request headers", () => {
    const headers = new Headers({
      host: "localhost:3004",
      "x-forwarded-proto": "http"
    });

    expect(
      publicOriginFromRequest(headers, "http://0.0.0.0:3004", {
        NEXT_PUBLIC_APP_URL: "https://lightcrm.204-168-163-99.sslip.io",
        NEXTAUTH_URL: "http://localhost:3004"
      })
    ).toBe("https://lightcrm.204-168-163-99.sslip.io");
  });

  it("falls back to NEXTAUTH_URL when NEXT_PUBLIC_APP_URL is absent", () => {
    expect(
      publicOriginFromRequest(new Headers({ host: "localhost:3004" }), "http://0.0.0.0:3004", {
        NEXTAUTH_URL: "https://lightcrm-test.204-168-163-99.sslip.io"
      })
    ).toBe("https://lightcrm-test.204-168-163-99.sslip.io");
  });
});
