import { describe, expect, it } from "vitest";
import { afterEach, vi } from "vitest";
import { authSessionCookieName } from "../../../../auth/session";
import { GET } from "./route";

describe("logout route", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("redirects to the public login URL behind a reverse proxy", async () => {
    const response = await GET(
      new Request("http://127.0.0.1:3001/api/auth/logout", {
        headers: {
          "x-forwarded-host": "lightcrm.204-168-163-99.sslip.io",
          "x-forwarded-proto": "https"
        }
      })
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://lightcrm.204-168-163-99.sslip.io/login");
    expect(response.headers.get("set-cookie")).toContain(`${authSessionCookieName}=`);
  });

  it("prefers configured public app URL over request host", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://lightcrm.204-168-163-99.sslip.io");

    const response = await GET(new Request("http://localhost:4900/api/auth/logout"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://lightcrm.204-168-163-99.sslip.io/login");
  });
});
