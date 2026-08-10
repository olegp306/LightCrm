import { NextResponse } from "next/server";
import { z } from "zod";
import { getCrm, handleRouteError, jsonError, optionalText, workspaceId } from "../../_shared";

const schema = z.object({
  id: z.string().optional(),
  workspaceId,
  code: optionalText,
  name: z.string().trim().min(1),
  company: optionalText,
  role: optionalText,
  hook: optionalText,
  email: optionalText,
  phone: optionalText,
  linkedinUrl: optionalText,
  website: optionalText,
  status: z.enum(["new", "queued", "contacted", "replied", "notFit", "archived"]).optional(),
  source: optionalText,
  notesResearch: optionalText,
  archivedLetters: optionalText,
  notes: optionalText,
  preferredLanguage: z.preprocess(
    (value) => (value === "" || value === "auto" ? null : value),
    z.enum(["de", "ru", "en"]).nullable().optional()
  ),
  country: optionalText,
  firstTouchChannel: z.enum(["email", "linkedin", "phone"]).nullable().optional(),
  ballSide: z.enum(["us", "client"]).nullable().optional()
});

const patchSchema = schema
  .omit({ name: true })
  .extend({
    name: z.string().trim().min(1).optional()
  })
  .partial()
  .strict();

const tablePatchSchema = z.object({
  id: z.string().min(1),
  workspaceId,
  patch: patchSchema,
  source: z
    .object({
      channel: optionalText,
      messageId: optionalText
    })
    .optional()
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const tablePatch = tablePatchSchema.safeParse(body);
    const crm = getCrm();
    if (tablePatch.success) {
      const existing = (
        await crm.listRecords({
          workspaceId: tablePatch.data.workspaceId,
          entity: "coldTarget",
          includeArchived: true
        })
      ).find((target) => target.id === tablePatch.data.id);
      if (!existing) {
        return jsonError("Cold target not found", 404);
      }
      return NextResponse.json(
        await crm.upsertColdTarget({
          ...existing,
          ...tablePatch.data.patch,
          workspaceId: tablePatch.data.workspaceId,
          id: tablePatch.data.id
        })
      );
    }
    const input = schema.parse(body);
    return NextResponse.json(await crm.upsertColdTarget(input));
  } catch (error) {
    return handleRouteError(error);
  }
}
