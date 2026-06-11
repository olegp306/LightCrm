import { NextResponse } from "next/server";
import { z } from "zod";
import { defaultWorkspaceId, getCrm, handleRouteError, optionalText, parseJson } from "../../_shared";
import { maybeAutoGenerateCommercialOfferForLead } from "../commercial-offers";

const LeadPatch = z
  .object({
    clientId: optionalText,
    name: z.string().trim().min(1).optional(),
    email: optionalText,
    phone: optionalText,
    whatsapp: optionalText,
    company: optionalText,
    status: z.enum(["new", "contacted", "qualified", "lost", "converted", "archived"]).optional(),
    notes: optionalText,
    project: optionalText,
    area: optionalText,
    description: optionalText,
    interest: optionalText,
    urgency: optionalText,
    todo: optionalText,
    address: optionalText,
    messenger: optionalText,
    sourceChannel: optionalText,
    clientProjects: optionalText,
    budgetEur: optionalText,
    rawInput: optionalText
  })
  .strict();

const UpdateInput = z.object({
  workspaceId: z.string().min(1).optional(),
  leadId: z.string().min(1),
  patch: LeadPatch,
  source: z
    .object({
      channel: optionalText,
      messageId: optionalText
    })
    .optional()
});

type NativeLeadPatch = {
  clientId?: string | null;
  name?: string;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  company?: string | null;
  status?: "new" | "contacted" | "qualified" | "lost" | "converted" | "archived";
};

function appendSourceNote(notes: string | null | undefined, source?: { channel?: string | null; messageId?: string | null }) {
  const channel = source?.channel ?? null;
  const messageId = source?.messageId ?? null;
  const shouldAddMarker = Boolean(channel && channel !== "web-mobile");
  const marker = shouldAddMarker
    ? `Updated from ${channel}${messageId ? ` message ${messageId}` : ""}.`
    : null;
  return [notes, marker].filter(Boolean).join("\n\n") || null;
}

const noteFieldLabels = {
  project: "Project",
  area: "Area",
  description: "Description",
  interest: "Interest",
  urgency: "Urgency",
  todo: "Todo",
  address: "Address",
  clientProjects: "Client projects",
  budgetEur: "Budget EUR",
  rawInput: "Raw input"
} as const;

function replaceNoteField(notes: string | null | undefined, label: string, value: string | null | undefined): string | null {
  const currentNotes = notes ?? "";
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const fieldPattern = new RegExp(`(?:^|\\n\\n)${escaped}: [\\s\\S]*?(?=\\n\\n[A-Z][A-Za-z ]+: |$)`);
  const normalizedValue = typeof value === "string" ? value.trim() : value;
  const nextBlock = normalizedValue ? `${label}: ${normalizedValue}` : "";
  let nextNotes = currentNotes;
  if (fieldPattern.test(currentNotes)) {
    nextNotes = currentNotes.replace(fieldPattern, nextBlock);
  } else if (nextBlock) {
    nextNotes = [currentNotes.trim(), nextBlock].filter(Boolean).join("\n\n");
  }
  return nextNotes
    .split(/\n\n+/)
    .map((block) => block.trim())
    .filter(Boolean)
    .join("\n\n") || null;
}

function notesWithTabularPatch(notes: string | null | undefined, patch: z.infer<typeof LeadPatch>): string | null | undefined {
  let nextNotes = patch.notes === undefined ? notes : patch.notes;
  for (const [key, label] of Object.entries(noteFieldLabels)) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) {
      nextNotes = replaceNoteField(nextNotes, label, patch[key as keyof typeof noteFieldLabels]);
    }
  }
  return nextNotes;
}

export async function POST(request: Request) {
  try {
    const input = await parseJson(request, UpdateInput);
    const workspaceId = input.workspaceId ?? defaultWorkspaceId;
    const crm = getCrm();
    const leads = await crm.listRecords({ entity: "lead", workspaceId, includeArchived: true });
    const existing = leads.find((lead) => lead.id === input.leadId);
    if (!existing) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }
    const leadPatch: NativeLeadPatch = {};
    if (input.patch.clientId !== undefined) leadPatch.clientId = input.patch.clientId;
    if (input.patch.name !== undefined) leadPatch.name = input.patch.name;
    if (input.patch.email !== undefined) leadPatch.email = input.patch.email;
    if (input.patch.phone !== undefined) leadPatch.phone = input.patch.phone;
    if (input.patch.whatsapp !== undefined) leadPatch.whatsapp = input.patch.whatsapp;
    if (input.patch.company !== undefined) leadPatch.company = input.patch.company;
    if (input.patch.status !== undefined) leadPatch.status = input.patch.status;
    const nextNotes = notesWithTabularPatch(existing.notes, input.patch);
    const lead = await crm.upsertLead({
      ...existing,
      ...leadPatch,
      workspaceId,
      id: existing.id,
      company: input.patch.project ?? leadPatch.company ?? existing.company,
      whatsapp: input.patch.messenger ?? leadPatch.whatsapp ?? existing.whatsapp,
      notes:
        nextNotes === undefined
          ? existing.notes
          : appendSourceNote(nextNotes, {
              channel: input.source?.channel ?? null,
              messageId: input.source?.messageId ?? null
            }),
      sourceChannel: input.patch.sourceChannel ?? input.source?.channel ?? existing.sourceChannel,
      externalMessageId: input.source?.messageId ?? existing.externalMessageId
    });
    const autoOffer = await maybeAutoGenerateCommercialOfferForLead({ crm, workspaceId, leadId: lead.id });
    return NextResponse.json({ lead, autoOffer });
  } catch (error) {
    return handleRouteError(error);
  }
}
