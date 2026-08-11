import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    lead: { findFirst: vi.fn() },
    coldTarget: { findFirst: vi.fn() },
    client: { findFirst: vi.fn() },
    outreachTouch: { create: vi.fn(), findMany: vi.fn() }
  },
  readSessionCookieValue: vi.fn()
}));

vi.mock("@lightcrm/db", () => ({ getPrismaClient: () => mocks.prisma }));
vi.mock("next/headers", () => ({ cookies: vi.fn(() => ({ get: () => ({ value: "session" }) })) }));
vi.mock("../../../../auth/session", () => ({
  authSessionCookieName: "lightcrm_session",
  accountDisplayName: (email: string | null) => (email === "olegp306@gmail.com" ? "Олег" : "Не указан"),
  accountShortCode: (email: string | null) => (email === "olegp306@gmail.com" ? "О" : "—"),
  readSessionCookieValue: mocks.readSessionCookieValue
}));

describe("manual ping route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.setSystemTime(new Date("2026-08-11T15:30:00.000Z"));
    mocks.readSessionCookieValue.mockResolvedValue({ email: "olegp306@gmail.com" });
    mocks.prisma.lead.findFirst.mockResolvedValue({ id: "lead-1" });
    mocks.prisma.coldTarget.findFirst.mockResolvedValue(null);
    mocks.prisma.client.findFirst.mockResolvedValue(null);
    mocks.prisma.outreachTouch.create.mockResolvedValue({
      id: "touch-1",
      workspaceId: "default",
      leadId: "lead-1",
      coldTargetId: null,
      clientId: null,
      channel: "email",
      direction: "outbound",
      occurredAt: new Date("2026-08-11T15:30:00.000Z"),
      outcome: "manual_ping",
      actorEmail: "olegp306@gmail.com"
    });
    mocks.prisma.outreachTouch.findMany.mockResolvedValue([]);
  });

  it("records a lead ping with the authenticated actor and channel", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/crm/manual-ping", {
        method: "POST",
        body: JSON.stringify({ entity: "lead", recordId: "lead-1", channel: "email" })
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.prisma.outreachTouch.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: "default",
        leadId: "lead-1",
        channel: "email",
        direction: "outbound",
        outcome: "manual_ping",
        actorEmail: "olegp306@gmail.com",
        occurredAt: new Date("2026-08-11T15:30:00.000Z")
      })
    });
    await expect(response.json()).resolves.toMatchObject({
      pingAt: "2026-08-11T15:30:00.000Z",
      protocolEntry: { channel: "email", actor: "Олег", actorCode: "О" }
    });
  });

  it("keeps protocol reads isolated to the requested entity", async () => {
    mocks.prisma.outreachTouch.findMany.mockResolvedValue([
      {
        id: "touch-lead",
        channel: "linkedin",
        occurredAt: new Date("2026-08-11T14:00:00.000Z"),
        actorEmail: "olegp306@gmail.com",
        outcome: "manual_ping"
      }
    ]);
    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/crm/manual-ping?entity=lead&recordId=lead-1"));

    expect(response.status).toBe(200);
    expect(mocks.prisma.outreachTouch.findMany).toHaveBeenCalledWith({
      where: { workspaceId: "default", leadId: "lead-1" },
      orderBy: { occurredAt: "desc" }
    });
    await expect(response.json()).resolves.toEqual([
      expect.objectContaining({ channel: "linkedin", actor: "Олег", actorCode: "О" })
    ]);
  });

  it("rejects channels outside the shared manual list", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/crm/manual-ping", {
        method: "POST",
        body: JSON.stringify({ entity: "lead", recordId: "lead-1", channel: "sms" })
      })
    );

    expect(response.status).toBe(400);
    expect(mocks.prisma.outreachTouch.create).not.toHaveBeenCalled();
  });
});
