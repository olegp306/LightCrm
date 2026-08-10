import { getPrismaClient } from "@lightcrm/db";
import { NextResponse } from "next/server";
import { defaultWorkspaceId, getCrm, handleRouteError } from "../_shared";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get("workspaceId") ?? defaultWorkspaceId;
    const includeArchived = url.searchParams.get("includeArchived") === "true";
    const rows = await getCrm().listRecords({ entity: "coldTarget", workspaceId, includeArchived });
    const prisma = getPrismaClient();
    const assignments = await prisma.outreachCampaignAssignment.findMany({
      where: {
        workspaceId,
        archivedAt: null,
        coldTargetId: { in: rows.map((row) => row.id) }
      },
      orderBy: [{ updatedAt: "desc" }]
    });
    const touches = await prisma.outreachTouch.findMany({
      where: {
        workspaceId,
        coldTargetId: { in: rows.map((row) => row.id) }
      },
      orderBy: [{ occurredAt: "desc" }]
    });
    const byTarget = new Map(assignments.map((assignment) => [assignment.coldTargetId, assignment]));
    const latestTouchByTarget = new Map<string, Date>();
    const protocolByTarget = new Map<
      string,
      Array<{
        id: string;
        channel: string;
        direction: string;
        subject: string | null;
        occurredAt: string;
        outcome: string | null;
      }>
    >();
    for (const touch of touches) {
      if (!touch.coldTargetId || latestTouchByTarget.has(touch.coldTargetId)) {
        if (touch.coldTargetId) {
          const protocol = protocolByTarget.get(touch.coldTargetId) ?? [];
          if (protocol.length < 8) {
            protocol.push({
              id: touch.id,
              channel: touch.channel,
              direction: touch.direction,
              subject: touch.subject,
              occurredAt: touch.occurredAt.toISOString(),
              outcome: touch.outcome
            });
            protocolByTarget.set(touch.coldTargetId, protocol);
          }
        }
        continue;
      }
      latestTouchByTarget.set(touch.coldTargetId, touch.occurredAt);
      const protocol = protocolByTarget.get(touch.coldTargetId) ?? [];
      protocol.push({
        id: touch.id,
        channel: touch.channel,
        direction: touch.direction,
        subject: touch.subject,
        occurredAt: touch.occurredAt.toISOString(),
        outcome: touch.outcome
      });
      protocolByTarget.set(touch.coldTargetId, protocol);
    }
    return NextResponse.json(
      rows.map((row) => {
        const assignment = byTarget.get(row.id);
        return {
          ...row,
          pingAt: latestTouchByTarget.get(row.id)?.toISOString() ?? null,
          outreachProtocol: protocolByTarget.get(row.id) ?? [],
          campaignName: assignment?.campaignName ?? null,
          campaignStatus: assignment?.status ?? null,
          campaignTouch: assignment ? `Touch ${assignment.currentTouchIndex + 1}` : null,
          nextAction: assignment?.nextActionTitle
            ? [assignment.nextActionTitle, assignment.nextTouchAt?.toISOString().slice(0, 10)].filter(Boolean).join(" · ")
            : null
        };
      })
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
