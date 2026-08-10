import { describe, expect, it } from "vitest";
import { coldTargetPingTone, coldTargetPingLabel } from "./cold-target-model";

describe("cold target model", () => {
  it("formats a missing ping as an overdue first-touch target", () => {
    expect(coldTargetPingLabel(null, new Date("2026-08-10T12:00:00.000Z"))).toBe("No ping yet");
    expect(coldTargetPingTone(null, new Date("2026-08-10T12:00:00.000Z"))).toBe("overdue");
  });

  it("uses a one-month threshold for dormant pings", () => {
    expect(coldTargetPingTone("2026-07-10T12:00:00.000Z", new Date("2026-08-10T12:00:00.000Z"))).toBe("dormant");
  });
});
