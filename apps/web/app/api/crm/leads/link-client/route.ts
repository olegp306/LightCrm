import { NextResponse } from "next/server";
import { z } from "zod";
import { getCrm, handleRouteError, parseJson, workspaceId } from "../../_shared";

const schema = z.object({
  workspaceId,
  leadId: z.string().min(1),
  clientId: z.string().min(1)
});

export async function POST(request: Request) {
  try {
    const input = await parseJson(request, schema);
    return NextResponse.json(await getCrm().linkLeadToClient(input));
  } catch (error) {
    return handleRouteError(error);
  }
}
