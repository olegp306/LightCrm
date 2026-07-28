import { NextResponse } from "next/server";
import { z } from "zod";
import { getCrm, handleRouteError, optionalText, parseJson, workspaceId } from "../../_shared";

const coldTargetStatus = z.enum(["new", "queued", "contacted", "replied", "notFit", "archived"]);
const preferredLanguage = z.preprocess(
  (value) => (value === "" || value === "auto" ? null : value),
  z.enum(["de", "ru", "en"]).nullable().optional()
);

const ColdTargetPatch = z
  .object({
    code: optionalText,
    name: z.string().trim().min(1).optional(),
    company: optionalText,
    role: optionalText,
    email: optionalText,
    phone: optionalText,
    linkedinUrl: optionalText,
    website: optionalText,
    status: coldTargetStatus.optional(),
    source: optionalText,
    notesResearch: optionalText,
    archivedLetters: optionalText,
    notes: optionalText,
    preferredLanguage
  })
  .strict();

const DirectInput = z.object({
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
  status: coldTargetStatus.optional(),
  source: optionalText,
  notesResearch: optionalText,
  archivedLetters: optionalText,
  notes: optionalText,
  preferredLanguage
});

const PatchInput = z.object({
  workspaceId,
  coldTargetId: z.string().min(1),
  patch: ColdTargetPatch,
  source: z
    .object({
      channel: optionalText,
      messageId: optionalText
    })
    .optional()
});

const schema = z.union([DirectInput, PatchInput]);

export async function POST(request: Request) {
  try {
    const input = await parseJson(request, schema);
    const crm = getCrm();
    if ("patch" in input) {
      const targets = await crm.listRecords({ entity: "coldTarget", workspaceId: input.workspaceId, includeArchived: true });
      const existing = targets.find((target) => target.id === input.coldTargetId);
      if (!existing) {
        return NextResponse.json({ error: "Cold target not found" }, { status: 404 });
      }
      return NextResponse.json(
        await crm.upsertColdTarget({
          ...existing,
          ...input.patch,
          workspaceId: input.workspaceId,
          id: existing.id,
          name: input.patch.name ?? existing.name
        })
      );
    }
    return NextResponse.json(await crm.upsertColdTarget(input));
  } catch (error) {
    return handleRouteError(error);
  }
}
