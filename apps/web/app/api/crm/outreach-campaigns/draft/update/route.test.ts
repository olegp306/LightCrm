import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    reminder: {
      findFirst: vi.fn(),
      update: vi.fn()
    },
    outreachCampaignAssignment: {
      findFirst: vi.fn(),
      update: vi.fn()
    }
  }
}));

vi.mock("@lightcrm/db", () => ({
  getPrismaClient: () => mocks.prisma
}));

vi.mock("../../../settings/crm-settings-store", () => ({
  getCrmRuntimeSettings: async () => ({
    outreachCampaigns: {
      emailSignature: "Mit freundlichen Grüßen\nEkaterina Reyzbikh",
      campaigns: [
        {
          id: "campaign-1",
          name: "Architect outreach",
          touchpoints: [
            {
              id: "touch-1",
              touchNumber: 1,
              title: "Intro",
              channel: "email",
              dayOffset: 0,
              action: "Send first email"
            }
          ]
        }
      ]
    }
  })
}));

describe("outreach campaign draft update route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("persists edited cold target draft subject and body in the reminder description", async () => {
    const updatedReminder = {
      id: "reminder-1",
      description:
        "Architect outreach\n\nCampaign: campaign-1\nTouch: touch-1\n\nSend first email\n\nSubject: Edited subject\n\nDraft:\nEdited body\n\nMit freundlichen Grüßen\nEkaterina Reyzbikh"
    };
    mocks.prisma.reminder.findFirst.mockResolvedValue({
      id: "reminder-1",
      title: "Touch 1: Intro - Target GmbH",
      description: "Architect outreach\n\nSend first email\n\nSubject: Old\n\nDraft:\nOld body"
    });
    mocks.prisma.reminder.update.mockResolvedValue(updatedReminder);
    mocks.prisma.outreachCampaignAssignment.findFirst.mockResolvedValue({
      id: "assignment-1",
      currentTouchIndex: 0
    });
    mocks.prisma.outreachCampaignAssignment.update.mockResolvedValue({});

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/crm/outreach-campaigns/draft/update", {
        method: "POST",
        body: JSON.stringify({
          workspaceId: "default",
          reminderId: "reminder-1",
          coldTargetId: "cold-1",
          campaignId: "campaign-1",
          subject: "Edited subject",
          body: "Edited body"
        })
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.prisma.reminder.update).toHaveBeenCalledWith({
      where: { id: "reminder-1" },
      data: {
        description:
          "Architect outreach\n\nCampaign: campaign-1\nTouch: touch-1\n\nSend first email\n\nSubject: Edited subject\n\nDraft:\nEdited body\n\nMit freundlichen Grüßen\nEkaterina Reyzbikh"
      }
    });
    expect(payload.reminder.description).toBe(updatedReminder.description);
    expect(payload.outreach).toEqual({
      subject: "Edited subject",
      body: "Edited body\n\nMit freundlichen Grüßen\nEkaterina Reyzbikh"
    });
  });
});
