import { describe, expect, it } from "vitest";
import { createCrmBackupModel } from "./backup";
import type { CalendarEvent, Client, DocumentFile, Lead, Reminder } from "./types";

const baseDate = new Date("2026-06-13T10:00:00.000Z");

function baseRecord(id: string) {
  return {
    id,
    workspaceId: "workspace-1",
    createdAt: baseDate,
    updatedAt: baseDate,
    archivedAt: null
  };
}

describe("createCrmBackupModel", () => {
  it("creates Russian calendar, client, and lead sheets with linked rows", () => {
    const client: Client = {
      ...baseRecord("client-1"),
      code: "C-2026-001",
      name: "Thomas Watcher",
      email: "thomas@example.com",
      phone: null,
      whatsapp: "+491234",
      company: "Watcher GmbH",
      status: "active",
      notes: null,
      sourceChannel: "telegram",
      externalThreadId: null,
      externalMessageId: null
    };
    const lead: Lead = {
      ...baseRecord("lead-1"),
      code: "L-2026-009",
      clientId: client.id,
      name: "House planning",
      email: null,
      phone: null,
      whatsapp: null,
      company: "Private house",
      status: "qualified",
      sourceChannel: "whatsapp",
      externalThreadId: null,
      externalMessageId: null,
      notes: "Project: EFH\n\nArea: 120 m2\n\nAddress: Berlin\n\nTodo: Prepare offer"
    };
    const reminder: Reminder = {
      ...baseRecord("reminder-1"),
      clientId: client.id,
      leadId: lead.id,
      coldTargetId: null,
      title: "Call Thomas",
      description: "Confirm details",
      dueAt: new Date("2026-06-15T12:00:00.000Z"),
      status: "open",
      sourceChannel: "telegram"
    };
    const event: CalendarEvent = {
      ...baseRecord("event-1"),
      clientId: client.id,
      leadId: lead.id,
      coldTargetId: null,
      reminderId: null,
      title: "Site visit",
      description: "Bring plans",
      startsAt: new Date("2026-06-16T14:00:00.000Z"),
      endsAt: new Date("2026-06-16T15:00:00.000Z"),
      location: "Berlin",
      externalProvider: "crm",
      externalEventId: null,
      syncStatus: "pending",
      lastSyncedAt: null
    };
    const document: DocumentFile = {
      ...baseRecord("document-1"),
      clientId: client.id,
      leadId: lead.id,
      fileName: "plans.pdf",
      shortSummary: "Plan summary",
      longSummary: null,
      downloadUrl: null,
      storageProvider: "local",
      storageBucket: null,
      storageKey: "plans.pdf",
      mimeType: "application/pdf",
      sizeBytes: 42
    };

    const model = createCrmBackupModel({
      appBaseUrl: "https://crm.test",
      clients: [client],
      leads: [lead],
      reminders: [reminder],
      calendarEvents: [event],
      documentFiles: [document]
    });

    expect(model.sheets.map((sheet) => sheet.name)).toEqual(["Календарь", "Клиенты", "Лиды"]);
    expect(model.sheets[0]?.rows).toHaveLength(2);
    expect(model.sheets[0]?.rows[0]).toMatchObject({
      "Тип": "reminder",
      "Название": "Call Thomas",
      "Лид": "L-2026-009 House planning",
      "Клиент": "C-2026-001 Thomas Watcher",
      "CRM": "https://crm.test/leads?leadId=L-2026-009"
    });
    expect(model.sheets[1]?.rows[0]).toMatchObject({
      "Код": "C-2026-001",
      "Лидов": 1,
      "Ближайшее событие": new Date("2026-06-15T12:00:00.000Z")
    });
    expect(model.sheets[2]?.rows[0]).toMatchObject({
      "Код": "L-2026-009",
      "Клиент": "C-2026-001 Thomas Watcher",
      "Проект": "EFH",
      "Документов": 1,
      "Ближайшее событие": new Date("2026-06-15T12:00:00.000Z")
    });
  });
});
