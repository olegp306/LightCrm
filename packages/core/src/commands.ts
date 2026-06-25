import type { CrmCollection, CrmRepository } from "./repository";
import { globalSearch } from "./search";
import type {
  AuditLog,
  CalendarEvent,
  Client,
  ColdTarget,
  CreateOutreachTouchInput,
  CreateLeadSummaryInput,
  DocumentFile,
  EntityMap,
  IngestLeadIntakeInput,
  Lead,
  LeadSummary,
  LeadIntakeAttachmentInput,
  LeadIntakeResult,
  OutreachTouch,
  Reminder,
  UpsertCalendarEventInput,
  UpsertClientInput,
  UpsertColdTargetInput,
  UpsertDocumentFileInput,
  UpsertLeadInput,
  UpsertReminderInput
} from "./types";

type LinkLeadToClientInput = {
  workspaceId: string;
  leadId: string;
  clientId: string;
};

type ArchiveRecordInput = {
  workspaceId: string;
  entity: Exclude<CrmCollection, "outreachTouch">;
  id: string;
};

type UndoLeadIntakeInput = {
  workspaceId: string;
  leadId: string;
  sourceMessageId?: string | null;
};

type UndoLeadIntakeResult = {
  lead: Lead;
  archivedDocumentIds: string[];
  archivedSummaryIds: string[];
};

type ListRecordsInput = {
  workspaceId: string;
  entity: CrmCollection;
  includeArchived?: boolean;
};

const idPrefixes: Record<CrmCollection | "auditLog", string> = {
  client: "client",
  lead: "lead",
  coldTarget: "cold",
  outreachTouch: "touch",
  reminder: "reminder",
  calendarEvent: "event",
  documentFile: "doc",
  leadSummary: "leadSummary",
  auditLog: "audit"
};

function createId(entity: CrmCollection | "auditLog"): string {
  return `${idPrefixes[entity]}_${crypto.randomUUID()}`;
}

function now(): Date {
  return new Date();
}

const undoableLeadFields = [
  "clientId",
  "name",
  "email",
  "phone",
  "whatsapp",
  "company",
  "status",
  "sourceChannel",
  "externalThreadId",
  "externalMessageId"
] as const satisfies readonly (keyof Lead)[];

type UndoableLeadField = (typeof undoableLeadFields)[number];
type LeadFieldSnapshot = {
  before: Partial<Record<UndoableLeadField, string | null>>;
  after: Partial<Record<UndoableLeadField, string | null>>;
};

function leadFieldSnapshot(existing: Lead | null, record: Lead): LeadFieldSnapshot | null {
  if (!existing) {
    return null;
  }
  const before: Partial<Record<UndoableLeadField, string | null>> = {};
  const after: Partial<Record<UndoableLeadField, string | null>> = {};
  for (const field of undoableLeadFields) {
    if (existing[field] !== record[field]) {
      before[field] = existing[field] as string | null;
      after[field] = record[field] as string | null;
    }
  }
  return Object.keys(before).length > 0 ? { before, after } : null;
}

function validLeadFieldSnapshot(value: unknown): LeadFieldSnapshot | null {
  if (!value || typeof value !== "object" || !("before" in value)) {
    return null;
  }
  const before = (value as { before?: unknown }).before;
  if (!before || typeof before !== "object") {
    return null;
  }
  const snapshotBefore: Partial<Record<UndoableLeadField, string | null>> = {};
  const snapshotAfter: Partial<Record<UndoableLeadField, string | null>> = {};
  for (const field of undoableLeadFields) {
    const previous = (before as Record<string, unknown>)[field];
    if (previous === null || typeof previous === "string") {
      snapshotBefore[field] = previous;
    }
    const next = ((value as { after?: unknown }).after as Record<string, unknown> | undefined)?.[field];
    if (next === null || typeof next === "string") {
      snapshotAfter[field] = next;
    }
  }
  return Object.keys(snapshotBefore).length > 0 ? { before: snapshotBefore, after: snapshotAfter } : null;
}

function restoreLeadSnapshot(lead: Lead, snapshot: LeadFieldSnapshot | null): Lead {
  if (!snapshot) {
    return lead;
  }
  return undoableLeadFields.reduce<Lead>((record, field) => {
    if (field in snapshot.before) {
      return { ...record, [field]: snapshot.before[field] ?? null };
    }
    return record;
  }, lead);
}

function businessCodeYear(date: Date): string {
  return String(date.getFullYear());
}

