import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listRecords: vi.fn(),
  prisma: {
    outreachCampaignAssignment: {
      findMany: vi.fn()
    },
    outreachTouch: {
      findMany: vi.fn()
    }
  }
}));

vi.mock("@lightcrm/db", () => ({
  getPrismaClient: () => mocks.prisma
}));

vi.mock("../_shared", async () => {
  const actual = await vi.importActual<typeof import("../_shared")>("../_shared");
  return {
    ...actual,
    getCrm: () => ({
      listRecords: mocks.listRecords
    })
  };
});

describe("cold targets route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listRecords.mockResolvedValue([
      {
        id: "cold-1",
        workspaceId: "default",
        name: "German Builder"
      }
    ]);
    mocks.prisma.outreachCampaignAssignment.findMany.mockResolvedValue([]);
    mocks.prisma.outreachTouch.findMany.mockResolvedValue([
      {
        id: "touch-2",
        coldTargetId: "cold-1",
        channel: "linkedin",
        direction: "outbound",
        subject: null,
        outcome: "sent",
        occurredAt: new Date("2026-08-10T09:30:00.000Z")
      },
      {
        id: "touch-1",
        coldTargetId: "cold-1",
        channel: "email",
        direction: "outbound",
        subject: "Intro",
        outcome: "sent",
        occurredAt: new Date("2026-08-01T09:30:00.000Z")
      }
    ]);
  });

  it("returns a recent outreach protocol for each cold target", async () => {
    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/crm/cold-targets"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload[0]).toMatchObject({
      id: "cold-1",
      pingAt: "2026-08-10T09:30:00.000Z",
      outreachProtocol: [
        {
          id: "touch-2",
          channel: "linkedin",
          direction: "outbound",
          occurredAt: "2026-08-10T09:30:00.000Z",
          outcome: "sent"
        },
        {
          id: "touch-1",
          channel: "email",
          subject: "Intro"
        }
      ]
    });
  });
});
