import { NextResponse } from "next/server";
import { z } from "zod";
import { defaultWorkspaceId, getCrm, handleRouteError, parseJson, resolveWorkspaceId } from "../../_shared";

const CreateLeadSummaryInput = z.object({
  workspaceId: z.string().min(1).optional(),
  leadId: z.string().min(1),
  shortSummary: z.string().trim().min(1).max(120),
  longSummary: z.string().trim().max(420).optional().nullable(),
  source: z.string().trim().max(80).optional().nullable()
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get("workspaceId") ?? defaultWorkspaceId;
    const leadId = url.searchParams.get("leadId");
    if (!leadId) {
      return NextResponse.json({ error: "leadId is required" }, { status: 400 });
    }

    const summaries = (await getCrm().listRecords({ entity: "leadSummary", workspaceId, includeArchived: true }))
      .filter((summary) => summary.leadId === leadId && !summary.archivedAt)
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());

    return NextResponse.json({
      leadId,
      latest: summaries[0] ?? null,
      summaries
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const input = await parseJson(request, CreateLeadSummaryInput);
    const workspaceId = resolveWorkspaceId(input.workspaceId);
    const summary = await getCrm().createLeadSummary({
      workspaceId,
      leadId: input.leadId,
      shortSummary: input.shortSummary,
      longSummary: input.longSummary ?? null,
      source: input.source ?? "manual"
    });

    return NextResponse.json({ summary });
  } catch (error) {
    return handleRouteError(error);
  }
}
