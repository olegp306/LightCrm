import type { CrmCollection, CrmRepository } from "./repository";
import { globalSearch } from "./search";
import type {
  AuditLog,
  CalendarEvent,
  Client,
  ColdTarget,
  CreateOutreachTouchInput,
  DocumentFile,
  EntityMap,
  Lead,
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
  auditLog: "audit"
};

function createId(entity: CrmCollection | "auditLog"): string {
  return `${idPrefixes[entity]}_${crypto.randomUUID()}`;
}

function now(): Date {
  return new Date();
}

function nullable(value: string | null | undefined): string | null {
  return value ?? null;
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
    linkLeadToClient,
    archiveRecord,
    globalSearch: (input: { workspaceId: string; query: string }) => globalSearch(repository, input)
  };
}
