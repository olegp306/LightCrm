import { describe, expect, it } from "vitest";
import {
  allowedLoginEmails,
  createSessionCookieValue,
  isValidInternalApiToken,
  isAllowedLoginEmail,
  readSessionCookieValue
} from "./session";

describe("LightCRM auth sessions", () => {
  it("allows only the configured Gmail accounts", () => {
    expect(allowedLoginEmails).toEqual([
      "gubernatorova.juliya@gmail.com",
      "ekaterina.reyzbikh@gmail.com",
      "olegp306@gmail.com"
    ]);
    expect(isAllowedLoginEmail(" Ekaterina.Reyzbikh@Gmail.com ")).toBe(true);
    expect(isAllowedLoginEmail("someone@example.com")).toBe(false);
  });

  it("round-trips a signed session cookie for an allowed account", async () => {
    const cookie = await createSessionCookieValue({
      email: "olegp306@gmail.com",
      issuedAt: 1000,
      expiresAt: 2000,
      secret: "test-secret"
    });

    await expect(readSessionCookieValue(cookie, { now: 1500, secret: "test-secret" })).resolves.toMatchObject({
      email: "olegp306@gmail.com"
    });
  });

  it("rejects tampered or expired session cookies", async () => {
    const cookie = await createSessionCookieValue({
      email: "gubernatorova.juliya@gmail.com",
      issuedAt: 1000,
      expiresAt: 2000,
      secret: "test-secret"
    });

    await expect(readSessionCookieValue(`${cookie.slice(0, -2)}xx`, { now: 1500, secret: "test-secret" })).resolves.toBeNull();
    await expect(readSessionCookieValue(cookie, { now: 2500, secret: "test-secret" })).resolves.toBeNull();
  });

  it("accepts only the configured internal API token", () => {
    expect(isValidInternalApiToken("Bearer tg-secret", "tg-secret")).toBe(true);
    expect(isValidInternalApiToken("tg-secret", "tg-secret")).toBe(true);
    expect(isValidInternalApiToken("Bearer wrong", "tg-secret")).toBe(false);
    expect(isValidInternalApiToken("Bearer tg-secret", "")).toBe(false);
  });
});
