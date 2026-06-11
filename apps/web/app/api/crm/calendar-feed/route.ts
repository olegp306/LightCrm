import type { CalendarEvent, Client, ColdTarget, Lead, Reminder } from "@lightcrm/core";
import { NextResponse } from "next/server";
import { defaultWorkspaceId, getCrm, handleRouteError } from "../_shared";

type CalendarFeedKind = "reminder" | "event";
type RelatedEntity = "lead" | "client" | "coldTarget" | null;

type CalendarFeedItem = {
  id: string;
  kind: CalendarFeedKind;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string | null;
  status: string | null;
  sourceChannel: string | null;
  location: string | null;
  related: {
    entity: RelatedEntity;
    id: string | null;
    label: string | null;
    href: string | null;
  };
};

function parseDateParam(value: string | null): Date | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function defaultRange() {
  const now = new Date();
  const from = new Date(now);
  from.setDate(now.getDate() - 45);
  from.setHours(0, 0, 0, 0);
  const to = new Date(now);
  to.setDate(now.getDate() + 90);
  to.setHours(23, 59, 59, 999);
  return { from, to };
}

function overlapsRange(startsAt: Date, endsAt: Date | null, from: Date, to: Date) {
  const effectiveEnd = endsAt ?? startsAt;
  return startsAt <= to && effectiveEnd >= from;
}

function entityMatches(
  record: Pick<Reminder | CalendarEvent, "leadId" | "clientId" | "coldTargetId">,
  filters: { leadId: string | null; clientId: string | null; coldTargetId: string | null }
) {
  if (filters.leadId && record.leadId !== filters.leadId) {
    return false;
  }
  if (filters.clientId && record.clientId !== filters.clientId) {
    return false;
  }
  if (filters.coldTargetId && record.coldTargetId !== filters.coldTargetId) {
    return false;
  }
  return true;
}

function relatedHref(entity: RelatedEntity, id: string | null) {
  if (!entity || !id) {
    return null;
  }
  if (entity === "client") {
    return `/clients?record=${encodeURIComponent(id)}`;
  }
  if (entity === "lead") {
    return `/leads?record=${encodeURIComponent(id)}`;
  }
  return `/cold-targets?record=${encodeURIComponent(id)}`;
}

function resolveRelated(
  record: Pick<Reminder | CalendarEvent, "leadId" | "clientId" | "coldTargetId">,
  lookup: {
    leads: Map<string, Lead>;
    clients: Map<string, Client>;
    coldTargets: Map<string, ColdTarget>;
  }
): CalendarFeedItem["related"] {
  if (record.leadId) {
    const label = lookup.leads.get(record.leadId)?.name ?? "Lead";
    return { entity: "lead", id: record.leadId, label, href: relatedHref("lead", record.leadId) };
  }
  if (record.clientId) {
    const label = lookup.clients.get(record.clientId)?.name ?? "Client";
    return { entity: "client", id: record.clientId, label, href: relatedHref("client", record.clientId) };
  }
  if (record.coldTargetId) {
    const label = lookup.coldTargets.get(record.coldTargetId)?.name ?? "Cold target";
    return { entity: "coldTarget", id: record.coldTargetId, label, href: relatedHref("coldTarget", record.coldTargetId) };
  }
  return { entity: null, id: null, label: null, href: null };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const fallbackRange = defaultRange();
    const workspaceId = url.searchParams.get("workspaceId") ?? defaultWorkspaceId;
    const from = parseDateParam(url.searchParams.get("from")) ?? fallbackRange.from;
    const to = parseDateParam(url.searchParams.get("to")) ?? fallbackRange.to;
    const filters = {
      leadId: url.searchParams.get("leadId"),
      clientId: url.searchParams.get("clientId"),
      coldTargetId: url.searchParams.get("coldTargetId")
    };
    const includeArchived = url.searchParams.get("includeArchived") === "true";
    const crm = getCrm();
    const [reminders, events, leads, clients, coldTargets] = await Promise.all([
      crm.listRecords({ entity: "reminder", workspaceId, includeArchived }),
      crm.listRecords({ entity: "calendarEvent", workspaceId, includeArchived }),
      crm.listRecords({ entity: "lead", workspaceId, includeArchived: true }),
      crm.listRecords({ entity: "client", workspaceId, includeArchived: true }),
      crm.listRecords({ entity: "coldTarget", workspaceId, includeArchived: true })
    ]);
    const lookup = {
      leads: new Map(leads.map((lead) => [lead.id, lead])),
      clients: new Map(clients.map((client) => [client.id, client])),
      coldTargets: new Map(coldTargets.map((target) => [target.id, target]))
    };
    const reminderItems: CalendarFeedItem[] = reminders
      .filter((reminder) => reminder.status !== "archived")
      .filter((reminder) => entityMatches(reminder, filters))
      .filter((reminder) => overlapsRange(reminder.dueAt, null, from, to))
      .map((reminder) => ({
        id: reminder.id,
        kind: "reminder",
        title: reminder.title,
        description: reminder.description,
        startsAt: reminder.dueAt.toISOString(),
        endsAt: null,
        status: reminder.status,
        sourceChannel: reminder.sourceChannel,
        location: null,
        related: resolveRelated(reminder, lookup)
      }));
    const visibleReminderIds = new Set(reminderItems.map((reminder) => reminder.id));
    const eventItems: CalendarFeedItem[] = events
      .filter((event) => !event.reminderId || !visibleReminderIds.has(event.reminderId))
      .filter((event) => entityMatches(event, filters))
      .filter((event) => overlapsRange(event.startsAt, event.endsAt, from, to))
      .map((event) => ({
        id: event.id,
        kind: "event",
        title: event.title,
        description: event.description,
        startsAt: event.startsAt.toISOString(),
        endsAt: event.endsAt.toISOString(),
        status: event.syncStatus,
        sourceChannel: event.externalProvider ?? "crm",
        location: event.location,
        related: resolveRelated(event, lookup)
      }));
    return NextResponse.json(
      [...reminderItems, ...eventItems].sort((left, right) => left.startsAt.localeCompare(right.startsAt))
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
