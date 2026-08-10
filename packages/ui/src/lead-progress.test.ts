import { describe, expect, it, vi } from "vitest";

vi.mock("@glideapps/glide-data-grid/dist/index.css", () => ({}));
vi.mock("@glideapps/glide-data-grid", () => ({
  DataEditor: () => null,
  GridCellKind: {},
  CompactSelection: {
    empty: () => ({ items: [] })
  }
}));

const {
  buildLeadProgressUpdateRequest,
  deriveLeadProgressState,
  leadProgressStages,
  normalizeLeadProgressStage
} = await import("./CrmTable");

describe("lead progress helpers", () => {
  it("defines exactly eight canonical stages with unique local assets", () => {
    expect(leadProgressStages.map((stage) => stage.label)).toEqual([
      "Proposal",
      "Contract",
      "Prepayment invoice",
      "Prepayment confirmed",
      "Power of attorney",
      "Final invoice",
      "Final payment confirmed",
      "Client review"
    ]);
    expect(leadProgressStages).toHaveLength(8);
    expect(new Set(leadProgressStages.map((stage) => stage.image)).size).toBe(8);
    expect(leadProgressStages.map((stage) => stage.image)).toEqual([
      "/lead-progress/01-mail-sent.png",
      "/lead-progress/02-lead-replied.png",
      "/lead-progress/03-client-written.png",
      "/lead-progress/04-proposal-sent.png",
      "/lead-progress/05-proposal-reworked.png",
      "/lead-progress/06-meeting-booked.png",
      "/lead-progress/07-call-done.png",
      "/lead-progress/08-client-agreed.png"
    ]);
  });

  it("derives current, available, and locked states for the first stage", () => {
    expect(leadProgressStages.map((_, index) => deriveLeadProgressState(index, 0))).toEqual([
      "current",
      "available",
      "locked",
      "locked",
      "locked",
      "locked",
      "locked",
      "locked"
    ]);
  });

  it("derives completed, current, available, and locked states for a middle stage", () => {
    expect(leadProgressStages.map((_, index) => deriveLeadProgressState(index, 3))).toEqual([
      "completed",
      "completed",
      "completed",
      "current",
      "available",
      "locked",
      "locked",
      "locked"
    ]);
  });

  it("derives the final stage as current with all previous stages completed", () => {
    expect(leadProgressStages.map((_, index) => deriveLeadProgressState(index, 7))).toEqual([
      "completed",
      "completed",
      "completed",
      "completed",
      "completed",
      "completed",
      "completed",
      "current"
    ]);
  });

  it("normalizes persisted progress values and falls back invalid values to stage zero", () => {
    expect(normalizeLeadProgressStage(0)).toBe(0);
    expect(normalizeLeadProgressStage("3")).toBe(3);
    expect(normalizeLeadProgressStage(7)).toBe(7);
    expect(normalizeLeadProgressStage(null)).toBe(0);
    expect(normalizeLeadProgressStage("")).toBe(0);
    expect(normalizeLeadProgressStage(-1)).toBe(0);
    expect(normalizeLeadProgressStage(8)).toBe(0);
    expect(normalizeLeadProgressStage(1.5)).toBe(0);
    expect(normalizeLeadProgressStage("done")).toBe(0);
  });

  it("builds the existing update endpoint request for a selected stage", () => {
    expect(buildLeadProgressUpdateRequest("leadId", "lead-42", 4)).toEqual({
      workspaceId: "default",
      leadId: "lead-42",
      patch: { progressStage: 4 },
      source: { channel: "web-details" }
    });
  });
});
