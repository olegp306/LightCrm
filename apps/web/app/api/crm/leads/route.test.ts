import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listRecords: vi.fn(),
  prisma: { outreachTouch: { findMany: vi.fn() } },
  getCrmRuntimeSettings: vi.fn()
}));

vi.mock("@lightcrm/db", () => ({ getPrismaClient: () => mocks.prisma }));
vi.mock("../_shared", async () => {
  const actual = await vi.importActual<typeof import("../_shared")>("../_shared");
  return { ...actual, getCrm: () => ({ listRecords: mocks.listRecords }) };
});
vi.mock("../settings/crm-settings-store", () => ({ getCrmRuntimeSettings: mocks.getCrmRuntimeSettings }));

describe("leads route outreach columns", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listRecords.mockImplementation(async ({ entity }: { entity: string }) => {
      if (entity === "lead") {
        return [{ id: "lead-1", workspaceId: "default", name: "Lead", status: "new", notes: null, lastPingAt: null }];
      }
      return [];
    });
    mocks.prisma.outreachTouch.findMany.mockResolvedValue([
      { id: "touch-1", leadId: "lead-1", occurredAt: new Date("2026-08-01T09:30:00.000Z") },
      { id: "touch-2", leadId: "lead-1", occurredAt: new Date("2026-08-10T09:30:00.000Z") }
    ]);
    mocks.getCrmRuntimeSettings.mockResolvedValue({ commercialOffers: { activeFeeTable: { rows: [] } } });
  });

  it("returns the same ping and current-touch values used by cold targets", async () => {
    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/crm/leads"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload[0]).toMatchObject({
      pingAt: "2026-08-10T09:30:00.000Z",
      campaignTouch: "Touch 2"
    });
  });
});
