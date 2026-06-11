import { runCrmOrchestration } from "@lightcrm/orchestrator";
import { NextResponse } from "next/server";
import { z } from "zod";
import { defaultWorkspaceId, getCrm, handleRouteError, parseJson } from "../../_shared";
import { getLangGraphSettings } from "../settings-store";

const DryRunInput = z.object({
  workspaceId: z.string().min(1).optional(),
  messageId: z.string().optional(),
  author: z.string().optional(),
  text: z.string().min(1),
  sourceChannel: z.enum(["telegram", "manual", "import"]).optional()
});

export async function POST(request: Request) {
  try {
    const input = await parseJson(request, DryRunInput);
    const workspaceId = input.workspaceId ?? defaultWorkspaceId;
    const settings = await getLangGraphSettings();
    const recentLeads = (await getCrm().listRecords({ entity: "lead", workspaceId, includeArchived: false }))
      .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())
      .slice(0, 12)
      .map((lead) => ({
        id: lead.id,
        label: [lead.code, lead.name].filter(Boolean).join(" ") || lead.name,
        summary: [lead.company, lead.phone, lead.email, lead.notes?.slice(0, 180)].filter(Boolean).join(" | ") || null,
        lastTouchedAt: lead.updatedAt.toISOString()
      }));
    return NextResponse.json(
      await runCrmOrchestration(
        {
          workspaceId,
          messageId: input.messageId,
          author: input.author,
          text: input.text,
          sourceChannel: input.sourceChannel ?? "telegram",
          recentLeads
        },
        settings
      )
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
