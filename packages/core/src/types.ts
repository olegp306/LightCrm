export type CrmEntity =
  | "client"
  | "lead"
  | "coldTarget"
  | "outreachTouch"
  | "reminder"
  | "calendarEvent"
  | "documentFile"
  | "tablePreference"
  | "auditLog";

export type ClientStatus = "active" | "warm" | "paused" | "archived";
export type LeadStatus = "new" | "contacted" | "qualified" | "lost" | "converted" | "archived";
export type ColdTargetStatus = "new" | "queued" | "contacted" | "replied" | "notFit" | "archived";
export type ReminderStatus = "open" | "done" | "snoozed" | "archived";
export type OutreachDirection = "inbound" | "outbound";

export type BaseRecord = {
  id: string;
  workspaceId: string;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
};

export type Client = BaseRecord & {
  name: string;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  company: string | null;
  status: ClientStatus;
  notes: string | null;
  sourceChannel: string | null;
  externalThreadId: string | null;
  externalMessageId: string | null;
};

export type Lead = BaseRecord & {
  clientId: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  company: string | null;
  status: LeadStatus;
  sourceChannel: string | null;
  externalThreadId: string | null;
  externalMessageId: string | null;
  notes: string | null;
};

export type ColdTarget = BaseRecord & {
  name: string;
  company: string | null;
  role: string | null;
  email: string | null;
  phone: string | null;
  linkedinUrl: string | null;
  website: string | null;
  status: ColdTargetStatus;
  source: string | null;
  notes: string | null;
};

export type OutreachTouch = {
  id: string;
  workspaceId: string;
  coldTargetId: string | null;
  leadId: string | null;
  clientId: string | null;
  channel: string;
  direction: OutreachDirection;
  subject: string | null;
  body: string | null;
  occurredAt: Date;
  outcome: string | null;
  createdAt: Date;
};

export type Reminder = BaseRecord & {
  clientId: string | null;
  leadId: string | null;
  coldTargetId: string | null;
  title: string;
  description: string | null;
  dueAt: Date;
  status: ReminderStatus;
  sourceChannel: string | null;
};

export type CalendarEvent = BaseRecord & {
  clientId: string | null;
  leadId: string | null;
  coldTargetId: string | null;
  reminderId: string | null;
  title: string;
  description: string | null;
  startsAt: Date;
  endsAt: Date;
  location: string | null;
  externalProvider: string | null;
  externalEventId: string | null;
  syncStatus: string | null;
  lastSyncedAt: Date | null;
};

export type DocumentFile = BaseRecord & {
  clientId: string | null;
  leadId: string | null;
  fileName: string;
  shortSummary: string;
  longSummary: string | null;
  downloadUrl: string | null;
  storageProvider: string;
  storageBucket: string | null;
  storageKey: string;
  mimeType: string | null;
  sizeBytes: number | null;
};

export type TablePreference = {
  id: string;
  workspaceId: string;
  userId: string;
  tableKey: string;
  hiddenColumns: string[];
  columnWidths: Record<string, number>;
  filters: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};

export type AuditLog = {
  id: string;
  workspaceId: string;
  actorId: string | null;
  action: string;
  entity: CrmEntity;
  entityId: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
};

export type EntityMap = {
  client: Client;
  lead: Lead;
  coldTarget: ColdTarget;
  outreachTouch: OutreachTouch;
  reminder: Reminder;
  calendarEvent: CalendarEvent;
  documentFile: DocumentFile;
  tablePreference: TablePreference;
  auditLog: AuditLog;
};

export type UpsertClientInput = {
  id?: string;
  workspaceId: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  company?: string | null;
  status?: ClientStatus;
  notes?: string | null;
  sourceChannel?: string | null;
  externalThreadId?: string | null;
  externalMessageId?: string | null;
};

export type UpsertLeadInput = {
  id?: string;
  workspaceId: string;
  clientId?: string | null;
  name: string;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  company?: string | null;
  status?: LeadStatus;
  sourceChannel?: string | null;
  externalThreadId?: string | null;
  externalMessageId?: string | null;
  notes?: string | null;
};

export type UpsertColdTargetInput = {
  id?: string;
  workspaceId: string;
  name: string;
  company?: string | null;
  role?: string | null;
  email?: string | null;
  phone?: string | null;
  linkedinUrl?: string | null;
  website?: string | null;
  status?: ColdTargetStatus;
  source?: string | null;
  notes?: string | null;
};

export type UpsertReminderInput = {
  id?: string;
  workspaceId: string;
  clientId?: string | null;
  leadId?: string | null;
  coldTargetId?: string | null;
  title: string;
  description?: string | null;
  dueAt: Date;
  status?: ReminderStatus;
  sourceChannel?: string | null;
};

export type UpsertCalendarEventInput = {
  id?: string;
  workspaceId: string;
  clientId?: string | null;
  leadId?: string | null;
  coldTargetId?: string | null;
  reminderId?: string | null;
  title: string;
  description?: string | null;
  startsAt: Date;
  endsAt: Date;
  location?: string | null;
  externalProvider?: string | null;
  externalEventId?: string | null;
  syncStatus?: string | null;
  lastSyncedAt?: Date | null;
};

export type UpsertDocumentFileInput = {
  id?: string;
  workspaceId: string;
  clientId?: string | null;
  leadId?: string | null;
  fileName: string;
  shortSummary: string;
  longSummary?: string | null;
  downloadUrl?: string | null;
  storageProvider?: string;
  storageBucket?: string | null;
  storageKey: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
};

export type LeadIntakeTextItem = {
  sourceMessageId?: string | null;
  author?: string | null;
  text: string;
};

export type LeadIntakeAttachmentKind = "image" | "pdf" | "audio" | "voice" | "document" | "other";

export type LeadIntakeAttachmentInput = {
  sourceMessageId?: string | null;
  kind: LeadIntakeAttachmentKind;
  fileName: string;
  storageProvider?: string;
  storageBucket?: string | null;
  storageKey: string;
  downloadUrl?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  summary?: string | null;
  longSummary?: string | null;
};

export type IngestLeadIntakeInput = {
  workspaceId: string;
  leadId: string;
  sourceChannel?: string | null;
  sourceThreadId?: string | null;
  sourceMessageId?: string | null;
  textItems?: LeadIntakeTextItem[];
  attachments?: LeadIntakeAttachmentInput[];
};

export type LeadIntakeResult = {
  lead: Lead;
  documents: DocumentFile[];
  summary: string;
  originalTakes: string[];
};

export type CreateOutreachTouchInput = {
  workspaceId: string;
  coldTargetId?: string | null;
  leadId?: string | null;
  clientId?: string | null;
  channel: string;
  direction: OutreachDirection;
  subject?: string | null;
  body?: string | null;
  occurredAt: Date;
  outcome?: string | null;
};

export type GlobalSearchResult = {
  entity: Exclude<CrmEntity, "tablePreference" | "auditLog">;
  id: string;
  title: string;
  subtitle: string | null;
};
