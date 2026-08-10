import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listRecords: vi.fn(),
  upsertColdTarget: vi.fn()
}));

vi.mock("../../_shared", async () => {
  const actual = await vi.importActual<typeof import("../../_shared")>("../../_shared");
  return {
    ...actual,
    getCrm: () => ({
      listRecords: mocks.listRecords,
      upsertColdTarget: mocks.upsertColdTarget
    })
  };
});

describe("cold targets upsert route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listRecords.mockResolvedValue([
      {
        id: "cold-1",
        workspaceId: "default",
        code: "T-2026-001",
        name: "German Builder",
        company: "Build GmbH",
        ballSide: "us"
      }
    ]);
    mocks.upsertColdTarget.mockResolvedValue({
      id: "cold-1",
      workspaceId: "default",
      name: "German Builder",
      ballSide: "client"
    });
  });

  it("accepts table patch updates for the handoff ball", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/crm/cold-targets/upsert", {
        method: "POST",
        body: JSON.stringify({
          workspaceId: "default",
          id: "cold-1",
          patch: { ballSide: "client" },
          source: { channel: "web-table" }
        })
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.listRecords).toHaveBeenCalledWith({
      workspaceId: "default",
      entity: "coldTarget",
      includeArchived: true
    });
    expect(mocks.upsertColdTarget).toHaveBeenCalledWith({
      workspaceId: "default",
      id: "cold-1",
      code: "T-2026-001",
      name: "German Builder",
      company: "Build GmbH",
      ballSide: "client"
    });
    expect(payload.ballSide).toBe("client");
  });
});
