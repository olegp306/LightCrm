import { NextResponse } from "next/server";
import { z } from "zod";
import { getCrm, handleRouteError, optionalText, parseJson, workspaceId } from "../../_shared";

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

export async function POST(request: Request) {
  try {
    const input = await parseJson(request, schema);
    return NextResponse.json(await getCrm().upsertColdTarget(input));
  } catch (error) {
    return handleRouteError(error);
  }
}
