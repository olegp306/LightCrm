import { getPrismaClient } from "@lightcrm/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { handleRouteError, resolveWorkspaceId } from "../../_shared";
import { getCrmRuntimeSettings } from "../../settings/crm-settings-store";
import { draftForCampaign, ensureEmailSignature } from "../draft-generator";

export const dynamic = "force-dynamic";

const draftCampaignSchema = z.object({
  workspaceId: z.string().optional().nullable(),
  coldTargetId: z.string().min(1),
  campaignId: z.string().min(1),
  touchId: z.string().min(1),
  force: z.boolean().optional().default(false)
});

function addDays(value: Date, days: number) {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

function draftIdentity(campaignId: string, touchId: string) {
  return `Campaign: ${campaignId}\nTouch: ${touchId}`;
}

function draftDescription(input: {
  campaignName: string;
  campaignId: string;
  touchId: string;
  action: string;
  subject: string;
  body: string;
}) {
  return [
    input.campaignName,
    draftIdentity(input.campaignId, input.touchId),
    input.action,
    input.subject ? `Subject: ${input.subject}` : null,
    input.body ? `Draft:\n${input.body}` : null
  ]
    .filter(Boolean)
    .join("\n\n");
}

function calendarItemForReminder(reminder: {
  id: string;
  title: string;
  dueAt: Date;
  status: string;
  sourceChannel: string | null;
}, coldTargetId: string) {
  return {
    id: reminder.id,
    kind: "reminder" as const,
    title: reminder.title,
    startsAt: reminder.dueAt.toISOString(),
    endsAt: null,
    status: reminder.status,
    sourceChannel: reminder.sourceChannel,
    related: { entity: "coldTarget" as const, id: coldTargetId }
  };
}

function draftSubjectFromDescription(description: string | null) {
  return description?.match(/(?:^|\n)Subject:\s*([^\n]+)/)?.[1]?.trim() ?? "";
}

function draftBodyFromDescription(description: string | null) {
  const match = description?.match(/(?:^|\n)Draft:\s*\n([\s\S]*)$/);
  return match?.[1]?.trim() ?? "";
}

export async function POST(request: Request) {
  try {
    const input = draftCampaignSchema.parse(await request.json());
    const workspaceId = resolveWorkspaceId(input.workspaceId);
    const settings = await getCrmRuntimeSettings();
    const campaign = settings.outreachCampaigns.campaigns.find((item) => item.id === input.campaignId);
    if (!campaign || campaign.status === "archived") {
      return NextResponse.json({ error: "Outreach campaign not found" }, { status: 404 });
    }
    const touch = campaign.touchpoints.find((item) => item.id === input.touchId);
    if (!touch) {
      return NextResponse.json({ error: "Campaign touch not found" }, { status: 404 });
    }

    const prisma = getPrismaClient();
    const coldTarget = await prisma.coldTarget.findFirst({
      where: { id: input.coldTargetId, workspaceId, archivedAt: null }
    });
    if (!coldTarget) {
      return NextResponse.json({ error: "Cold target not found" }, { status: 404 });
    }

    const dueAt = addDays(new Date(), touch.dayOffset);
    dueAt.setHours(9, 0, 0, 0);
    const title = `Touch ${touch.touchNumber}: ${touch.title} - ${coldTarget.company || coldTarget.name}`;

    const existingReminder = await prisma.reminder.findFirst({
      where: {
        workspaceId,
        coldTargetId: coldTarget.id,
        title,
        sourceChannel: "outreach-campaign",
        description: { contains: draftIdentity(campaign.id, touch.id) },
        archivedAt: null
      },
      orderBy: [{ dueAt: "asc" }]
    });
    if (existingReminder && !input.force) {
      const savedSubject = draftSubjectFromDescription(existingReminder.description);
      const savedBody = draftBodyFromDescription(existingReminder.description);
      const body = touch.channel === "email"
        ? ensureEmailSignature(savedBody, settings.outreachCampaigns.emailSignature)
        : savedBody;
      return NextResponse.json({
        draft: {
          reminderId: existingReminder.id,
          subject: savedSubject,
          body,
          channel: touch.channel,
          dueAt: existingReminder.dueAt.toISOString(),
          status: existingReminder.status,
          action: touch.action,
          email: coldTarget.email,
          recreated: false
        },
        calendarItem: calendarItemForReminder(existingReminder, coldTarget.id)
      });
    }
    const draft = draftForCampaign(campaign, coldTarget, touch, settings.outreachCampaigns.emailSignature);
    const description = draftDescription({
      campaignName: campaign.name,
      campaignId: campaign.id,
      touchId: touch.id,
      action: touch.action,
      subject: draft.subject,
      body: draft.body
    });
    const reminder = existingReminder
      ? await prisma.reminder.update({
          where: { id: existingReminder.id },
          data: { description, dueAt: existingReminder.status === "done" ? existingReminder.dueAt : dueAt }
        })
      : await prisma.reminder.create({
          data: {
            workspaceId,
            coldTargetId: coldTarget.id,
            title,
            description,
            dueAt,
            status: "draft",
            sourceChannel: "outreach-campaign"
          }
        });

    return NextResponse.json({
      draft: {
        reminderId: reminder.id,
        subject: draft.subject,
        body: draft.body,
        channel: touch.channel,
        dueAt: reminder.dueAt.toISOString(),
        status: reminder.status,
        action: touch.action,
        email: coldTarget.email,
        personaHook: draft.personaHook,
        promptApplied: draft.promptApplied,
        recreated: input.force
      },
      calendarItem: calendarItemForReminder(reminder, coldTarget.id)
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

