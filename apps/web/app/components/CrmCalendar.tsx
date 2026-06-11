"use client";

import type { FormEvent } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type CalendarViewMode = "month" | "week" | "day" | "agenda";
type CalendarFeedItem = {
  id: string;
  kind: "reminder" | "event";
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string | null;
  status: string | null;
  sourceChannel: string | null;
  location: string | null;
  related: {
    entity: "lead" | "client" | "coldTarget" | null;
    id: string | null;
    label: string | null;
    href: string | null;
  };
};

type CrmCalendarProps = {
  title: string;
  description: string;
  endpoint?: string;
  leadId?: string;
  clientId?: string;
  coldTargetId?: string;
};

type LeadOption = {
  id: string;
  code?: string | null;
  name?: string | null;
  projectName?: string | null;
  client?: { name?: string | null } | null;
};

const dayFormatter = new Intl.DateTimeFormat("en", { weekday: "short" });
const monthFormatter = new Intl.DateTimeFormat("en", { month: "long", year: "numeric" });
const dateFormatter = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" });
const fullDateFormatter = new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
const timeFormatter = new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit" });
const monthOptions = Array.from({ length: 12 }, (_, month) => ({
  value: month,
  label: new Intl.DateTimeFormat("en", { month: "long" }).format(new Date(2026, month, 1))
}));

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(date.getDate() + days);
  return next;
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(date.getMonth() + months);
  return next;
}

function startOfWeek(date: Date) {
  const next = startOfDay(date);
  const mondayOffset = (next.getDay() + 6) % 7;
  return addDays(next, -mondayOffset);
}

function startOfMonthGrid(date: Date) {
  return startOfWeek(new Date(date.getFullYear(), date.getMonth(), 1));
}

function sameDay(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate();
}

function dateKey(date: Date) {
  return startOfDay(date).toISOString().slice(0, 10);
}

function viewRange(mode: CalendarViewMode, anchorDate: Date) {
  if (mode === "day") {
    return { from: startOfDay(anchorDate), to: endOfDay(anchorDate) };
  }
  if (mode === "week") {
    const from = startOfWeek(anchorDate);
    return { from, to: endOfDay(addDays(from, 6)) };
  }
  if (mode === "agenda") {
    return { from: startOfDay(anchorDate), to: endOfDay(addDays(anchorDate, 30)) };
  }
  const from = startOfMonthGrid(anchorDate);
  return { from, to: endOfDay(addDays(from, 41)) };
}

function itemDate(item: CalendarFeedItem) {
  return new Date(item.startsAt);
}

function itemTimeLabel(item: CalendarFeedItem) {
  const start = new Date(item.startsAt);
  if (!item.endsAt) {
    return timeFormatter.format(start);
  }
  const end = new Date(item.endsAt);
  return `${timeFormatter.format(start)}-${timeFormatter.format(end)}`;
}

function itemMeta(item: CalendarFeedItem) {
  return [item.related.label, item.location, item.sourceChannel].filter(Boolean).join(" В· ");
}

