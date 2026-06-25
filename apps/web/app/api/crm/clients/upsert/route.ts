import { NextResponse } from "next/server";
import { z } from "zod";
import { getCrm, handleRouteError, optionalText, parseJson, workspaceId } from "../../_shared";

const schema = z.object({
  id: z.string().optional(),
  workspaceId,
  name: z.string().trim().min(1),
  email: optionalText,
  phone: optionalText,
  whatsapp: optionalText,
  company: optionalText,
  address: optionalText,
  status: z.enum(["active", "warm", "paused", "archived"]).optional(),
  notes: optionalText,
  sourceChannel: optionalText,
  externalThreadId: optionalText,
  externalMessageId: optionalText
});

export async function POST(request: Request) {
  try {
    const input = await parseJson(request, schema);
    return NextResponse.json(await getCrm().upsertClient(input));
  } catch (error) {
    return handleRouteError(error);
  }
}