async function nextBusinessCode(
  repository: CrmRepository,
  entity: "client" | "lead",
  workspaceId: string,
  prefix: "C" | "L",
  timestamp: Date
): Promise<string> {
  const year = businessCodeYear(timestamp);
  const pattern = new RegExp(`^${prefix}-${year}-(\\d+)$`);
  const records = await repository.list(entity, workspaceId);
  const maxNumber = records.reduce((max, record) => {
    const code = "code" in record && typeof record.code === "string" ? record.code : null;
    const match = code?.match(pattern);
    if (!match) {
      return max;
    }
    const number = Number.parseInt(match[1] ?? "", 10);
    return Number.isFinite(number) ? Math.max(max, number) : max;
  }, 0);
  return `${prefix}-${year}-${String(maxNumber + 1).padStart(3, "0")}`;
}

function nullable(value: string | null | undefined): string | null {
  return value ?? null;
}

function nullableOutreachLanguage(value: ColdTarget["preferredLanguage"] | undefined): ColdTarget["preferredLanguage"] {
  return value === "de" || value === "ru" || value === "en" ? value : null;
}

function trimText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeEmail(value: string | null | undefined): string | null {
  return trimText(value)?.toLocaleLowerCase() ?? null;
}

function normalizePhone(value: string | null | undefined): string | null {
  const trimmed = trimText(value);
  if (!trimmed) {
    return null;
  }
  const hasInternationalPrefix = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) {
    return null;
  }
  return hasInternationalPrefix ? `+${digits}` : digits;
}

function leadContactClientName(input: UpsertLeadInput): string {
  return trimText(input.name) ?? trimText(input.company) ?? "Client from lead";
}

function compactText(value: string, maxLength = 240): string {
  const compacted = value.replace(/\s+/g, " ").trim();
  if (compacted.length <= maxLength) {
    return compacted;
  }
  return `${compacted.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
}

function compactMultilineText(value: string, maxLength = 900): string {
  const lines = value
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const result: string[] = [];
  for (const line of lines) {
    const next = [...result, line].join("\n");
    if (next.length > maxLength) {
      break;
    }
    result.push(line);
  }
  if (result.length > 0) {
    return result.join("\n");
  }
  return compactText(value, maxLength);
}

const leadSummaryShortMax = 260;
const leadSummaryLongMax = 900;

function displaySourceChannel(value: string | null | undefined): string {
  return value?.toLocaleLowerCase() === "telegram" ? "TG" : value ?? "intake";
}

function cleanIntakeText(value: string): string {
  return value
    .replace(/^Source:\s*TG(?:\s+thread\s+\S+)?\.\s*/i, "")
    .replace(/^Source:\s*[^.]+\.\s*/i, "")
    .replace(/^Text:\s*/i, "")
    .replace(/\s*Files:\s*no attachments\.?$/i, "")
    .trim();
}

function attachmentSummary(attachment: LeadIntakeAttachmentInput): string {
  const provided = trimText(attachment.summary);
  if (provided) {
    return provided;
  }
  const label: Record<LeadIntakeAttachmentInput["kind"], string> = {
    image: "Image",
    pdf: "PDF",
    audio: "Audio",
    voice: "Voice",
    document: "Document",
    other: "File"
  };
  return `${label[attachment.kind]} attached to lead intake`;
}

function inferAttachmentKind(document: DocumentFile): LeadIntakeAttachmentInput["kind"] {
  const mimeType = document.mimeType?.toLocaleLowerCase() ?? "";
  const fileName = document.fileName.toLocaleLowerCase();
  if (mimeType.startsWith("image/") || /\.(jpe?g|png|webp|gif)$/i.test(fileName)) {
    return "image";
  }
  if (mimeType === "application/pdf" || fileName.endsWith(".pdf")) {
    return "pdf";
  }
  if (mimeType.startsWith("audio/") || /\.(m4a|mp3|mp4|mpeg|mpga|oga|ogg|wav|webm)$/i.test(fileName)) {
    return "audio";
  }
  if (
    mimeType.startsWith("text/") ||
    mimeType.includes("document") ||
    mimeType.includes("json") ||
    /\.(txt|csv|json|md|docx?)$/i.test(fileName)
  ) {
    return "document";
  }
  return "other";
}

function documentToAttachmentInput(
  document: DocumentFile,
  knownAttachment?: LeadIntakeAttachmentInput
): LeadIntakeAttachmentInput {
  return {
    sourceMessageId: knownAttachment?.sourceMessageId,
    kind: knownAttachment?.kind ?? inferAttachmentKind(document),
    fileName: document.fileName,
    storageProvider: document.storageProvider,
    storageBucket: document.storageBucket,
    storageKey: document.storageKey,
    downloadUrl: document.downloadUrl,
    mimeType: document.mimeType,
    sizeBytes: document.sizeBytes,
    summary: document.shortSummary,
    longSummary: document.longSummary ?? knownAttachment?.longSummary
  };
}

function buildLeadIntakeSummary(input: IngestLeadIntakeInput): {
  shortSummary: string;
  longSummary: string;
  originalTakes: string[];
} {
  const textItems = input.textItems ?? [];
  const attachments = input.attachments ?? [];
  const originalTakes = [
    ...textItems.map((item) => {
      const prefix = [item.author, item.sourceMessageId ? `#${item.sourceMessageId}` : null].filter(Boolean).join(" ");
      return prefix ? `${prefix}: ${item.text}` : item.text;
    }),
    ...attachments.map((attachment) => {
      const source = attachment.sourceMessageId ? ` #${attachment.sourceMessageId}` : "";
      return `${attachment.kind}${source}: ${attachment.fileName} - ${attachmentSummary(attachment)}`;
    })
  ].filter((value) => trimText(value)) as string[];

  const textSummary = cleanIntakeText(textItems
    .map((item) => item.text.trim())
    .filter(Boolean)
    .join(" "));
  const attachmentCount = attachments.length;
  const attachmentKinds = [...new Set(attachments.map((attachment) => attachment.kind))];
  const attachmentDetails = attachments
    .map((attachment) => `${attachment.kind} - ${attachmentSummary(attachment)}`)
    .join("; ");
  const source = displaySourceChannel(input.sourceChannel);
  const clientIntent =
    textSummary || (attachmentCount > 0 ? "Review incoming files and extract lead details." : "Lead intake received.");
  const documentSummary =
    attachmentCount > 0
      ? `${attachmentCount} document(s)${attachmentKinds.length > 0 ? ` [${attachmentKinds.join(", ")}]` : ""}: ${attachmentDetails}`
      : null;
  const shortSummary = compactText(
    [`${source}: ${compactText(clientIntent, 190)}`, documentSummary ? compactText(documentSummary, 80) : null]
      .filter(Boolean)
      .join(" "),
    leadSummaryShortMax
  );
  const longSummary = compactMultilineText(
    [
      `${source}: ${clientIntent}`,
      documentSummary ? `Documents: ${documentSummary}` : null,
      textSummary ? `Copy: "${compactText(textSummary, 260)}"` : null,
      attachmentCount > 0
        ? `Document notes: ${attachments.map((attachment) => `"${attachmentSummary(attachment)}"`).join("; ")}`
        : null
    ]
      .filter(Boolean)
      .join("\n"),
    leadSummaryLongMax
  );

  return {
    shortSummary,
    longSummary,
    originalTakes
  };
}

