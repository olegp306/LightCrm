import type { CrmCollection, CrmRepository, CrmRepositorySnapshot } from "./repository";
import type { AuditLog, EntityMap } from "./types";

const collectionKeys: Record<CrmCollection, keyof CrmRepositorySnapshot> = {
  client: "clients",
  lead: "leads",
  coldTarget: "coldTargets",
  outreachTouch: "outreachTouches",
  reminder: "reminders",
  calendarEvent: "calendarEvents",
  documentFile: "documentFiles",
  leadSummary: "leadSummaries"
};

export class MemoryCrmRepository implements CrmRepository {
  private state: CrmRepositorySnapshot = {
    clients: [],
    leads: [],
    coldTargets: [],
    outreachTouches: [],
    reminders: [],
    calendarEvents: [],
    documentFiles: [],
    leadSummaries: [],
    auditLogs: []
  };

  constructor(seed?: Partial<CrmRepositorySnapshot>) {
    this.state = { ...this.state, ...seed };
  }

  async get<K extends CrmCollection>(entity: K, id: string): Promise<EntityMap[K] | null> {
    const records = this.state[collectionKeys[entity]] as EntityMap[K][];
    return records.find((record) => record.id === id) ?? null;
  }

  async list<K extends CrmCollection>(entity: K, workspaceId: string): Promise<EntityMap[K][]> {
    const records = this.state[collectionKeys[entity]] as EntityMap[K][];
    return records.filter((record) => record.workspaceId === workspaceId);
  }

  async save<K extends CrmCollection>(entity: K, record: EntityMap[K]): Promise<EntityMap[K]> {
    const key = collectionKeys[entity];
    const records = this.state[key] as EntityMap[K][];
    const existingIndex = records.findIndex((item) => item.id === record.id);
    if (existingIndex >= 0) {
      records[existingIndex] = record;
    } else {
      records.push(record);
    }
    return record;
  }

  async appendAuditLog(log: AuditLog): Promise<AuditLog> {
    this.state.auditLogs.push(log);
    return log;
  }

  async listAuditLogs(workspaceId: string): Promise<AuditLog[]> {
    return this.state.auditLogs.filter((log) => log.workspaceId === workspaceId);
  }

  snapshot(): CrmRepositorySnapshot {
    return structuredClone(this.state);
  }
}
