import { NextResponse } from "next/server";
import { z } from "zod";
import { getCrm, dateString, handleRouteError, optionalText, parseJson, workspaceId } from "../../_shared";

const schema = z.object({
  id: z.string().optional(),
  workspaceId,
  clientId: optionalText,
  leadId: optionalText,
  coldTargetId: optionalText,
  title: z.string().trim().min(1),
  description: optionalText,
  dueAt: dateString,
  status: z.enum(["open", "done", "snoozed", "archived"]).optional(),
  sourceChannel: optionalText
});

export async function POST(request: Request) {
  try {
    const input = await parseJson(request, schema);
    return NextResponse.json(await getCrm().upsertReminder(input));
  } catch (error) {
    return handleRouteError(error);
  }
}
