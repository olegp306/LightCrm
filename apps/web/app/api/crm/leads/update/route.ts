import { NextResponse } from "next/server";
import { z } from "zod";
import { dateString, getCrm, handleRouteError, optionalText, parseJson, resolveWorkspaceId } from "../../_shared";
import { leadNoteFields, notesWithTabularPatch, readJsonNoteField, replaceJsonNoteField } from "../note-fields";

const optionalLeadLanguage = z.preprocess(
  (value) => (value === "" || value === "auto" ? null : value),
  z.enum(["de", "ru", "en"]).nullable().optional()
);

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
    "client.name": optionalText,
    "client.phone": optionalText,
    "client.email": optionalText,
    progressStage: z.number().int().min(0).max(7).optional(),
    preferredLanguage: optionalLeadLanguage,
    contractNumber: optionalText,
    expectedFeeNet: z.number().finite().nullable().optional(),
    olegPercent: z.number().finite().nullable().optional(),
    handoffNote: optionalText,
    lastPingAt: dateString.nullable().optional(),
    clientType: optionalText,
    projectName: optionalText,
    project: optionalText,
    area: optionalText,
    description: optionalText,
    interest: optionalText,
    urgency: optionalText,
    todo: optionalText,
    ballSide: z.enum(["us", "client"]).optional(),
    address: optionalText,
    messenger: optionalText,
    sourceChannel: optionalText,
    clientProjects: optionalText,
    budgetEur: optionalText,
    offerFields: z.record(optionalText).optional(),
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
  progressStage?: number;
  preferredLanguage?: "de" | "ru" | "en" | null;
  contractNumber?: string | null;
  expectedFeeNet?: number | null;
  olegPercent?: number | null;
  handoffNote?: string | null;
  lastPingAt?: Date | null;
  clientType?: string | null;
};

function appendSourceNote(notes: string | null | undefined, source?: { channel?: string | null; messageId?: string | null }) {
  const channel = source?.channel ?? null;
  const messageId = source?.messageId ?? null;
  const shouldAddMarker = Boolean(channel && !channel.startsWith("web-"));
  const marker = shouldAddMarker
    ? `Updated from ${channel}${messageId ? ` message ${messageId}` : ""}.`
    : null;
  return [notes, marker].filter(Boolean).join("\n\n") || null;
}

export async function POST(request: Request) {
  try {
    const input = await parseJson(request, UpdateInput);
    const workspaceId = resolveWorkspaceId(input.workspaceId);
    const crm = getCrm();
    const leads = await crm.listRecords({ entity: "lead", workspaceId, includeArchived: true });
    const existing = leads.find((lead) => lead.id === input.leadId);
    if (!existing) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }
    const leadPatch: NativeLeadPatch = {};
    const clientPatch = {
      name: input.patch["client.name"],
      phone: input.patch["client.phone"],
      email: input.patch["client.email"]
    };
    const hasClientPatch = Object.values(clientPatch).some((value) => value !== undefined);
    const hasClientPatchValue = Object.values(clientPatch).some((value) => typeof value === "string" && value.length > 0);
    if (input.patch.clientId !== undefined) leadPatch.clientId = input.patch.clientId;
    if (input.patch.name !== undefined) leadPatch.name = input.patch.name;
    if (input.patch.email !== undefined) leadPatch.email = input.patch.email;
    if (input.patch.phone !== undefined) leadPatch.phone = input.patch.phone;
    if (input.patch.whatsapp !== undefined) leadPatch.whatsapp = input.patch.whatsapp;
    if (input.patch.company !== undefined) leadPatch.company = input.patch.company;
    if (input.patch.status !== undefined) leadPatch.status = input.patch.status;
    if (input.patch.progressStage !== undefined) leadPatch.progressStage = input.patch.progressStage;
    if (input.patch.preferredLanguage !== undefined) leadPatch.preferredLanguage = input.patch.preferredLanguage;
    if (input.patch.contractNumber !== undefined) leadPatch.contractNumber = input.patch.contractNumber;
    if (input.patch.expectedFeeNet !== undefined) leadPatch.expectedFeeNet = input.patch.expectedFeeNet;
    if (input.patch.olegPercent !== undefined) leadPatch.olegPercent = input.patch.olegPercent;
    if (input.patch.handoffNote !== undefined) leadPatch.handoffNote = input.patch.handoffNote;
    if (input.patch.lastPingAt !== undefined) leadPatch.lastPingAt = input.patch.lastPingAt;
    if (input.patch.clientType !== undefined) leadPatch.clientType = input.patch.clientType;
    let nextClientId = input.patch.clientId ?? existing.clientId;
    if (hasClientPatch && existing.clientId) {
      const clients = await crm.listRecords({ entity: "client", workspaceId, includeArchived: true });
      const existingClient = clients.find((client) => client.id === existing.clientId && !client.archivedAt);
      if (existingClient) {
        await crm.upsertClient({
          ...existingClient,
          workspaceId,
          id: existingClient.id,
          name: clientPatch.name ?? existingClient.name,
          phone: clientPatch.phone ?? existingClient.phone,
          email: clientPatch.email ?? existingClient.email
        });
      }
    }
    if (hasClientPatch && hasClientPatchValue && !nextClientId) {
      const createdClient = await crm.upsertClient({
        workspaceId,
        name: clientPatch.name ?? existing.name,
        phone: clientPatch.phone ?? existing.phone,
        email: clientPatch.email ?? existing.email,
        whatsapp: input.patch.messenger ?? existing.whatsapp,
        company: input.patch.projectName ?? input.patch.project ?? existing.company,
        status: "active",
        notes: "Created automatically from inline lead client edit.",
        sourceChannel: input.patch.sourceChannel ?? input.source?.channel ?? existing.sourceChannel,
        externalThreadId: existing.externalThreadId,
        externalMessageId: input.source?.messageId ?? existing.externalMessageId
      });
      nextClientId = createdClient.id;
    }
    let nextNotes = notesWithTabularPatch(existing.notes, input.patch);
    if (input.patch.offerFields) {
      const currentOfferFields = readJsonNoteField<Record<string, string>>(nextNotes ?? existing.notes, leadNoteFields.offerFields) ?? {};
      nextNotes = replaceJsonNoteField(nextNotes, leadNoteFields.offerFields, {
        ...currentOfferFields,
        ...input.patch.offerFields
      });
    }
    const lead = await crm.upsertLeadWithClientResolution({
      ...existing,
      ...leadPatch,
      workspaceId,
      id: existing.id,
      clientId: nextClientId,
      name: clientPatch.name ?? leadPatch.name ?? existing.name,
      phone: clientPatch.phone ?? leadPatch.phone ?? existing.phone,
      email: clientPatch.email ?? leadPatch.email ?? existing.email,
      company: input.patch.projectName ?? input.patch.project ?? leadPatch.company ?? existing.company,
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
    return NextResponse.json({ lead });
  } catch (error) {
    return handleRouteError(error);
  }
}
