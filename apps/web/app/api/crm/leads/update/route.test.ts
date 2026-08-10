import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  crm: {
    listRecords: vi.fn(),
    upsertLeadWithClientResolution: vi.fn(),
    listClients: vi.fn(),
    upsertClient: vi.fn()
  }
}));

vi.mock("../../_shared", async () => {
  const actual = await vi.importActual<typeof import("../../_shared")>("../../_shared");
  return {
    ...actual,
    getCrm: () => mocks.crm
  };
});

describe("lead update route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.crm.listRecords.mockResolvedValue([
      {
        id: "lead-1",
        workspaceId: "default",
        clientId: null,
        code: "L-2026-001",
        name: "Lead 1",
        email: null,
        phone: null,
        whatsapp: null,
        company: null,
        status: "new",
        sourceChannel: null,
        externalThreadId: null,
        externalMessageId: null,
        notes: null,
        progressStage: 0,
        preferredLanguage: null,
        contractNumber: null,
        expectedFeeNet: null,
        olegPercent: null,
        handoffNote: null,
        lastPingAt: null,
        clientType: null,
        createdAt: new Date("2026-08-01T00:00:00.000Z"),
        updatedAt: new Date("2026-08-01T00:00:00.000Z"),
        archivedAt: null
      }
    ]);
    mocks.crm.upsertLeadWithClientResolution.mockResolvedValue({ id: "lead-1" });
  });

  it("passes persisted Katya patch fields through to lead upsert", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/crm/leads/update", {
        method: "POST",
        body: JSON.stringify({
          workspaceId: "default",
          leadId: "lead-1",
          patch: {
            progressStage: 7,
            preferredLanguage: "en",
            contractNumber: "CTR-700",
            expectedFeeNet: 15000,
            olegPercent: 30,
            handoffNote: "Final client handoff.",
            lastPingAt: "2026-08-10T12:00:00.000Z",
            clientType: "developer"
          }
        })
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.crm.upsertLeadWithClientResolution).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "lead-1",
        workspaceId: "default",
        name: "Lead 1",
        progressStage: 7,
        preferredLanguage: "en",
        contractNumber: "CTR-700",
        expectedFeeNet: 15000,
        olegPercent: 30,
        handoffNote: "Final client handoff.",
        lastPingAt: new Date("2026-08-10T12:00:00.000Z"),
        clientType: "developer"
      })
    );
  });

  it("rejects invalid progress stages before updating the lead", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/crm/leads/update", {
        method: "POST",
        body: JSON.stringify({
          workspaceId: "default",
          leadId: "lead-1",
          patch: {
            progressStage: -1
          }
        })
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload).toEqual({ error: "patch.progressStage: Number must be greater than or equal to 0" });
    expect(mocks.crm.upsertLeadWithClientResolution).not.toHaveBeenCalled();
  });
});
