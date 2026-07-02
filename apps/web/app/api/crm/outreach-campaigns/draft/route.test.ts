import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  draftForCampaign: vi.fn(),
  prisma: {
    coldTarget: {
      findFirst: vi.fn()
    },
    reminder: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn()
    }
  }
}));

vi.mock("@lightcrm/db", () => ({
  getPrismaClient: () => mocks.prisma
}));

vi.mock("../draft-generator", () => ({
  draftForCampaign: mocks.draftForCampaign,
  ensureEmailSignature: (body: string, signature?: string | null) => {
    const cleanedBody = body.trim();
    const cleanedSignature = signature?.trim();
    if (!cleanedSignature || cleanedBody.includes(cleanedSignature)) {
      return cleanedBody;
    }
    return `${cleanedBody}\n\n${cleanedSignature}`;
  }
}));

vi.mock("../../settings/crm-settings-store", () => ({
  getCrmRuntimeSettings: async () => ({
    outreachCampaigns: {
      emailSignature: "Mit freundlichen Grüßen\nEkaterina Reyzbikh",
      campaigns: [
        {
          id: "campaign-1",
          name: "Architect outreach",
          status: "active",
          prompt: "Write concise email drafts.",
          summary: "Outbound campaign",
          goal: "Book a call",
          touchpoints: [
            {
              id: "touch-1",
              touchNumber: 1,
              title: "Intro",
              channel: "email",
              dayOffset: 0,
              action: "Send first email"
            }
          ],
          templates: []
        }
      ]
    }
  })
}));

describe("outreach campaign draft route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.draftForCampaign.mockReturnValue({
      subject: "Generated subject",
      body: "Generated body",
      personaHook: "Generated hook",
      promptApplied: true
    });
  });

  it("returns the saved reminder draft without recreating it", async () => {
    mocks.prisma.coldTarget.findFirst.mockResolvedValue({
      id: "cold-1",
      workspaceId: "default",
      name: "Katya Contact",
      company: "Saved Draft GmbH",
      role: "CEO",
      email: "target@example.com",
      notesResearch: "Generated fallback context"
    });
    mocks.prisma.reminder.findFirst.mockResolvedValue({
      id: "reminder-1",
      title: "Touch 1: Intro - Saved Draft GmbH",
      description: "Architect outreach\n\nCampaign: campaign-1\nTouch: touch-1\n\nSend first email\n\nSubject: Saved subject\n\nDraft:\nSaved body",
      dueAt: new Date("2026-07-02T09:00:00.000Z"),
      status: "draft",
      sourceChannel: "outreach-campaign"
    });

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/crm/outreach-campaigns/draft", {
        method: "POST",
        body: JSON.stringify({
          workspaceId: "default",
          coldTargetId: "cold-1",
          campaignId: "campaign-1",
          touchId: "touch-1"
        })
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.draft).toMatchObject({
      reminderId: "reminder-1",
      subject: "Saved subject",
      body: "Saved body\n\nMit freundlichen Grüßen\nEkaterina Reyzbikh",
      recreated: false
    });
    expect(mocks.prisma.reminder.create).not.toHaveBeenCalled();
    expect(mocks.prisma.reminder.update).not.toHaveBeenCalled();
    expect(mocks.draftForCampaign).not.toHaveBeenCalled();
  });
});
