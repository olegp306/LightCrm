import { describe, expect, it } from "vitest";
import { googleLoginConfig, originFromHeaders } from "./config";

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
});