function appendIntakeNotes(existingNotes: string | null, summary: string, originalTakes: string[]): string {
  const block = [
    "Lead intake summary",
    summary,
    "",
    "Original takes",
    ...originalTakes.map((take) => `- ${take}`)
  ].join("\n");
  return [trimText(existingNotes), block].filter(Boolean).join("\n\n");
}

function removeLatestIntakeNotesBlock(notes: string | null): string | null {
  const cleaned = trimText(notes);
  if (!cleaned) {
    return null;
  }
  const marker = "\n\nLead intake summary\n";
  const markerIndex = cleaned.lastIndexOf(marker);
  if (markerIndex >= 0) {
    return trimText(cleaned.slice(0, markerIndex)) || null;
  }
  return cleaned.startsWith("Lead intake summary\n") ? null : cleaned;
}

function removeTelegramUpdateNotesBlock(notes: string | null, sourceMessageId: string | null | undefined): string | null {
  const cleaned = trimText(notes);
  if (!cleaned || !sourceMessageId) {
    return cleaned || null;
  }
  const marker = `Updated from telegram message ${sourceMessageId}.`;
  const blocks = cleaned.split(/\n{2,}/);
  const markerIndex = blocks.findIndex((block) => block.trim() === marker);
  if (markerIndex < 0) {
    return cleaned;
  }
  const remove = new Set([markerIndex]);
  if (markerIndex > 0 && blocks[markerIndex - 1]?.startsWith("Raw input:")) {
    remove.add(markerIndex - 1);
  }
  return trimText(blocks.filter((_, index) => !remove.has(index)).join("\n\n")) || null;
}

