import { runCrmOrchestration } from "@lightcrm/orchestrator";
import { NextResponse } from "next/server";
import { z } from "zod";
import { defaultWorkspaceId, handleRouteError, parseJson } from "../../_shared";

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
    return NextResponse.json(
      await runCrmOrchestration({
        workspaceId: input.workspaceId ?? defaultWorkspaceId,
        messageId: input.messageId,
        author: input.author,
        text: input.text,
        sourceChannel: input.sourceChannel ?? "telegram"
      })
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
