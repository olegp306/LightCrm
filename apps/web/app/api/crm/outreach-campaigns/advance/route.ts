import { getPrismaClient } from "@lightcrm/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCrm, handleRouteError, resolveWorkspaceId } from "../../_shared";
import { getCrmRuntimeSettings } from "../../settings/crm-settings-store";
import { draftForCampaign } from "../draft-generator";

export const dynamic = "force-dynamic";

const advanceCampaignSchema = z.object({
  workspaceId: z.string().optional().nullable(),
  coldTargetId: z.string().min(1),
  campaignId: z.string().min(1),
  action: z.enum(["mark_sent", "stop"]),
  outcome: z
    .enum(["interested", "later", "existing_architect", "remove_me", "silent_8_touches", "not_a_fit"])
    .optional()
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

function stoppedStatusForOutcome(outcome: string | undefined) {
  if (!outcome) {
    return "stopped";
  }
  return `stopped:${outcome}`;
}

async function convertInterestedTargetToLead(input: {
  workspaceId: string;
  coldTarget: {
    id: string;
    code: string | null;
    name: string;
    company: string | null;
    email: string | null;
    phone: string | null;
    notesResearch: string | null;
  };
  campaignName: string;
}) {
  const prisma = getPrismaClient();
  const lookupMarkers = [input.coldTarget.id, input.coldTarget.code].filter((value): value is string => Boolean(value));
  const existingLead = await prisma.lead.findFirst({
    where: {
      workspaceId: input.workspaceId,
      sourceChannel: "outreach",
      archivedAt: null,
      OR: lookupMarkers.map((marker) => ({ notes: { contains: marker } }))
    },
    include: { client: true }
  });
  if (existingLead) {
    return { client: existingLead.client, lead: existingLead };
  }
  const crm = getCrm();
  const client = await crm.upsertClient({
    workspaceId: input.workspaceId,
    name: input.coldTarget.name || input.coldTarget.company || "Interested cold target",
    email: input.coldTarget.email,
    phone: input.coldTarget.phone,
    company: input.coldTarget.company,
    status: "warm",
    sourceChannel: "outreach",
    notes: [
      `Converted from Call Target ${input.coldTarget.code ?? input.coldTarget.id}.`,
      `Call Target ID: ${input.coldTarget.id}.`,
      `Campaign: ${input.campaignName}.`,
      input.coldTarget.notesResearch ? `Node Research: ${input.coldTarget.notesResearch}` : null
    ]
      .filter(Boolean)
      .join("\n")
  });
  const lead = await crm.upsertLeadWithClientResolution({
    workspaceId: input.workspaceId,
    clientId: client.id,
    name: input.coldTarget.company
      ? `${input.coldTarget.company} outreach opportunity`
      : `${input.coldTarget.name} outreach opportunity`,
    email: input.coldTarget.email,
    phone: input.coldTarget.phone,
    company: input.coldTarget.company,
    status: "new",
    sourceChannel: "outreach",
    notes: [
      `Interested reply from Call Target ${input.coldTarget.code ?? input.coldTarget.id}.`,
      `Call Target ID: ${input.coldTarget.id}.`,
      `Campaign: ${input.campaignName}.`,
      input.coldTarget.notesResearch ? `Node Research: ${input.coldTarget.notesResearch}` : null
    ]
      .filter(Boolean)
      .join("\n")
  });
  return { client, lead };
}

export async function POST(request: Request) {
  try {
    const input = advanceCampaignSchema.parse(await request.json());
    const workspaceId = resolveWorkspaceId(input.workspaceId);
    const settings = await getCrmRuntimeSettings();
    const campaign = settings.outreachCampaigns.campaigns.find((item) => item.id === input.campaignId);
    if (!campaign || campaign.status === "archived") {
      return NextResponse.json({ error: "Outreach campaign not found" }, { status: 404 });
    }

    const prisma = getPrismaClient();
    const [coldTarget, assignment] = await Promise.all([
      prisma.coldTarget.findFirst({ where: { id: input.coldTargetId, workspaceId, archivedAt: null } }),
      prisma.outreachCampaignAssignment.findUnique({
        where: {
          workspaceId_coldTargetId_campaignId: {
            workspaceId,
            coldTargetId: input.coldTargetId,
            campaignId: input.campaignId
          }
        }
      })
    ]);
    if (!coldTarget) {
      return NextResponse.json({ error: "Cold target not found" }, { status: 404 });
    }
    if (!assignment || assignment.archivedAt) {
      return NextResponse.json({ error: "Campaign is not started for this target" }, { status: 400 });
    }

    if (input.action === "stop") {
      const conversion =
        input.outcome === "interested"
          ? await convertInterestedTargetToLead({ workspaceId, coldTarget, campaignName: campaign.name })
          : null;
      const stoppedAssignment = await prisma.outreachCampaignAssignment.update({
        where: { id: assignment.id },
        data: {
          status: stoppedStatusForOutcome(input.outcome),
          outcome: input.outcome ?? null,
          stoppedAt: new Date(),
          nextTouchAt: null,
          nextActionTitle: null
        }
      });
      await prisma.coldTarget.update({
        where: { id: coldTarget.id },
        data: { status: input.outcome === "interested" ? "converted" : stoppedStatusForOutcome(input.outcome) }
      });
      return NextResponse.json({
        assignment: stoppedAssignment,
        conversion,
        rowPatch: {
          campaignName: stoppedAssignment.campaignName,
          campaignStatus: stoppedAssignment.status,
          campaignTouch: `Touch ${assignment.currentTouchIndex + 1}/${campaign.touchpoints.length}`,
          nextAction: conversion?.lead?.code
            ? `Converted to ${conversion.lead.code}`
            : input.outcome
              ? `Stopped: ${input.outcome}`
              : "Stopped",
          status: input.outcome === "interested" ? "converted" : stoppedStatusForOutcome(input.outcome)
        },
        calendarItems: []
      });
    }

    const sortedTouches = [...campaign.touchpoints].sort((left, right) => left.touchNumber - right.touchNumber);
    const currentTouch = sortedTouches[assignment.currentTouchIndex] ?? sortedTouches[0];
    if (!currentTouch) {
      return NextResponse.json({ error: "Campaign has no touchpoints" }, { status: 400 });
    }

    const currentTitle = `Touch ${currentTouch.touchNumber}: ${currentTouch.title} - ${coldTarget.company || coldTarget.name}`;
    const currentReminder = await prisma.reminder.findFirst({
      where: {
        workspaceId,
        coldTargetId: coldTarget.id,
        title: currentTitle,
        sourceChannel: "outreach-campaign",
        archivedAt: null
      },
      orderBy: [{ dueAt: "asc" }]
    });
    if (currentReminder) {
      await prisma.reminder.update({ where: { id: currentReminder.id }, data: { status: "done" } });
    }

    await prisma.outreachTouch.create({
      data: {
        workspaceId,
        coldTargetId: coldTarget.id,
        channel: currentTouch.channel,
        direction: "outbound",
        subject: assignment.draftSubject,
        body: assignment.draftBody,
        occurredAt: new Date(),
        outcome: "sent"
      }
    });

    const nextTouch = sortedTouches[assignment.currentTouchIndex + 1] ?? null;
    if (!nextTouch) {
      const completedAssignment = await prisma.outreachCampaignAssignment.update({
        where: { id: assignment.id },
        data: {
          status: "completed:silent_8_touches",
          outcome: "silent_8_touches",
          stoppedAt: new Date(),
          nextTouchAt: null,
          nextActionTitle: null
        }
      });
      return NextResponse.json({
        assignment: completedAssignment,
        rowPatch: {
          campaignName: completedAssignment.campaignName,
          campaignStatus: completedAssignment.status,
          campaignTouch: `${campaign.touchpoints.length}/${campaign.touchpoints.length}`,
          nextAction: "Completed: silent_8_touches"
        },
        calendarItems: currentReminder ? [calendarItemForReminder({ ...currentReminder, status: "done" }, coldTarget.id)] : []
      });
    }

    const now = new Date();
    const nextTouchAt = addDays(now, Math.max(1, nextTouch.dayOffset - currentTouch.dayOffset));
    nextTouchAt.setHours(9, 0, 0, 0);
    const nextDraft = draftForCampaign(campaign, coldTarget, nextTouch, settings.outreachCampaigns.emailSignature);
    const nextActionTitle = `Touch ${nextTouch.touchNumber}: ${nextTouch.title}`;
    const nextTitle = `${nextActionTitle} - ${coldTarget.company || coldTarget.name}`;
    const existingNextReminder = await prisma.reminder.findFirst({
      where: {
        workspaceId,
        coldTargetId: coldTarget.id,
        title: nextTitle,
        sourceChannel: "outreach-campaign",
        archivedAt: null
      },
      orderBy: [{ dueAt: "asc" }]
    });
    const nextReminder = existingNextReminder
      ? await prisma.reminder.update({ where: { id: existingNextReminder.id }, data: { status: "planned" } })
      : await prisma.reminder.create({
          data: {
            workspaceId,
            coldTargetId: coldTarget.id,
            title: nextTitle,
            description: [
              campaign.name,
              nextTouch.action,
              nextDraft.subject ? `Subject: ${nextDraft.subject}` : null,
              nextDraft.body ? `Draft:\n${nextDraft.body}` : null
            ]
              .filter(Boolean)
              .join("\n\n"),
            dueAt: nextTouchAt,
            status: "planned",
            sourceChannel: "outreach-campaign"
          }
        });

    const updatedAssignment = await prisma.outreachCampaignAssignment.update({
      where: { id: assignment.id },
      data: {
        status: "active",
        currentTouchIndex: nextTouch.touchNumber - 1,
        nextTouchAt: nextReminder.dueAt,
        nextActionTitle,
        draftSubject: nextDraft.subject,
        draftBody: nextDraft.body
      }
    });

    return NextResponse.json({
      assignment: updatedAssignment,
      rowPatch: {
        campaignName: updatedAssignment.campaignName,
        campaignStatus: updatedAssignment.status,
        campaignTouch: `Touch ${nextTouch.touchNumber}/${campaign.touchpoints.length}`,
        nextAction: `${nextActionTitle} - ${nextReminder.dueAt.toISOString().slice(0, 10)}`
      },
      calendarItems: [
        ...(currentReminder ? [calendarItemForReminder({ ...currentReminder, status: "done" }, coldTarget.id)] : []),
        calendarItemForReminder(nextReminder, coldTarget.id)
      ]
    });
  } catch (error) {
    return handleRouteError(error);
  }
}



