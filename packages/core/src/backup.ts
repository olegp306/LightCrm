import type { CalendarEvent, Client, DocumentFile, Lead, Reminder } from "./types";

export type CrmBackupCellValue = string | number | Date | null;

export type CrmBackupRow = Record<string, CrmBackupCellValue>;

export type CrmBackupSheet = {
  name: "Календарь" | "Клиенты" | "Лиды";
  headers: string[];
  rows: CrmBackupRow[];
};

export type CrmBackupModel = {
  sheets: CrmBackupSheet[];
};

export type CreateCrmBackupModelInput = {
  appBaseUrl: string;
  clients: Client[];
  leads: Lead[];
  reminders: Reminder[];
  calendarEvents: CalendarEvent[];
  documentFiles: DocumentFile[];
};

type CalendarItem = {
  type: "reminder" | "event";
  id: string;
  title: string;
  description: string | null;
  startsAt: Date;
  endsAt: Date | null;
  status: string | null;
  source: string | null;
  location: string | null;
  clientId: string | null;
  leadId: string | null;
  crmUrl: string | null;
};

const calendarHeaders = ["Дата", "Окончание", "Сегодня", "Тип", "Название", "Статус", "Лид", "Клиент", "Локация", "Описание", "Источник", "CRM"];
const clientHeaders = [
  "Код",
  "Имя",
  "Компания",
  "Статус",
  "Email",
  "Телефон",
  "WhatsApp",
  "Источник",
  "Лидов",
  "Ближайшее событие",
  "Заметки",
  "Создан",
  "Обновлен",
  "CRM"
];
const leadHeaders = [
  "Код",
  "Название",
  "Клиент",
  "Статус",
  "Проект",
  "Адрес",
  "Area",
  "Бюджет EUR",
  "Todo",
  "Email",
  "Телефон",
  "WhatsApp",
  "Источник",
  "Документов",
  "Ближайшее событие",
  "Заметки",
  "Создан",
  "Обновлен",
  "CRM"
];

function compact(value: string | null | undefined): string | null {
  const normalized = value?.replace(/\s+/g, " ").trim();
  return normalized || null;
}