export function createCrmService(repository: CrmRepository) {
  async function audit(log: Omit<AuditLog, "id" | "createdAt">): Promise<AuditLog> {
    return repository.appendAuditLog({
      ...log,
      id: createId("auditLog"),
      createdAt: now()
    });
  }

  async function upsertClient(input: UpsertClientInput): Promise<Client> {
    const existing = input.id ? await repository.get("client", input.id) : null;
    const timestamp = now();
    const record: Client = {
      id: existing?.id ?? input.id ?? createId("client"),
      workspaceId: input.workspaceId,
      code:
        nullable(input.code) ??
        existing?.code ??
        (await nextBusinessCode(repository, "client", input.workspaceId, "C", timestamp)),
      name: input.name,
      email: nullable(input.email ?? existing?.email),
      phone: nullable(input.phone ?? existing?.phone),
      whatsapp: nullable(input.whatsapp ?? existing?.whatsapp),
      company: nullable(input.company ?? existing?.company),
      address: nullable(input.address ?? existing?.address),
      status: input.status ?? existing?.status ?? "active",
      notes: nullable(input.notes ?? existing?.notes),
      sourceChannel: nullable(input.sourceChannel ?? existing?.sourceChannel),
      externalThreadId: nullable(input.externalThreadId ?? existing?.externalThreadId),
      externalMessageId: nullable(input.externalMessageId ?? existing?.externalMessageId),
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
      archivedAt: existing?.archivedAt ?? null
    };
    await repository.save("client", record);
    await audit({
      workspaceId: record.workspaceId,
      actorId: null,
      action: "client.upsert",
      entity: "client",
      entityId: record.id,
      metadata: { name: record.name }
    });
    return record;
  }

  async function upsertLead(input: UpsertLeadInput): Promise<Lead> {
    const existing = input.id ? await repository.get("lead", input.id) : null;
    const timestamp = now();
    const record: Lead = {
      id: existing?.id ?? input.id ?? createId("lead"),
      workspaceId: input.workspaceId,
      code:
        nullable(input.code) ??
        existing?.code ??
        (await nextBusinessCode(repository, "lead", input.workspaceId, "L", timestamp)),
      clientId: input.clientId ?? existing?.clientId ?? null,
      name: input.name,
      email: nullable(input.email ?? existing?.email),
      phone: nullable(input.phone ?? existing?.phone),
      whatsapp: nullable(input.whatsapp ?? existing?.whatsapp),
      company: nullable(input.company ?? existing?.company),
      status: input.status ?? existing?.status ?? "new",
      sourceChannel: nullable(input.sourceChannel ?? existing?.sourceChannel),
      externalThreadId: nullable(input.externalThreadId ?? existing?.externalThreadId),
      externalMessageId: nullable(input.externalMessageId ?? existing?.externalMessageId),
      notes: nullable(input.notes ?? existing?.notes),
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
      archivedAt: existing?.archivedAt ?? null
    };
    await repository.save("lead", record);
    await audit({
      workspaceId: record.workspaceId,
      actorId: null,
      action: "lead.upsert",
      entity: "lead",
      entityId: record.id,
      metadata: {
        name: record.name,
        clientId: record.clientId,
        sourceMessageId: input.externalMessageId ?? null,
        fieldSnapshot: leadFieldSnapshot(existing, record)
      }
    });
    return record;
  }

  async function upsertColdTarget(input: UpsertColdTargetInput): Promise<ColdTarget> {
    const existing = input.id ? await repository.get("coldTarget", input.id) : null;
    const timestamp = now();
    const record: ColdTarget = {
      id: existing?.id ?? input.id ?? createId("coldTarget"),
      workspaceId: input.workspaceId,
      code: nullable(input.code ?? existing?.code),
      name: input.name,
      company: nullable(input.company ?? existing?.company),
      role: nullable(input.role ?? existing?.role),
      email: nullable(input.email ?? existing?.email),
      phone: nullable(input.phone ?? existing?.phone),
      linkedinUrl: nullable(input.linkedinUrl ?? existing?.linkedinUrl),
      website: nullable(input.website ?? existing?.website),
      status: input.status ?? existing?.status ?? "new",
      source: nullable(input.source ?? existing?.source),
      notesResearch: nullable(input.notesResearch ?? existing?.notesResearch),
      archivedLetters: nullable(input.archivedLetters ?? existing?.archivedLetters),
      notes: nullable(input.notes ?? existing?.notes),
      preferredLanguage: nullableOutreachLanguage(input.preferredLanguage ?? existing?.preferredLanguage),
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
      archivedAt: existing?.archivedAt ?? null
    };
    await repository.save("coldTarget", record);
    await audit({
      workspaceId: record.workspaceId,
      actorId: null,
      action: "coldTarget.upsert",
      entity: "coldTarget",
      entityId: record.id,
      metadata: { name: record.name }
    });
    return record;
  }

  async function createOutreachTouch(input: CreateOutreachTouchInput): Promise<OutreachTouch> {
    const record: OutreachTouch = {
      id: createId("outreachTouch"),
      workspaceId: input.workspaceId,
      coldTargetId: input.coldTargetId ?? null,
      leadId: input.leadId ?? null,
      clientId: input.clientId ?? null,
      channel: input.channel,
      direction: input.direction,
      subject: nullable(input.subject),
      body: nullable(input.body),
      occurredAt: input.occurredAt,
      outcome: nullable(input.outcome),
      createdAt: now()
    };
    await repository.save("outreachTouch", record);
    await audit({
      workspaceId: record.workspaceId,
      actorId: null,
      action: "outreachTouch.create",
      entity: "outreachTouch",
      entityId: record.id,
      metadata: { channel: record.channel, direction: record.direction }
    });
    return record;
  }

  async function upsertReminder(input: UpsertReminderInput): Promise<Reminder> {
    const existing = input.id ? await repository.get("reminder", input.id) : null;
    const timestamp = now();
    const record: Reminder = {
      id: existing?.id ?? input.id ?? createId("reminder"),
      workspaceId: input.workspaceId,
      clientId: input.clientId ?? existing?.clientId ?? null,
      leadId: input.leadId ?? existing?.leadId ?? null,
      coldTargetId: input.coldTargetId ?? existing?.coldTargetId ?? null,
      title: input.title,
      description: nullable(input.description ?? existing?.description),
      dueAt: input.dueAt,
      status: input.status ?? existing?.status ?? "open",
      sourceChannel: nullable(input.sourceChannel ?? existing?.sourceChannel),
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
      archivedAt: existing?.archivedAt ?? null
    };
    await repository.save("reminder", record);
    await audit({
      workspaceId: record.workspaceId,
      actorId: null,
      action: "reminder.upsert",
      entity: "reminder",
      entityId: record.id,
      metadata: { title: record.title, dueAt: record.dueAt.toISOString() }
    });
    return record;
  }

  async function upsertCalendarEvent(input: UpsertCalendarEventInput): Promise<CalendarEvent> {
    const existing = input.id ? await repository.get("calendarEvent", input.id) : null;
    const timestamp = now();
    const record: CalendarEvent = {
      id: existing?.id ?? input.id ?? createId("calendarEvent"),
      workspaceId: input.workspaceId,
      clientId: input.clientId ?? existing?.clientId ?? null,
      leadId: input.leadId ?? existing?.leadId ?? null,
      coldTargetId: input.coldTargetId ?? existing?.coldTargetId ?? null,
      reminderId: input.reminderId ?? existing?.reminderId ?? null,
      title: input.title,
      description: nullable(input.description ?? existing?.description),
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      location: nullable(input.location ?? existing?.location),
      externalProvider: nullable(input.externalProvider ?? existing?.externalProvider),
      externalEventId: nullable(input.externalEventId ?? existing?.externalEventId),
      syncStatus: nullable(input.syncStatus ?? existing?.syncStatus),
      lastSyncedAt: input.lastSyncedAt ?? existing?.lastSyncedAt ?? null,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
      archivedAt: existing?.archivedAt ?? null
    };
    await repository.save("calendarEvent", record);
    await audit({
      workspaceId: record.workspaceId,
      actorId: null,
      action: "calendarEvent.upsert",
      entity: "calendarEvent",
      entityId: record.id,
      metadata: { title: record.title, startsAt: record.startsAt.toISOString() }
    });
    return record;
  }

  async function upsertDocumentFile(input: UpsertDocumentFileInput): Promise<DocumentFile> {
    const existing = input.id ? await repository.get("documentFile", input.id) : null;
    const timestamp = now();
    const record: DocumentFile = {
      id: existing?.id ?? input.id ?? createId("documentFile"),
      workspaceId: input.workspaceId,
      clientId: input.clientId ?? existing?.clientId ?? null,
      leadId: input.leadId ?? existing?.leadId ?? null,
      fileName: input.fileName,
      shortSummary: input.shortSummary,
      longSummary: nullable(input.longSummary ?? existing?.longSummary),
      downloadUrl: nullable(input.downloadUrl ?? existing?.downloadUrl),
      storageProvider: input.storageProvider ?? existing?.storageProvider ?? "s3",
      storageBucket: nullable(input.storageBucket ?? existing?.storageBucket),
      storageKey: input.storageKey,
      mimeType: nullable(input.mimeType ?? existing?.mimeType),
      sizeBytes: input.sizeBytes ?? existing?.sizeBytes ?? null,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
      archivedAt: existing?.archivedAt ?? null
    };
    await repository.save("documentFile", record);
    await audit({
      workspaceId: record.workspaceId,
      actorId: null,
      action: "documentFile.upsert",
      entity: "documentFile",
      entityId: record.id,
      metadata: { fileName: record.fileName, clientId: record.clientId, leadId: record.leadId }
    });
    return record;
  }

  async function resolveClientForLead(input: UpsertLeadInput): Promise<string | null> {
    if (input.clientId) {
      return input.clientId;
    }
    const email = normalizeEmail(input.email);
    const phone = normalizePhone(input.phone);
    if (!email && !phone) {
      return null;
    }

    const clients = await repository.list("client", input.workspaceId);
    const matches = clients.filter((client) => {
      if (client.archivedAt) {
        return false;
      }
      const clientEmail = normalizeEmail(client.email);
      const clientPhone = normalizePhone(client.phone);
      return Boolean((email && clientEmail === email) || (phone && clientPhone === phone));
    });
    const uniqueMatches = [...new Map(matches.map((client) => [client.id, client])).values()];

    if (uniqueMatches.length === 1) {
      const client = uniqueMatches[0]!;
      const nextEmail = client.email ?? input.email ?? null;
      const nextPhone = client.phone ?? input.phone ?? null;
      const nextWhatsapp = client.whatsapp ?? input.whatsapp ?? null;
      const nextCompany = client.company ?? input.company ?? null;
      if (
        nextEmail !== client.email ||
        nextPhone !== client.phone ||
        nextWhatsapp !== client.whatsapp ||
        nextCompany !== client.company
      ) {
        await upsertClient({
          id: client.id,
          workspaceId: input.workspaceId,
          code: client.code,
          name: client.name,
          email: nextEmail,
          phone: nextPhone,
          whatsapp: nextWhatsapp,
          company: nextCompany,
          status: client.status,
          notes: client.notes,
          sourceChannel: client.sourceChannel ?? input.sourceChannel ?? null,
          externalThreadId: client.externalThreadId ?? input.externalThreadId ?? null,
          externalMessageId: client.externalMessageId ?? input.externalMessageId ?? null
        });
      }
      await audit({
        workspaceId: input.workspaceId,
        actorId: null,
        action: "lead.clientResolutionLink",
        entity: "client",
        entityId: client.id,
        metadata: { email, phone }
      });
      return client.id;
    }

    if (uniqueMatches.length > 1) {
      await audit({
        workspaceId: input.workspaceId,
        actorId: null,
        action: "lead.clientResolutionConflict",
        entity: "lead",
        entityId: input.id ?? "pending",
        metadata: {
          email,
          phone,
          clientIds: uniqueMatches.map((client) => client.id)
        }
      });
      return null;
    }

    const client = await upsertClient({
      workspaceId: input.workspaceId,
      name: leadContactClientName(input),
      email: input.email ?? null,
      phone: input.phone ?? null,
      whatsapp: input.whatsapp ?? null,
      company: input.company ?? null,
      status: "active",
      notes: "Created automatically from lead contact details.",
      sourceChannel: input.sourceChannel ?? null,
      externalThreadId: input.externalThreadId ?? null,
      externalMessageId: input.externalMessageId ?? null
    });
    await audit({
      workspaceId: input.workspaceId,
      actorId: null,
      action: "lead.clientResolutionCreate",
      entity: "client",
      entityId: client.id,
      metadata: { email, phone }
    });
    return client.id;
  }

  async function upsertLeadWithClientResolution(input: UpsertLeadInput): Promise<Lead> {
    const existing = input.id ? await repository.get("lead", input.id) : null;
    const resolvedClientId = input.clientId ?? existing?.clientId ?? (await resolveClientForLead(input));
    return upsertLead({
      ...input,
      clientId: resolvedClientId
    });
  }

  async function createLeadSummary(input: CreateLeadSummaryInput): Promise<LeadSummary> {
    const lead = await repository.get("lead", input.leadId);
    if (!lead || lead.workspaceId !== input.workspaceId) {
      throw new Error("Lead not found");
    }
    const timestamp = now();
    const record: LeadSummary = {
      id: createId("leadSummary"),
      workspaceId: input.workspaceId,
      leadId: input.leadId,
      shortSummary: compactText(input.shortSummary, leadSummaryShortMax),
      longSummary: nullable(input.longSummary ? compactMultilineText(input.longSummary, leadSummaryLongMax) : null),
      source: nullable(input.source),
      createdAt: timestamp,
      updatedAt: timestamp,
      archivedAt: null
    };
    await repository.save("leadSummary", record);
    await audit({
      workspaceId: input.workspaceId,
      actorId: null,
      action: "leadSummary.create",
      entity: "leadSummary",
      entityId: record.id,
      metadata: { leadId: record.leadId, source: record.source }
    });
    return record;
  }

  async function ingestLeadIntake(input: IngestLeadIntakeInput): Promise<LeadIntakeResult> {
    const lead = await repository.get("lead", input.leadId);
    if (!lead || lead.workspaceId !== input.workspaceId) {
      throw new Error("Lead not found");
    }

    const documents: DocumentFile[] = [];
    for (const attachment of input.attachments ?? []) {
      documents.push(
        await upsertDocumentFile({
          workspaceId: input.workspaceId,
          leadId: lead.id,
          clientId: lead.clientId,
          fileName: attachment.fileName,
          shortSummary: attachmentSummary(attachment),
          longSummary:
            attachment.longSummary ??
            `Original ${attachment.kind} from ${input.sourceChannel ?? "intake"} intake${attachment.sourceMessageId ? ` message ${attachment.sourceMessageId}` : ""}.`,
          downloadUrl: attachment.downloadUrl,
          storageProvider: attachment.storageProvider,
          storageBucket: attachment.storageBucket,
          storageKey: attachment.storageKey,
          mimeType: attachment.mimeType,
          sizeBytes: attachment.sizeBytes
        })
      );
    }
    const activeLeadDocuments = (await repository.list("documentFile", input.workspaceId))
      .filter((document) => document.leadId === lead.id && !document.archivedAt)
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
    const currentAttachmentsByStorageKey = new Map(
      (input.attachments ?? []).map((attachment) => [attachment.storageKey, attachment])
    );
    const currentAttachmentsByFileName = new Map(
      (input.attachments ?? []).map((attachment) => [attachment.fileName, attachment])
    );
    const aggregateInput: IngestLeadIntakeInput = {
      ...input,
      attachments: activeLeadDocuments.map((document) =>
        documentToAttachmentInput(
          document,
          currentAttachmentsByStorageKey.get(document.storageKey) ?? currentAttachmentsByFileName.get(document.fileName)
        )
      )
    };
    const { shortSummary, longSummary, originalTakes } = buildLeadIntakeSummary(aggregateInput);

    const updatedLead: Lead = {
      ...lead,
      sourceChannel: nullable(input.sourceChannel ?? lead.sourceChannel),
      externalThreadId: nullable(input.sourceThreadId ?? lead.externalThreadId),
      externalMessageId: nullable(input.sourceMessageId ?? lead.externalMessageId),
      notes: appendIntakeNotes(lead.notes, longSummary, originalTakes),
      updatedAt: now()
    };
    await repository.save("lead", updatedLead);
    await audit({
      workspaceId: input.workspaceId,
      actorId: null,
      action: "lead.intakeIngest",
      entity: "lead",
      entityId: lead.id,
      metadata: {
        sourceChannel: input.sourceChannel,
        sourceThreadId: input.sourceThreadId,
        sourceMessageId: input.sourceMessageId,
        textCount: input.textItems?.length ?? 0,
        attachmentCount: input.attachments?.length ?? 0
      }
    });

    const leadSummary = await createLeadSummary({
      workspaceId: input.workspaceId,
      leadId: lead.id,
      shortSummary,
      longSummary,
      source: input.sourceChannel ?? "intake"
    });

    return { lead: updatedLead, documents, leadSummary, summary: longSummary, originalTakes };
  }

  async function undoLeadIntake(input: UndoLeadIntakeInput): Promise<UndoLeadIntakeResult> {
    const lead = await repository.get("lead", input.leadId);
    if (!lead || lead.workspaceId !== input.workspaceId) {
      throw new Error("Lead not found");
    }
    const auditLogs = await repository.listAuditLogs(input.workspaceId);
    const intakeAudits = auditLogs
      .filter(
        (log) =>
          log.action === "lead.intakeIngest" &&
          log.entity === "lead" &&
          log.entityId === lead.id &&
          (!input.sourceMessageId || log.metadata.sourceMessageId === input.sourceMessageId)
      )
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
    const auditLog = intakeAudits[0] ?? null;
    const summaries = (await repository.list("leadSummary", input.workspaceId))
      .filter((summary) => summary.leadId === lead.id && !summary.archivedAt)
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
    const summariesToArchive = auditLog
      ? summaries.filter((summary) => summary.createdAt.getTime() >= auditLog.createdAt.getTime()).slice(0, 1)
      : summaries.slice(0, 1);
    const documents = (await repository.list("documentFile", input.workspaceId))
      .filter((document) => document.leadId === lead.id && !document.archivedAt)
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
    const previousAudit = auditLog
      ? auditLogs
          .filter(
            (log) =>
              log.action === "lead.intakeIngest" &&
              log.entity === "lead" &&
              log.entityId === lead.id &&
              log.createdAt.getTime() < auditLog.createdAt.getTime()
          )
          .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0] ?? null
      : null;
    const documentsToArchive = auditLog
      ? documents.filter((document) => {
          const createdAt = document.createdAt.getTime();
          return createdAt <= auditLog.createdAt.getTime() && (!previousAudit || createdAt > previousAudit.createdAt.getTime());
        })
      : [];
    const updateAudit = auditLog
      ? auditLogs
          .filter(
            (log) =>
              log.action === "lead.upsert" &&
              log.entity === "lead" &&
              log.entityId === lead.id &&
              (!input.sourceMessageId || log.metadata.sourceMessageId === input.sourceMessageId) &&
              log.createdAt.getTime() <= auditLog.createdAt.getTime()
          )
          .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0] ?? null
      : null;
    const fieldSnapshot = validLeadFieldSnapshot(updateAudit?.metadata.fieldSnapshot);

    for (const summary of summariesToArchive) {
      await archiveRecord({ workspaceId: input.workspaceId, entity: "leadSummary", id: summary.id });
    }
    for (const document of documentsToArchive) {
      await archiveRecord({ workspaceId: input.workspaceId, entity: "documentFile", id: document.id });
    }

    const notesWithoutIntake = removeLatestIntakeNotesBlock(lead.notes);
    const restoredLead = restoreLeadSnapshot(lead, fieldSnapshot);
    const updatedLead: Lead = {
      ...restoredLead,
      notes: removeTelegramUpdateNotesBlock(notesWithoutIntake, input.sourceMessageId),
      updatedAt: now()
    };
    await repository.save("lead", updatedLead);
    await audit({
      workspaceId: input.workspaceId,
      actorId: null,
      action: "lead.intakeUndo",
      entity: "lead",
      entityId: lead.id,
      metadata: {
        sourceMessageId: input.sourceMessageId ?? null,
        archivedDocumentIds: documentsToArchive.map((document) => document.id),
        archivedSummaryIds: summariesToArchive.map((summary) => summary.id),
        restoredFields: fieldSnapshot ? Object.keys(fieldSnapshot.before) : []
      }
    });

    return {
      lead: updatedLead,
      archivedDocumentIds: documentsToArchive.map((document) => document.id),
      archivedSummaryIds: summariesToArchive.map((summary) => summary.id)
    };
  }

  async function linkLeadToClient(input: LinkLeadToClientInput): Promise<Lead> {
    const lead = await repository.get("lead", input.leadId);
    const client = await repository.get("client", input.clientId);
    if (!lead || lead.workspaceId !== input.workspaceId) {
      throw new Error("Lead not found");
    }
    if (!client || client.workspaceId !== input.workspaceId) {
      throw new Error("Client not found");
    }
    const linked: Lead = { ...lead, clientId: client.id, updatedAt: now() };
    await repository.save("lead", linked);
    await audit({
      workspaceId: input.workspaceId,
      actorId: null,
      action: "lead.linkClient",
      entity: "lead",
      entityId: lead.id,
      metadata: { clientId: client.id }
    });
    return linked;
  }

  async function archiveRecord<K extends ArchiveRecordInput["entity"]>(
    input: ArchiveRecordInput & { entity: K }
  ): Promise<EntityMap[K]> {
    const record = await repository.get(input.entity, input.id);
    if (!record || record.workspaceId !== input.workspaceId) {
      throw new Error("Record not found");
    }
    const archived = {
      ...record,
      ...("status" in record ? { status: "archived" } : {}),
      archivedAt: now(),
      updatedAt: now()
    } as EntityMap[K];
    await repository.save(input.entity, archived);
    await audit({
      workspaceId: input.workspaceId,
      actorId: null,
      action: `${input.entity}.archive`,
      entity: input.entity,
      entityId: input.id,
      metadata: {}
    });
    return archived;
  }

  async function listRecords<K extends CrmCollection>(input: ListRecordsInput & { entity: K }): Promise<EntityMap[K][]> {
    const records = await repository.list(input.entity, input.workspaceId);
    if (input.includeArchived) {
      return records;
    }
    return records.filter((record) => !("archivedAt" in record) || record.archivedAt === null);
  }

  return {
    listRecords,
    upsertClient,
    upsertLead,
    upsertLeadWithClientResolution,
    upsertColdTarget,
    createOutreachTouch,
    upsertReminder,
    upsertCalendarEvent,
    upsertDocumentFile,
    createLeadSummary,
    ingestLeadIntake,
    undoLeadIntake,
    linkLeadToClient,
    archiveRecord,
    globalSearch: (input: { workspaceId: string; query: string }) => globalSearch(repository, input)
  };
}
