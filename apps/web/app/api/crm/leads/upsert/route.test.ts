import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  crm: {
    upsertLeadWithClientResolution: vi.fn()
  },
  maybeAutoGenerateCommercialOfferForLead: vi.fn()
}));

vi.mock("../../_shared", async () => {
  const actual = await vi.importActual<typeof import("../../_shared")>("../../_shared");
  return {
    ...actual,
    getCrm: () => mocks.crm
  };
});

vi.mock("../commercial-offers", () => ({
  maybeAutoGenerateCommercialOfferForLead: mocks.maybeAutoGenerateCommercialOfferForLead
}));

describe("lead upsert route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.crm.upsertLeadWithClientResolution.mockResolvedValue({
      id: "lead-1",
      workspaceId: "default",
      name: "Lead 1",
      progressStage: 3
    });
    mocks.maybeAutoGenerateCommercialOfferForLead.mockResolvedValue(null);
  });

  it("accepts progress stage and Katya metadata fields", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/crm/leads/upsert", {
        method: "POST",
        body: JSON.stringify({
          workspaceId: "default",
          name: "Lead 1",
          progressStage: 3,
          preferredLanguage: "ru",
          contractNumber: "KT-3",
          expectedFeeNet: 9800,
          olegPercent: 18,
          handoffNote: "Need Alex on the follow-up.",
          lastPingAt: "2026-08-10T11:00:00.000Z",
          clientType: "b2b"
        })
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.crm.upsertLeadWithClientResolution).toHaveBeenCalledWith({
      workspaceId: "default",
      name: "Lead 1",
      progressStage: 3,
      preferredLanguage: "ru",
      contractNumber: "KT-3",
      expectedFeeNet: 9800,
      olegPercent: 18,
      handoffNote: "Need Alex on the follow-up.",
      lastPingAt: new Date("2026-08-10T11:00:00.000Z"),
      clientType: "b2b"
    });
  });

  it("rejects invalid progress stages with the standard validation error", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/crm/leads/upsert", {
        method: "POST",
        body: JSON.stringify({
          workspaceId: "default",
          name: "Lead 1",
          progressStage: 8
        })
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload).toEqual({ error: "progressStage: Number must be less than or equal to 7" });
    expect(mocks.crm.upsertLeadWithClientResolution).not.toHaveBeenCalled();
  });
});