function sourceLabel(value: string | null): string | null {
  return value?.toLocaleLowerCase() === "telegram" ? "TG" : value;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function readNoteField(notes: string | null, label: string): string | null {
  if (!notes) {
    return null;
  }
  const escaped = escapeRegex(label);
  const match = notes.match(new RegExp(`(?:^|\\n+)${escaped}: ([\\s\\S]*?)(?=\\n+(?:[A-Z][A-Za-z0-9 ]+: |Updated from )|$)`));
  return compact(match?.[1]);
}

function labelWithCode(record: Pick<Client | Lead, "code" | "name"> | null | undefined): string | null {
  if (!record) {
    return null;
  }
  return [record.code, record.name].filter(Boolean).join(" ");
}

function appUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}${path}`;
}

function leadUrl(baseUrl: string, lead: Lead): string {
  return appUrl(baseUrl, `/leads?leadId=${encodeURIComponent(lead.code ?? lead.id)}`);
}

function clientUrl(baseUrl: string, client: Client): string {
  return appUrl(baseUrl, `/clients?record=${encodeURIComponent(client.id)}`);
}

function relatedUrl(baseUrl: string, item: Pick<CalendarItem, "leadId" | "clientId">, leadsById: Map<string, Lead>, clientsById: Map<string, Client>) {
  const lead = item.leadId ? leadsById.get(item.leadId) ?? null : null;
  if (lead) {
    return leadUrl(baseUrl, lead);
  }
  const client = item.clientId ? clientsById.get(item.clientId) ?? null : null;
  return client ? clientUrl(baseUrl, client) : null;
}

function buildCalendarItems(input: CreateCrmBackupModelInput, leadsById: Map<string, Lead>, clientsById: Map<string, Client>): CalendarItem[] {
  return [
    ...input.reminders
      .filter((reminder) => !reminder.archivedAt && reminder.status !== "archived")
      .map((reminder): CalendarItem => ({
        type: "reminder",
        id: reminder.id,
        title: reminder.title,
        description: reminder.description,
        startsAt: reminder.dueAt,
        endsAt: null,
        status: reminder.status,
        source: sourceLabel(reminder.sourceChannel),
        location: null,
        clientId: reminder.clientId,
        leadId: reminder.leadId,
        crmUrl: relatedUrl(input.appBaseUrl, reminder, leadsById, clientsById)
      })),
    ...input.calendarEvents
      .filter((event) => !event.archivedAt)
      .map((event): CalendarItem => ({
        type: "event",
        id: event.id,
        title: event.title,
        description: event.description,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        status: event.syncStatus,
        source: sourceLabel(event.externalProvider ?? "crm"),
        location: event.location,
        clientId: event.clientId,
        leadId: event.leadId,
        crmUrl: relatedUrl(input.appBaseUrl, event, leadsById, clientsById)
      }))
  ].sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime());
}

function nextCalendarDate(items: CalendarItem[], predicate: (item: CalendarItem) => boolean): Date | null {
  return items.find(predicate)?.startsAt ?? null;
}

function countBy<TItem>(items: TItem[], keyOf: (item: TItem) => string | null): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = keyOf(item);
    if (!key) {
      continue;
    }
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

export function createCrmBackupModel(input: CreateCrmBackupModelInput): CrmBackupModel {
  const clients = input.clients.filter((client) => !client.archivedAt);
  const leads = input.leads.filter((lead) => !lead.archivedAt);
  const clientsById = new Map(clients.map((client) => [client.id, client]));
  const leadsById = new Map(leads.map((lead) => [lead.id, lead]));
  const calendarItems = buildCalendarItems(input, leadsById, clientsById);
  const leadsByClientId = countBy(leads, (lead) => lead.clientId);
  const documentsByLeadId = countBy(
    input.documentFiles.filter((document) => !document.archivedAt),
    (document) => document.leadId
  );

  const calendarRows: CrmBackupRow[] = calendarItems.map((item) => {
    const lead = item.leadId ? leadsById.get(item.leadId) ?? null : null;
    const client = item.clientId ? clientsById.get(item.clientId) ?? (lead?.clientId ? clientsById.get(lead.clientId) ?? null : null) : null;
    return {
      "Дата": item.startsAt,
      "Окончание": item.endsAt,
      "Сегодня": "=INT([@Дата])=TODAY()",
      "Тип": item.type,
      "Название": item.title,
      "Статус": item.status,
      "Лид": labelWithCode(lead),
      "Клиент": labelWithCode(client),
      "Локация": item.location,
      "Описание": compact(item.description),
      "Источник": item.source,
      "CRM": item.crmUrl
    };
  });

  const clientRows: CrmBackupRow[] = clients.map((client) => ({
    "Код": client.code,
    "Имя": client.name,
    "Компания": client.company,
    "Статус": client.status,
    "Email": client.email,
    "Телефон": client.phone,
    "WhatsApp": client.whatsapp,
    "Источник": sourceLabel(client.sourceChannel),
    "Лидов": leadsByClientId.get(client.id) ?? 0,
    "Ближайшее событие": nextCalendarDate(calendarItems, (item) => item.clientId === client.id || Boolean(item.leadId && leadsById.get(item.leadId)?.clientId === client.id)),
    "Заметки": compact(client.notes),
    "Создан": client.createdAt,
    "Обновлен": client.updatedAt,
    "CRM": clientUrl(input.appBaseUrl, client)
  }));

  const leadRows: CrmBackupRow[] = leads.map((lead) => {
    const client = lead.clientId ? clientsById.get(lead.clientId) ?? null : null;
    return {
      "Код": lead.code,
      "Название": lead.name,
      "Клиент": labelWithCode(client),
      "Статус": lead.status,
      "Проект": readNoteField(lead.notes, "Project") ?? lead.company,
      "Адрес": readNoteField(lead.notes, "Address"),
      "Area": readNoteField(lead.notes, "Area"),
      "Бюджет EUR": readNoteField(lead.notes, "Budget EUR"),
      "Todo": readNoteField(lead.notes, "Todo"),
      "Email": lead.email,
      "Телефон": lead.phone,
      "WhatsApp": lead.whatsapp ?? client?.whatsapp ?? null,
      "Источник": sourceLabel(lead.sourceChannel),
      "Документов": documentsByLeadId.get(lead.id) ?? 0,
      "Ближайшее событие": nextCalendarDate(calendarItems, (item) => item.leadId === lead.id),
      "Заметки": compact(lead.notes),
      "Создан": lead.createdAt,
      "Обновлен": lead.updatedAt,
      "CRM": leadUrl(input.appBaseUrl, lead)
    };
  });

  return {
    sheets: [
      { name: "Календарь", headers: calendarHeaders, rows: calendarRows },
      { name: "Клиенты", headers: clientHeaders, rows: clientRows },
      { name: "Лиды", headers: leadHeaders, rows: leadRows }
    ]
  };
}
