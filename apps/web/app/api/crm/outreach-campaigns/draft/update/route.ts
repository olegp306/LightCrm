import { getPrismaClient } from "@lightcrm/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { handleRouteError, resolveWorkspaceId } from "../../../_shared";
import { getCrmRuntimeSettings } from "../../../settings/crm-settings-store";

export const dynamic = "force-dynamic";

const updateDraftSchema = z.object({
  workspaceId: z.string().optional().nullable(),
  reminderId: z.string().min(1),
  coldTargetId: z.string().min(1),
  campaignId: z.string().min(1),
  subject: z.string().trim(),
  body: z.string().trim()
});

function reminderAction(description: string | null, fallback: string | null) {
  const lines = (description ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines[1] && !lines[1].startsWith("Subject:") && !lines[1].startsWith("Draft:")) {
    return lines[1];
  }
  return fallback ?? null;
}

export async function POST(request: Request) {
  try {
    const input = updateDraftSchema.parse(await request.json());
    const workspaceId = resolveWorkspaceId(input.workspaceId);
    const settings = await getCrmRuntimeSettings();
    const campaign = settings.outreachCampaigns.campaigns.find((item) => item.id === input.campaignId);
    if (!campaign) {
      return NextResponse.json({ error: "Outreach campaign not found" }, { status: 404 });
    }

    const prisma = getPrismaClient();
    const reminder = await prisma.reminder.findFirst({
      where: {
        id: input.reminderId,
        workspaceId,
        coldTargetId: input.coldTargetId,
        sourceChannel: "outreach-campaign",
        archivedAt: null
      }
    });
    if (!reminder) {
      return NextResponse.json({ error: "Outreach reminder not found" }, { status: 404 });
    }

    const touchMatch = reminder.title.match(/^Touch\s+(\d+):/i);
    const touchNumber = touchMatch ? Number(touchMatch[1]) : null;
    const touch = campaign.touchpoints.find((item) => item.touchNumber === touchNumber) ?? null;
    const action = reminderAction(reminder.description, touch?.action ?? null);
    const description = [
      campaign.name,
      action,
      input.subject ? `Subject: ${input.subject}` : null,
      input.body ? `Draft:\n${input.body}` : null
    ]
      .filter(Boolean)
      .join("\n\n");

    const [updatedReminder] = await Promise.all([
      prisma.reminder.update({
        where: { id: reminder.id },
        data: { description }
      }),
      prisma.outreachCampaignAssignment.updateMany({
        where: {
          workspaceId,
          coldTargetId: input.coldTargetId,
          campaignId: input.campaignId,
          archivedAt: null
        },
        data: {
          draftSubject: input.subject || null,
          draftBody: input.body || null
        }
      })
    ]);

    return NextResponse.json({
      ok: true,
      reminder: {
        id: updatedReminder.id,
        description: updatedReminder.description
      },
      outreach: {
        subject: input.subject,
        body: input.body
      }
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
