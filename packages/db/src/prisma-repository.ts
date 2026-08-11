import { Prisma, type PrismaClient } from "@prisma/client";
import type {
  AuditLog,
  CalendarEvent,
  Client,
  ColdTarget,
  DocumentFile,
  CrmCollection,
  CrmRepository,
  EntityMap,
  Lead,
  LeadSummary,
  OutreachTouch,
  Reminder
} from "@lightcrm/core";

type PrismaJson = Record<string, unknown>;

function ensureStatus<T extends string>(value: string, fallback: T): T {
  return (value || fallback) as T;
}

function ensureOutreachLanguage(value: string | null | undefined): Lead["preferredLanguage"] {
  return value === "de" || value === "ru" || value === "en" ? value : null;
}

function ensureLeadProgressStage(value: number | null | undefined): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 7 ? value : 0;
}

function mapClient(record: Awaited<ReturnType<PrismaClient["client"]["findFirst"]>>): Client {
  if (!record) {
    throw new Error("Client not found");
  }
  return {
    ...record,
    status: ensureStatus(record.status, "active")
  };
}

function mapLead(record: Awaited<ReturnType<PrismaClient["lead"]["findFirst"]>>): Lead {
  if (!record) {
    throw new Error("Lead not found");
  }
  return {
    ...record,
    status: ensureStatus(record.status, "new"),
    progressStage: ensureLeadProgressStage(record.progressStage),
    preferredLanguage: ensureOutreachLanguage(record.preferredLanguage),
    olegCommissionEnabled: record.olegCommissionEnabled
  };
}

function mapColdTarget(record: Awaited<ReturnType<PrismaClient["coldTarget"]["findFirst"]>>): ColdTarget {
  if (!record) {
    throw new Error("Cold target not found");
  }
  return {
    ...record,
    status: ensureStatus(record.status, "new"),
    preferredLanguage: ensureOutreachLanguage(record.preferredLanguage),
    firstTouchChannel:
      record.firstTouchChannel === "email" || record.firstTouchChannel === "linkedin" || record.firstTouchChannel === "phone"
        ? record.firstTouchChannel
        : null,
    ballSide: record.ballSide === "us" || record.ballSide === "client" ? record.ballSide : null
  };
}

function mapOutreachTouch(record: Awaited<ReturnType<PrismaClient["outreachTouch"]["findFirst"]>>): OutreachTouch {
  if (!record) {
    throw new Error("Outreach touch not found");
  }
  return {
    ...record,
    direction: ensureStatus(record.direction, "outbound")
  };
}

function mapReminder(record: Awaited<ReturnType<PrismaClient["reminder"]["findFirst"]>>): Reminder {
  if (!record) {
    throw new Error("Reminder not found");
  }
  return {
    ...record,
    status: ensureStatus(record.status, "open")
  };
}

function mapCalendarEvent(record: Awaited<ReturnType<PrismaClient["calendarEvent"]["findFirst"]>>): CalendarEvent {
  if (!record) {
    throw new Error("Calendar event not found");
  }
  return record;
}

function mapDocumentFile(record: Awaited<ReturnType<PrismaClient["documentFile"]["findFirst"]>>): DocumentFile {
  if (!record) {
    throw new Error("Document file not found");
  }
  return record;
}

function mapLeadSummary(record: Awaited<ReturnType<PrismaClient["leadSummary"]["findFirst"]>>): LeadSummary {
  if (!record) {
    throw new Error("Lead summary not found");
  }
  return record;
}

function mapAuditLog(record: Awaited<ReturnType<PrismaClient["auditLog"]["findFirst"]>>): AuditLog {
  if (!record) {
    throw new Error("Audit log not found");
  }
  return {
    ...record,
    entity: record.entity as AuditLog["entity"],
    metadata: record.metadata as PrismaJson
  };
}

