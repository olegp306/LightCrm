import { NextResponse } from "next/server";
import { z } from "zod";
import { getCrm, dateString, handleRouteError, optionalText, parseJson, workspaceId } from "../../_shared";

const schema = z.object({
  id: z.string().optional(),
  workspaceId,
  clientId: optionalText,
  leadId: optionalText,
  coldTargetId: optionalText,
  reminderId: optionalText,
  title: z.string().trim().min(1),
  description: optionalText,
  startsAt: dateString,
  endsAt: dateString,
  location: optionalText,
  externalProvider: optionalText,
  externalEventId: optionalText,
  syncStatus: optionalText,
  lastSyncedAt: dateString.nullable().optional()
});

export async function POST(request: Request) {
  try {
    const input = await parseJson(request, schema);
    return NextResponse.json(await getCrm().upsertCalendarEvent(input));
  } catch (error) {
    return handleRouteError(error);
  }
}
