import { describe, expect, it } from "vitest";
import { withDefaultConnectionLimit } from "./client";

describe("withDefaultConnectionLimit", () => {
  it("adds a small default Prisma connection limit when one is not configured", () => {
    expect(withDefaultConnectionLimit("postgresql://user:pass@localhost:5432/lightcrm?schema=public")).toBe(
      "postgresql://user:pass@localhost:5432/lightcrm?schema=public&connection_limit=5"
    );
  });

  it("keeps an explicit connection limit unchanged", () => {
    expect(
      withDefaultConnectionLimit("postgresql://user:pass@localhost:5432/lightcrm?schema=public&connection_limit=2")
    ).toBe("postgresql://user:pass@localhost:5432/lightcrm?schema=public&connection_limit=2");
  });
});
