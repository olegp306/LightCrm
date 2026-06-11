import type {
  AuditLog,
  CalendarEvent,
  Client,
  ColdTarget,
  CrmEntity,
  DocumentFile,
  EntityMap,
  LeadSummary,
  Lead,
  OutreachTouch,
  Reminder
} from "./types";

export type CrmCollection = Exclude<CrmEntity, "tablePreference" | "auditLog">;

export interface CrmRepository {
  get<K extends CrmCollection>(entity: K, id: string): Promise<EntityMap[K] | null>;
  list<K extends CrmCollection>(entity: K, workspaceId: string): Promise<EntityMap[K][]>;
  save<K extends CrmCollection>(entity: K, record: EntityMap[K]): Promise<EntityMap[K]>;
  appendAuditLog(log: AuditLog): Promise<AuditLog>;
  listAuditLogs(workspaceId: string): Promise<AuditLog[]>;
}

export type CrmRepositorySnapshot = {
  clients: Client[];
  leads: Lead[];
  coldTargets: ColdTarget[];
  outreachTouches: OutreachTouch[];
  reminders: Reminder[];
  calendarEvents: CalendarEvent[];
  documentFiles: DocumentFile[];
  leadSummaries: LeadSummary[];
  auditLogs: AuditLog[];
};
