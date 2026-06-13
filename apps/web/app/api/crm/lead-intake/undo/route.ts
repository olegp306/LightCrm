import { z } from "zod";
import { getCrm, handleRouteError, optionalText, parseJson, workspaceId } from "../../_shared";

const schema = z.object({
  workspaceId,
  leadId: z.string().trim().min(1),
  sourceMessageId: optionalText
});

export async function POST(request: Request) {
  try {
    const input = await parseJson(request, schema);
    return Response.json(await getCrm().undoLeadIntake(input));
  } catch (error) {
    return handleRouteError(error);
  }
}
