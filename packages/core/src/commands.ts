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
  entity: Exclude<CrmCollection, "outreachTouch" | "calendarEvent">;
  id: string;
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

function trimText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function compactText(value: string, maxLength = 240): string {
  const compacted = value.replace(/\s+/g, " ").trim();
  if (compacted.length <= maxLength) {
    return compacted;
  }
  return `${compacted.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
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

function buildLeadIntakeSummary(input: IngestLeadIntakeInput): { summary: string; originalTakes: string[] } {
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

  const textSummary = textItems
    .map((item) => item.text.trim())
    .filter(Boolean)
    .join(" ");
  const attachmentCount = attachments.length;
  const attachmentKinds = [...new Set(attachments.map((attachment) => attachment.kind))];
  const attachmentDetails = attachments
    .map((attachment) => `${attachment.fileName} (${attachment.kind}; ${attachmentSummary(attachment)})`)
    .join("; ");
  const parts = [
    `Source: ${input.sourceChannel ?? "intake"}${input.sourceThreadId ? ` thread ${input.sourceThreadId}` : ""}.`,
    textSummary ? `Text: ${compactText(textSummary)}.` : "Text: no text notes yet.",
    attachmentCount > 0
      ? `Files: ${attachmentCount} attachment(s)${attachmentKinds.length > 0 ? ` [${attachmentKinds.join(", ")}]` : ""}: ${attachmentDetails}.`
      : "Files: no attachments."
  ];

  return {
    summary: parts.join(" "),
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
      metadata: { name: record.name, clientId: record.clientId }
    });
    return record;
  }

  async function upsertColdTarget(input: UpsertColdTargetInput): Promise<ColdTarget> {
    const existing = input.id ? await repository.get("coldTarget", input.id) : null;
    const timestamp = now();
    const record: ColdTarget = {
      id: existing?.id ?? input.id ?? createId("coldTarget"),
      workspaceId: input.workspaceId,
      name: input.name,
      company: nullable(input.company ?? existing?.company),
      role: nullable(input.role ?? existing?.role),
      email: nullable(input.email ?? existing?.email),
      phone: nullable(input.phone ?? existing?.phone),
      linkedinUrl: nullable(input.linkedinUrl ?? existing?.linkedinUrl),
      website: nullable(input.website ?? existing?.website),
      status: input.status ?? existing?.status ?? "new",
      source: nullable(input.source ?? existing?.source),
      notes: nullable(input.notes ?? existing?.notes),
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
      shortSummary: compactText(input.shortSummary, 220),
      longSummary: nullable(input.longSummary),
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

    const { summary, originalTakes } = buildLeadIntakeSummary(input);
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

    const updatedLead: Lead = {
      ...lead,
      sourceChannel: nullable(input.sourceChannel ?? lead.sourceChannel),
      externalThreadId: nullable(input.sourceThreadId ?? lead.externalThreadId),
      externalMessageId: nullable(input.sourceMessageId ?? lead.externalMessageId),
      notes: appendIntakeNotes(lead.notes, summary, originalTakes),
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
      shortSummary: summary,
      longSummary: summary,
      source: input.sourceChannel ?? "intake"
    });

    return { lead: updatedLead, documents, leadSummary, summary, originalTakes };
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
    upsertColdTarget,
    createOutreachTouch,
    upsertReminder,
    upsertCalendarEvent,
    upsertDocumentFile,
    createLeadSummary,
    ingestLeadIntake,
    linkLeadToClient,
    archiveRecord,
    globalSearch: (input: { workspaceId: string; query: string }) => globalSearch(repository, input)
  };
}
