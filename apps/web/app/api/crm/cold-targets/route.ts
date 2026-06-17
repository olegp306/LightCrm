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
    const byTarget = new Map(assignments.map((assignment) => [assignment.coldTargetId, assignment]));
    return NextResponse.json(
      rows.map((row) => {
        const assignment = byTarget.get(row.id);
        return {
          ...row,
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