export class PrismaCrmRepository implements CrmRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private async ensureWorkspace(workspaceId: string) {
    await this.prisma.workspace.upsert({
      where: { id: workspaceId },
      create: { id: workspaceId, name: "Default workspace" },
      update: {}
    });
  }

  async get<K extends CrmCollection>(entity: K, id: string): Promise<EntityMap[K] | null> {
    switch (entity) {
      case "client": {
        const record = await this.prisma.client.findFirst({ where: { id } });
        return record ? (mapClient(record) as EntityMap[K]) : null;
      }
      case "lead": {
        const record = await this.prisma.lead.findFirst({ where: { id } });
        return record ? (mapLead(record) as EntityMap[K]) : null;
      }
      case "coldTarget": {
        const record = await this.prisma.coldTarget.findFirst({ where: { id } });
        return record ? (mapColdTarget(record) as EntityMap[K]) : null;
      }
      case "outreachTouch": {
        const record = await this.prisma.outreachTouch.findFirst({ where: { id } });
        return record ? (mapOutreachTouch(record) as EntityMap[K]) : null;
      }
      case "reminder": {
        const record = await this.prisma.reminder.findFirst({ where: { id } });
        return record ? (mapReminder(record) as EntityMap[K]) : null;
      }
      case "calendarEvent": {
        const record = await this.prisma.calendarEvent.findFirst({ where: { id } });
        return record ? (mapCalendarEvent(record) as EntityMap[K]) : null;
      }
      case "documentFile": {
        const record = await this.prisma.documentFile.findFirst({ where: { id } });
        return record ? (mapDocumentFile(record) as EntityMap[K]) : null;
      }
      case "leadSummary": {
        const record = await this.prisma.leadSummary.findFirst({ where: { id } });
        return record ? (mapLeadSummary(record) as EntityMap[K]) : null;
      }
    }
  }

  async list<K extends CrmCollection>(entity: K, workspaceId: string): Promise<EntityMap[K][]> {
    switch (entity) {
      case "client":
        return (await this.prisma.client.findMany({ where: { workspaceId }, orderBy: { updatedAt: "desc" } })).map(
          mapClient
        ) as EntityMap[K][];
      case "lead":
        return (await this.prisma.lead.findMany({ where: { workspaceId }, orderBy: { updatedAt: "desc" } })).map(
          mapLead
        ) as EntityMap[K][];
      case "coldTarget":
        return (
          await this.prisma.coldTarget.findMany({ where: { workspaceId }, orderBy: { updatedAt: "desc" } })
        ).map(mapColdTarget) as EntityMap[K][];
      case "outreachTouch":
        return (
          await this.prisma.outreachTouch.findMany({ where: { workspaceId }, orderBy: { occurredAt: "desc" } })
        ).map(mapOutreachTouch) as EntityMap[K][];
      case "reminder":
        return (await this.prisma.reminder.findMany({ where: { workspaceId }, orderBy: { dueAt: "asc" } })).map(
          mapReminder
        ) as EntityMap[K][];
      case "calendarEvent":
        return (
          await this.prisma.calendarEvent.findMany({ where: { workspaceId }, orderBy: { startsAt: "asc" } })
        ).map(mapCalendarEvent) as EntityMap[K][];
      case "documentFile":
        return (
          await this.prisma.documentFile.findMany({ where: { workspaceId }, orderBy: { updatedAt: "desc" } })
        ).map(mapDocumentFile) as EntityMap[K][];
      case "leadSummary":
        return (
          await this.prisma.leadSummary.findMany({ where: { workspaceId }, orderBy: { createdAt: "desc" } })
        ).map(mapLeadSummary) as EntityMap[K][];
    }
  }

  async save<K extends CrmCollection>(entity: K, record: EntityMap[K]): Promise<EntityMap[K]> {
    await this.ensureWorkspace(record.workspaceId);
    switch (entity) {
      case "client":
        return mapClient(
          await this.prisma.client.upsert({
            where: { id: record.id },
            create: record as Client,
            update: record as Client
          })
        ) as EntityMap[K];
      case "lead":
        return mapLead(
          await this.prisma.lead.upsert({
            where: { id: record.id },
            create: record as Lead,
            update: record as Lead
          })
        ) as EntityMap[K];
      case "coldTarget":
        return mapColdTarget(
          await this.prisma.coldTarget.upsert({
            where: { id: record.id },
            create: record as ColdTarget,
            update: record as ColdTarget
          })
        ) as EntityMap[K];
      case "outreachTouch":
        return mapOutreachTouch(
          await this.prisma.outreachTouch.upsert({
            where: { id: record.id },
            create: record as OutreachTouch,
            update: record as OutreachTouch
          })
        ) as EntityMap[K];
      case "reminder":
        return mapReminder(
          await this.prisma.reminder.upsert({
            where: { id: record.id },
            create: record as Reminder,
            update: record as Reminder
          })
        ) as EntityMap[K];
      case "calendarEvent":
        return mapCalendarEvent(
          await this.prisma.calendarEvent.upsert({
            where: { id: record.id },
            create: record as CalendarEvent,
            update: record as CalendarEvent
          })
        ) as EntityMap[K];
      case "documentFile":
        return mapDocumentFile(
          await this.prisma.documentFile.upsert({
            where: { id: record.id },
            create: record as DocumentFile,
            update: record as DocumentFile
          })
        ) as EntityMap[K];
      case "leadSummary":
        return mapLeadSummary(
          await this.prisma.leadSummary.upsert({
            where: { id: record.id },
            create: record as LeadSummary,
            update: record as LeadSummary
          })
        ) as EntityMap[K];
    }
  }

  async appendAuditLog(log: AuditLog): Promise<AuditLog> {
    await this.ensureWorkspace(log.workspaceId);
    return mapAuditLog(
      await this.prisma.auditLog.create({
        data: {
          ...log,
          metadata: log.metadata as Prisma.InputJsonValue
        }
      })
    );
  }

  async listAuditLogs(workspaceId: string): Promise<AuditLog[]> {
    return (
      await this.prisma.auditLog.findMany({
        where: { workspaceId },
        orderBy: { createdAt: "desc" }
      })
    ).map(mapAuditLog);
  }
}

export function createPrismaCrmRepository(prisma: PrismaClient): PrismaCrmRepository {
  return new PrismaCrmRepository(prisma);
}
