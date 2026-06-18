import { getPrismaClient } from "@lightcrm/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { handleRouteError, resolveWorkspaceId } from "../../_shared";
import { getCrmRuntimeSettings } from "../../settings/crm-settings-store";
import { draftForCampaign } from "../draft-generator";

export const dynamic = "force-dynamic";

const startCampaignSchema = z.object({
  workspaceId: z.string().optional().nullable(),
  coldTargetId: z.string().min(1),
  campaignId: z.string().min(1),
  planMode: z.enum(["next", "allDraft"]).optional().default("next")
});

function addDays(value: Date, days: number) {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
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

export async function POST(request: Request) {
  try {
    const input = startCampaignSchema.parse(await request.json());
    const workspaceId = resolveWorkspaceId(input.workspaceId);
    const settings = await getCrmRuntimeSettings();
    const campaign = settings.outreachCampaigns.campaigns.find((item) => item.id === input.campaignId);
    if (!campaign || campaign.status === "archived") {
      return NextResponse.json({ error: "Outreach campaign not found" }, { status: 404 });
    }

    const prisma = getPrismaClient();
    const coldTarget = await prisma.coldTarget.findFirst({
      where: { id: input.coldTargetId, workspaceId, archivedAt: null }
    });
    if (!coldTarget) {
      return NextResponse.json({ error: "Cold target not found" }, { status: 404 });
    }

    const sortedTouches = [...campaign.touchpoints].sort((left, right) => left.touchNumber - right.touchNumber);
    const touch = sortedTouches[0];
    if (!touch) {
      return NextResponse.json({ error: "Campaign has no touchpoints" }, { status: 400 });
    }

    const now = new Date();
    const nextTouchAt = addDays(now, touch.dayOffset);
    nextTouchAt.setHours(9, 0, 0, 0);
    const draft = draftForCampaign(campaign, coldTarget, touch, settings.outreachCampaigns.emailSignature);
    const nextActionTitle = `Touch ${touch.touchNumber}: ${touch.title}`;

    const assignment = await prisma.outreachCampaignAssignment.upsert({
      where: {
        workspaceId_coldTargetId_campaignId: {
          workspaceId,
          coldTargetId: coldTarget.id,
          campaignId: campaign.id
        }
      },
      update: {
        campaignName: campaign.name,
        status: "active",
        currentTouchIndex: touch.touchNumber - 1,
        nextTouchAt,
        nextActionTitle,
        draftSubject: draft.subject,
        draftBody: draft.body,
        stoppedAt: null,
        archivedAt: null
      },
      create: {
        workspaceId,
        coldTargetId: coldTarget.id,
        campaignId: campaign.id,
        campaignName: campaign.name,
        status: "active",
        currentTouchIndex: touch.touchNumber - 1,
        nextTouchAt,
        nextActionTitle,
        draftSubject: draft.subject,
        draftBody: draft.body
      }
    });

    const touchesToPlan = input.planMode === "allDraft" ? sortedTouches : [touch];
    const reminders = [];
    for (const plannedTouch of touchesToPlan) {
      const plannedTouchAt = addDays(now, plannedTouch.dayOffset);
      plannedTouchAt.setHours(9, 0, 0, 0);
      const plannedDraft = draftForCampaign(campaign, coldTarget, plannedTouch, settings.outreachCampaigns.emailSignature);
      const plannedTitle = `Touch ${plannedTouch.touchNumber}: ${plannedTouch.title} - ${coldTarget.company || coldTarget.name}`;
      const existingReminder = await prisma.reminder.findFirst({
        where: {
          workspaceId,
          coldTargetId: coldTarget.id,
          title: plannedTitle,
          dueAt: plannedTouchAt,
          sourceChannel: "outreach-campaign",
          archivedAt: null
        }
      });
      if (existingReminder) {
        reminders.push(existingReminder);
        continue;
      }
      reminders.push(
        await prisma.reminder.create({
          data: {
            workspaceId,
            coldTargetId: coldTarget.id,
            title: plannedTitle,
            description: [
              campaign.name,
              plannedTouch.action,
              plannedDraft.subject ? `Subject: ${plannedDraft.subject}` : null,
              plannedDraft.body ? `Draft:\n${plannedDraft.body}` : null
            ]
              .filter(Boolean)
              .join("\n\n"),
            dueAt: plannedTouchAt,
            status: plannedTouch.touchNumber === touch.touchNumber ? "planned" : "draft",
            sourceChannel: "outreach-campaign"
          }
        })
      );
    }

    const primaryReminder = reminders[0] ?? null;
    return NextResponse.json({
      assignment,
      reminder: primaryReminder,
      reminders,
      rowPatch: {
        campaignName: assignment.campaignName,
        campaignStatus: assignment.status,
        campaignTouch: `Touch ${touch.touchNumber}/${campaign.touchpoints.length}`,
        nextAction: `${nextActionTitle} - ${nextTouchAt.toISOString().slice(0, 10)}`
      },
      calendarItem: primaryReminder ? calendarItemForReminder(primaryReminder, coldTarget.id) : null,
      calendarItems: reminders.map((reminder) => calendarItemForReminder(reminder, coldTarget.id))
    });
  } catch (error) {
    return handleRouteError(error);
  }
}



