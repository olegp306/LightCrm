import { z } from "zod";
import { defaultWorkspaceId, getCrm, handleRouteError, parseJson } from "../_shared";

const schema = z.object({
  workspaceId: z.string().min(1).optional(),
  entity: z.enum(["client", "lead", "coldTarget", "reminder", "calendarEvent", "documentFile", "leadSummary"]),
  ids: z.array(z.string().min(1)).min(1)
});

export async function POST(request: Request) {
  try {
    const input = await parseJson(request, schema);
    const workspaceId = input.workspaceId ?? defaultWorkspaceId;
    const crm = getCrm();
    const archived = await Promise.all(
      input.ids.map((id) =>
        crm.archiveRecord({
          workspaceId,
          entity: input.entity,
          id
        })
      )
    );
    return Response.json({ archived });
  } catch (error) {
    return handleRouteError(error);
  }
}
