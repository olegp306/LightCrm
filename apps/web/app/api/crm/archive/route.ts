import { z } from "zod";
import { getCrm, handleRouteError, parseJson, resolveWorkspaceId } from "../_shared";

const schema = z.object({
  workspaceId: z.string().min(1).optional(),
  entity: z.enum(["client", "lead", "coldTarget", "reminder", "calendarEvent", "documentFile", "leadSummary"]),
  ids: z.array(z.string().min(1)).min(1),
  mood: z.enum(["regular", "spicy"]).optional()
});

function notesWithArchiveMood(notes: string | null, mood: "regular" | "spicy" | undefined): string | null {
  if (mood !== "spicy") {
    return notes;
  }
  const marker = "Archive mood: spicy";
  if (notes?.includes(marker)) {
    return notes;
  }
  return [notes, marker].filter(Boolean).join("\n\n") || marker;
}

export async function POST(request: Request) {
  try {
    const input = await parseJson(request, schema);
    const workspaceId = resolveWorkspaceId(input.workspaceId);
    const crm = getCrm();
    const archived = await Promise.all(
      input.ids.map(async (id) => {
        if (input.entity === "lead" && input.mood === "spicy") {
          const record = await crm.archiveRecord({
            workspaceId,
            entity: "lead",
            id
          });
          return crm.upsertLead({
            ...record,
            workspaceId,
            id: record.id,
            notes: notesWithArchiveMood(record.notes, input.mood),
            status: "archived"
          });
        }
        const record = await crm.archiveRecord({
          workspaceId,
          entity: input.entity,
          id
        });
        return record;
      })
    );
    return Response.json({ archived });
  } catch (error) {
    return handleRouteError(error);
  }
}
