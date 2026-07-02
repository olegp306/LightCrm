import { getPrismaClient } from "@lightcrm/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { handleRouteError, resolveWorkspaceId } from "../../../_shared";
import { getCrmRuntimeSettings } from "../../../settings/crm-settings-store";
import { ensureEmailSignature } from "../../draft-generator";

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
  const action = lines.find(
    (line) =>
      !line.startsWith("Campaign:") &&
      !line.startsWith("Touch:") &&
      !line.startsWith("Subject:") &&
      !line.startsWith("Draft:") &&
      line !== fallback
  );
  if (action && action !== lines[0]) {
    return action;
  }
  if (lines[1] && !lines[1].startsWith("Campaign:") && !lines[1].startsWith("Subject:") && !lines[1].startsWith("Draft:")) {
    return lines[1];
  }
  return fallback ?? null;
}

function draftIdentity(campaignId: string, touchId: string | null) {
  return touchId ? `Campaign: ${campaignId}\nTouch: ${touchId}` : `Campaign: ${campaignId}`;
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
    const savedBody = touch?.channel === "email"
      ? ensureEmailSignature(input.body, settings.outreachCampaigns.emailSignature)
      : input.body;
    const description = [
      campaign.name,
      draftIdentity(campaign.id, touch?.id ?? null),
      action,
      input.subject ? `Subject: ${input.subject}` : null,
      savedBody ? `Draft:\n${savedBody}` : null
    ]
      .filter(Boolean)
      .join("\n\n");
    const assignment = await prisma.outreachCampaignAssignment.findFirst({
      where: {
        workspaceId,
        coldTargetId: input.coldTargetId,
        campaignId: input.campaignId,
        archivedAt: null
      }
    });
    const isCurrentTouch = Boolean(assignment && touchNumber === assignment.currentTouchIndex + 1);

    const updatedReminder = await prisma.reminder.update({
      where: { id: reminder.id },
      data: { description }
    });
    if (assignment && isCurrentTouch) {
      await prisma.outreachCampaignAssignment.update({
        where: { id: assignment.id },
        data: {
          draftSubject: input.subject || null,
          draftBody: savedBody || null
        }
      });
    }

    return NextResponse.json({
      ok: true,
      reminder: {
        id: updatedReminder.id,
        description: updatedReminder.description
      },
      outreach: {
        subject: input.subject,
        body: savedBody
      }
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