function sortItemsByStart(items: CalendarFeedItem[]) {
  return [...items].sort((left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime());
}

function addQuery(params: URLSearchParams, key: string, value: string | undefined) {
  if (value) {
    params.set(key, value);
  }
}

function datetimeLocalValue(date = new Date()) {
  const next = new Date(date);
  next.setMinutes(next.getMinutes() - next.getTimezoneOffset());
  return next.toISOString().slice(0, 16);
}

function datetimeLocalForDay(date: Date, currentValue: string) {
  const next = startOfDay(date);
  const current = currentValue ? new Date(currentValue) : null;
  if (current && !Number.isNaN(current.getTime())) {
    next.setHours(current.getHours(), current.getMinutes(), 0, 0);
  } else {
    next.setHours(9, 0, 0, 0);
  }
  return datetimeLocalValue(next);
}

function leadOptionLabel(lead: LeadOption): string {
  return [lead.code ?? lead.id, lead.client?.name ?? lead.name, lead.projectName ?? lead.name].filter(Boolean).join(" · ");
}

function leadOptionValue(lead: LeadOption): string {
  return leadOptionLabel(lead);
}

function leadIdFromInput(value: string): string {
  return value.split("|")[0]?.trim() ?? value.trim();
}

function CalendarChip({ item, compact = false }: { item: CalendarFeedItem; compact?: boolean }) {
  const meta = itemMeta(item);
  const tooltip = [item.title, item.description, itemTimeLabel(item), meta].filter(Boolean).join("\n");
  return (
    <article className={`calendarChip ${item.kind === "reminder" ? "calendarChipReminder" : "calendarChipEvent"}`} title={tooltip}>
      <div>
        <span className="calendarChipTime">{itemTimeLabel(item)}</span>
        <strong>{item.title}</strong>
      </div>
      {!compact && meta ? <p>{meta}</p> : null}
    </article>
  );
}

function CalendarInspector({ selectedDate, items }: { selectedDate: Date; items: CalendarFeedItem[] }) {
  const sortedItems = sortItemsByStart(items);
  return (
    <aside className="calendarInspector" aria-label="Selected day events">
      <header>
        <span>{dayFormatter.format(selectedDate)}</span>
        <strong>{fullDateFormatter.format(selectedDate)}</strong>
      </header>
      {sortedItems.length > 0 ? (
        <div className="calendarTimeline">
          {sortedItems.map((item) => {
            const meta = itemMeta(item);
            return (
              <article className="calendarTimelineItem" key={`${item.kind}-${item.id}`}>
                <div className="calendarTimelineRail">
                  <span />
                </div>
                <div className="calendarTimelineCard" title={[item.title, item.description, itemTimeLabel(item), meta].filter(Boolean).join("\n")}>
                  <div className="calendarTimelineTopline">
                    <span>{itemTimeLabel(item)}</span>
                    <b>{item.kind}</b>
                  </div>
                  <strong>{item.title}</strong>
                  {item.description ? <p>{item.description}</p> : null}
                  {meta ? <small>{meta}</small> : null}
                  <div className="calendarTimelineActions">
                    {item.related.href ? (
                      <a href={item.related.href}>Open</a>
                    ) : (
                      <button type="button" onClick={() => window.alert("No linked CRM record for this item yet.")}>
                        Open
                      </button>
                    )}
                    <button type="button" onClick={() => window.alert("Calendar item completion is not implemented yet.")}>
                      Done
                    </button>
                    <button type="button" onClick={() => window.alert("Calendar rescheduling is not implemented yet.")}>
                      Move
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="calendarInspectorEmpty">
          <strong>No events for this day</strong>
          <span>Select a day with scheduled work or add a reminder from a lead/client card.</span>
        </div>
      )}
    </aside>
  );
}

function EmptyCalendarState() {
  return (
    <div className="calendarEmpty">
      <strong>No scheduled CRM work</strong>
      <span>Reminders and events from Telegram, LangGraph, manual entries, and calendar sync will appear here.</span>
    </div>
  );
}

export function CrmCalendar({
  title,
  description,
  endpoint = "/api/crm/calendar-feed",
  leadId,
  clientId,
  coldTargetId
}: CrmCalendarProps) {
  const [mode, setMode] = useState<CalendarViewMode>("month");
  const [anchorDate, setAnchorDate] = useState(() => startOfDay(new Date()));
  const [selectedDate, setSelectedDate] = useState(() => startOfDay(new Date()));
  const [items, setItems] = useState<CalendarFeedItem[]>([]);
  const [leadOptions, setLeadOptions] = useState<LeadOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [createDraft, setCreateDraft] = useState({
    title: "",
    startsAt: datetimeLocalValue(),
    leadId: leadId ?? "",
    description: ""
  });
  const [createStatus, setCreateStatus] = useState<"idle" | "saving" | "error">("idle");
  const range = useMemo(() => viewRange(mode, anchorDate), [anchorDate, mode]);
  const visibleDays = useMemo(() => {
    const totalDays = mode === "month" ? 42 : mode === "week" ? 7 : mode === "day" ? 1 : 31;
    return Array.from({ length: totalDays }, (_, index) => addDays(range.from, index));
  }, [mode, range.from]);
  const itemsByDay = useMemo(() => {
    const grouped = new Map<string, CalendarFeedItem[]>();
    for (const item of items) {
      const key = dateKey(itemDate(item));
      grouped.set(key, [...(grouped.get(key) ?? []), item]);
    }
    return grouped;
  }, [items]);
  const headerLabel = useMemo(() => {
    if (mode === "day") {
      return fullDateFormatter.format(anchorDate);
    }
    if (mode === "week") {
      return `${dateFormatter.format(range.from)} - ${dateFormatter.format(range.to)}`;
    }
    if (mode === "agenda") {
      return `Next 30 days from ${dateFormatter.format(anchorDate)}`;
    }
    return monthFormatter.format(anchorDate);
  }, [anchorDate, mode, range.from, range.to]);
  const selectedLeadLabel = useMemo(() => {
    if (!leadId) {
      return null;
    }
    const matchingLead = leadOptions.find((lead) => lead.id === leadId);
    const matchingItem = items.find((item) => item.related.entity === "lead" && item.related.id === leadId && item.related.label);
    return matchingLead ? leadOptionLabel(matchingLead) : matchingItem?.related.label ?? leadId;
  }, [items, leadId, leadOptions]);
  const contextDescription = selectedLeadLabel ? `${description} Lead: ${selectedLeadLabel}.` : description;
  const yearOptions = useMemo(() => {
    const anchorYear = anchorDate.getFullYear();
    return Array.from({ length: 11 }, (_, index) => anchorYear - 5 + index);
  }, [anchorDate]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      from: range.from.toISOString(),
      to: range.to.toISOString()
    });
    addQuery(params, "leadId", leadId);
    addQuery(params, "clientId", clientId);
    addQuery(params, "coldTargetId", coldTargetId);
    setIsLoading(true);
    setFailed(false);
    fetch(`${endpoint}?${params.toString()}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) {
          throw new Error("Calendar feed failed");
        }
        return response.json() as Promise<CalendarFeedItem[]>;
      })
      .then((payload) => setItems(payload))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setFailed(true);
        setItems([]);
      })
      .finally(() => setIsLoading(false));
    return () => controller.abort();
  }, [clientId, coldTargetId, endpoint, leadId, range.from, range.to]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/crm/leads", { signal: controller.signal })
      .then((response) => (response.ok ? (response.json() as Promise<LeadOption[]>) : []))
      .then((payload) => setLeadOptions(Array.isArray(payload) ? payload : []))
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setLeadOptions([]);
        }
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!leadId) {
      return;
    }
    const matchingLead = leadOptions.find((lead) => lead.id === leadId);
    setCreateDraft((current) => ({ ...current, leadId: matchingLead ? leadOptionValue(matchingLead) : leadId }));
  }, [leadId, leadOptions]);

  useEffect(() => {
    setCreateDraft((current) => ({ ...current, startsAt: datetimeLocalForDay(selectedDate, current.startsAt) }));
  }, [selectedDate]);

  const move = (direction: -1 | 1) => {
    if (mode === "month") {
      setAnchorDate((current) => {
        const next = addMonths(current, direction);
        setSelectedDate(startOfDay(new Date(next.getFullYear(), next.getMonth(), 1)));
        return next;
      });
      return;
    }
    if (mode === "week") {
      setAnchorDate((current) => addDays(current, direction * 7));
      return;
    }
    setAnchorDate((current) => addDays(current, direction));
  };
  const setVisibleMonth = (month: number, year = anchorDate.getFullYear()) => {
    const next = startOfDay(new Date(year, month, 1));
    setAnchorDate(next);
    setSelectedDate(next);
  };
  const visibleItemCount = items.length;
  const selectedItems = itemsByDay.get(dateKey(selectedDate)) ?? [];

  async function createCalendarEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const titleValue = createDraft.title.trim();
    if (!titleValue || !createDraft.startsAt) {
      return;
    }
    setCreateStatus("saving");
    try {
      const startsAt = new Date(createDraft.startsAt);
      const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);
      const matchingLead = leadOptions.find((lead) => leadOptionValue(lead) === createDraft.leadId.trim());
      const targetLeadId = leadId ?? matchingLead?.id ?? leadIdFromInput(createDraft.leadId);
      const response = await fetch("/api/crm/calendar-events/upsert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: "default",
          leadId: targetLeadId || null,
          title: titleValue,
          description: createDraft.description.trim() || null,
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString()
        })
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Calendar event save failed");
      }
      const createdItem: CalendarFeedItem = {
        id: String(payload.id),
        kind: "event",
        title: String(payload.title ?? titleValue),
        description: typeof payload.description === "string" ? payload.description : createDraft.description.trim() || null,
        startsAt: String(payload.startsAt ?? startsAt.toISOString()),
        endsAt: payload.endsAt ? String(payload.endsAt) : endsAt.toISOString(),
        status: typeof payload.syncStatus === "string" ? payload.syncStatus : null,
        sourceChannel: "manual",
        location: typeof payload.location === "string" ? payload.location : null,
        related: {
          entity: targetLeadId ? "lead" : null,
          id: targetLeadId || null,
          label: targetLeadId || null,
          href: targetLeadId ? `/leads?focus=${encodeURIComponent(targetLeadId)}` : null
        }
      };
      setItems((current) => sortItemsByStart([...current, createdItem]));
      setSelectedDate(startOfDay(new Date(createdItem.startsAt)));
      setCreateDraft((current) => ({ ...current, title: "", description: "" }));
      setCreateStatus("idle");
    } catch {
      setCreateStatus("error");
    }
  }

  const createEventForm = (
    <form className="calendarCreateForm" onSubmit={createCalendarEvent}>
      <input
        aria-label="Event title"
        placeholder="Event title"
        value={createDraft.title}
        onChange={(event) => setCreateDraft((current) => ({ ...current, title: event.target.value }))}
      />
      <input
        aria-label="Event date and time"
        type="datetime-local"
        value={createDraft.startsAt}
        onChange={(event) => setCreateDraft((current) => ({ ...current, startsAt: event.target.value }))}
      />
      <input
        aria-label="Lead"
        list="calendar-lead-options"
        placeholder="Lead"
        value={createDraft.leadId}
        disabled={Boolean(leadId)}
        onChange={(event) => setCreateDraft((current) => ({ ...current, leadId: event.target.value }))}
      />
      <datalist id="calendar-lead-options">
        {leadOptions.map((lead) => (
          <option key={lead.id} value={leadOptionValue(lead)} />
        ))}
      </datalist>
      <input
        aria-label="Event description"
        placeholder="Description"
        value={createDraft.description}
        onChange={(event) => setCreateDraft((current) => ({ ...current, description: event.target.value }))}
      />
      <button type="submit" disabled={createStatus === "saving" || !createDraft.title.trim()}>
        {createStatus === "saving" ? "Saving" : "Add event"}
      </button>
      {createStatus === "error" ? <span>Could not save event.</span> : null}
    </form>
  );

  return (
    <section className="calendarPage">
      <header className="calendarHeader">
        <div>
          <h1>{title}</h1>
          <p>{failed ? `${contextDescription} Calendar API unavailable.` : contextDescription}</p>
        </div>
        <div className="calendarToolbar">
          <div className="calendarNav" aria-label="Calendar navigation">
            <button type="button" onClick={() => move(-1)} aria-label="Previous calendar range">
              <ChevronLeft aria-hidden="true" size={16} strokeWidth={2} />
            </button>
            <button
              type="button"
              onClick={() => {
                const today = startOfDay(new Date());
                setAnchorDate(today);
                setSelectedDate(today);
              }}
            >
              Today
            </button>
            <button type="button" onClick={() => move(1)} aria-label="Next calendar range">
              <ChevronRight aria-hidden="true" size={16} strokeWidth={2} />
            </button>
          </div>
          <div className="calendarViewSwitch" aria-label="Calendar view">
            {(["month", "week", "day", "agenda"] as const).map((view) => (
              <button type="button" key={view} className={mode === view ? "active" : ""} onClick={() => setMode(view)}>
                {view}
              </button>
            ))}
          </div>
        </div>
      </header>
      <div className="calendarSummary">
        <div className="calendarSummaryTitle">
          <strong>{headerLabel}</strong>
          {mode === "month" ? (
            <div className="calendarMonthControls" aria-label="Month navigation">
              <button type="button" onClick={() => move(-1)} aria-label="Previous month">
                <ChevronLeft aria-hidden="true" size={14} strokeWidth={2} />
              </button>
              <select
                aria-label="Month"
                value={anchorDate.getMonth()}
                onChange={(event) => setVisibleMonth(Number(event.target.value))}
              >
                {monthOptions.map((month) => (
                  <option key={month.value} value={month.value}>
                    {month.label}
                  </option>
                ))}
              </select>
              <select
                aria-label="Year"
                value={anchorDate.getFullYear()}
                onChange={(event) => setVisibleMonth(anchorDate.getMonth(), Number(event.target.value))}
              >
                {yearOptions.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
              <button type="button" onClick={() => move(1)} aria-label="Next month">
                <ChevronRight aria-hidden="true" size={14} strokeWidth={2} />
              </button>
            </div>
          ) : null}
        </div>
        <span>{isLoading ? "Loading schedule" : `${visibleItemCount} scheduled item${visibleItemCount === 1 ? "" : "s"}`}</span>
      </div>
      {mode === "agenda" ? (
        <div className="calendarAgenda">
          {visibleDays.map((day) => {
            const dayItems = itemsByDay.get(dateKey(day)) ?? [];
            if (dayItems.length === 0) {
              return null;
            }
            return (
              <section className="calendarAgendaDay" key={dateKey(day)}>
                <h2>
                  {dayFormatter.format(day)}
                  <span>{dateFormatter.format(day)}</span>
                </h2>
                <div>
                  {dayItems.map((item) => (
                    <CalendarChip item={item} key={`${item.kind}-${item.id}`} />
                  ))}
                </div>
              </section>
            );
          })}
          {!isLoading && visibleItemCount === 0 ? <EmptyCalendarState /> : null}
        </div>
      ) : mode === "month" ? (
        <div className="calendarSplit">
          <div className="calendarMonthPanel">
            <div className="calendarGrid calendarGridMonth">
              {visibleDays.map((day) => {
                const dayItems = sortItemsByStart(itemsByDay.get(dateKey(day)) ?? []);
                const outsideMonth = day.getMonth() !== anchorDate.getMonth();
                const isSelected = sameDay(day, selectedDate);
                return (
                  <button
                    type="button"
                    className={`calendarDay calendarDayButton ${outsideMonth ? "muted" : ""} ${
                      sameDay(day, new Date()) ? "today" : ""
                    } ${isSelected ? "selected" : ""}`}
                    key={dateKey(day)}
                    onClick={() => setSelectedDate(startOfDay(day))}
                  >
                    <header>
                      <span>{dayFormatter.format(day)}</span>
                      <strong>{day.getDate()}</strong>
                    </header>
                    <div className="calendarDayItems">
                      {dayItems.slice(0, 3).map((item) => (
                        <CalendarChip item={item} key={`${item.kind}-${item.id}`} compact />
                      ))}
                      {dayItems.length > 3 ? <span className="calendarMore">+{dayItems.length - 3} more</span> : null}
                    </div>
                  </button>
                );
              })}
            </div>
            {createEventForm}
          </div>
          <CalendarInspector selectedDate={selectedDate} items={selectedItems} />
        </div>
      ) : (
        <div className={`calendarGrid calendarGrid${mode[0].toUpperCase()}${mode.slice(1)}`}>
          {visibleDays.map((day) => {
            const dayItems = sortItemsByStart(itemsByDay.get(dateKey(day)) ?? []);
            return (
              <section
                className={`calendarDay ${sameDay(day, new Date()) ? "today" : ""}`}
                key={dateKey(day)}
              >
                <header>
                  <span>{dayFormatter.format(day)}</span>
                  <strong>{day.getDate()}</strong>
                </header>
                <div className="calendarDayItems">
                  {dayItems.slice(0, 12).map((item) => (
                    <CalendarChip item={item} key={`${item.kind}-${item.id}`} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
      {mode === "month" ? null : createEventForm}
    </section>
  );
}
