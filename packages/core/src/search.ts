import type { CrmRepository } from "./repository";
import type { GlobalSearchResult } from "./types";

type SearchInput = {
  workspaceId: string;
  query: string;
};

function includesQuery(values: Array<string | null | undefined>, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  return values.some((value) => value?.toLowerCase().includes(normalized));
}

export async function globalSearch(repository: CrmRepository, input: SearchInput): Promise<GlobalSearchResult[]> {
  const [clients, leads, coldTargets, reminders, calendarEvents, outreachTouches, documentFiles] = await Promise.all([
    repository.list("client", input.workspaceId),
    repository.list("lead", input.workspaceId),
    repository.list("coldTarget", input.workspaceId),
    repository.list("reminder", input.workspaceId),
    repository.list("calendarEvent", input.workspaceId),
    repository.list("outreachTouch", input.workspaceId),
    repository.list("documentFile", input.workspaceId)
  ]);

  const results: GlobalSearchResult[] = [];

  for (const client of clients) {
    if (includesQuery([client.name, client.company, client.email, client.phone, client.whatsapp, client.notes], input.query)) {
      results.push({ entity: "client", id: client.id, title: client.name, subtitle: client.company });
    }
  }

  for (const lead of leads) {
    if (includesQuery([lead.name, lead.company, lead.email, lead.phone, lead.whatsapp, lead.notes], input.query)) {
      results.push({ entity: "lead", id: lead.id, title: lead.name, subtitle: lead.company });
    }
  }

  for (const target of coldTargets) {
    if (includesQuery([target.name, target.company, target.role, target.email, target.website, target.notes], input.query)) {
      results.push({ entity: "coldTarget", id: target.id, title: target.name, subtitle: target.company });
    }
  }

  for (const reminder of reminders) {
    if (includesQuery([reminder.title, reminder.description], input.query)) {
      results.push({ entity: "reminder", id: reminder.id, title: reminder.title, subtitle: reminder.dueAt.toISOString() });
    }
  }

  for (const event of calendarEvents) {
    if (includesQuery([event.title, event.description, event.location], input.query)) {
      results.push({ entity: "calendarEvent", id: event.id, title: event.title, subtitle: event.startsAt.toISOString() });
    }
  }

  for (const touch of outreachTouches) {
    if (includesQuery([touch.channel, touch.subject, touch.body, touch.outcome], input.query)) {
      results.push({ entity: "outreachTouch", id: touch.id, title: touch.subject ?? touch.channel, subtitle: touch.outcome });
    }
  }

  for (const file of documentFiles) {
    if (includesQuery([file.fileName, file.shortSummary, file.longSummary, file.storageKey, file.downloadUrl], input.query)) {
      results.push({ entity: "documentFile", id: file.id, title: file.shortSummary, subtitle: file.fileName });
    }
  }

  return results;
}
