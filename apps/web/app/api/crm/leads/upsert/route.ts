import { NextResponse } from "next/server";
import { z } from "zod";
import { getCrm, handleRouteError, optionalText, parseJson, workspaceId } from "../../_shared";

const schema = z.object({
  id: z.string().optional(),
  workspaceId,
  clientId: optionalText,
  name: z.string().trim().min(1),
  email: optionalText,
  phone: optionalText,
  whatsapp: optionalText,
  company: optionalText,
  status: z.enum(["new", "contacted", "qualified", "lost", "converted", "archived"]).optional(),
  sourceChannel: optionalText,
  externalThreadId: optionalText,
  externalMessageId: optionalText,
  notes: optionalText
});

export async function POST(request: Request) {
  try {
    const input = await parseJson(request, schema);
    return NextResponse.json(await getCrm().upsertLead(input));
  } catch (error) {
    return handleRouteError(error);
  }
}
