"use client";

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

const dayFormatter = new Intl.DateTimeFormat("en", { weekday: "short" });
const monthFormatter = new Intl.DateTimeFormat("en", { month: "long", year: "numeric" });
const dateFormatter = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" });
const fullDateFormatter = new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
const timeFormatter = new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit" });

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
  return [item.related.label, item.location, item.sourceChannel].filter(Boolean).join(" · ");
}

function addQuery(params: URLSearchParams, key: string, value: string | undefined) {
  if (value) {
    params.set(key, value);
  }
}

function CalendarChip({ item, compact = false }: { item: CalendarFeedItem; compact?: boolean }) {
  const meta = itemMeta(item);
  return (
    <article className={`calendarChip ${item.kind === "reminder" ? "calendarChipReminder" : "calendarChipEvent"}`}>
      <div>
        <span className="calendarChipTime">{itemTimeLabel(item)}</span>
        <strong>{item.title}</strong>
      </div>
      {!compact && meta ? <p>{meta}</p> : null}
    </article>
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
  const [items, setItems] = useState<CalendarFeedItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [failed, setFailed] = useState(false);
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

  const move = (direction: -1 | 1) => {
    if (mode === "month") {
      setAnchorDate((current) => addMonths(current, direction));
      return;
    }
    if (mode === "week") {
      setAnchorDate((current) => addDays(current, direction * 7));
      return;
    }
    setAnchorDate((current) => addDays(current, direction));
  };
  const visibleItemCount = items.length;

  return (
    <section className="calendarPage">
      <header className="calendarHeader">
        <div>
          <h1>{title}</h1>
          <p>{failed ? `${description} Calendar API unavailable.` : description}</p>
        </div>
        <div className="calendarToolbar">
          <div className="calendarNav" aria-label="Calendar navigation">
            <button type="button" onClick={() => move(-1)} aria-label="Previous calendar range">
              ‹
            </button>
            <button type="button" onClick={() => setAnchorDate(startOfDay(new Date()))}>
              Today
            </button>
            <button type="button" onClick={() => move(1)} aria-label="Next calendar range">
              ›
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
        <strong>{headerLabel}</strong>
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
      ) : (
        <div className={`calendarGrid calendarGrid${mode[0].toUpperCase()}${mode.slice(1)}`}>
          {visibleDays.map((day) => {
            const dayItems = itemsByDay.get(dateKey(day)) ?? [];
            const outsideMonth = mode === "month" && day.getMonth() !== anchorDate.getMonth();
            return (
              <section
                className={`calendarDay ${outsideMonth ? "muted" : ""} ${sameDay(day, new Date()) ? "today" : ""}`}
                key={dateKey(day)}
              >
                <header>
                  <span>{dayFormatter.format(day)}</span>
                  <strong>{day.getDate()}</strong>
                </header>
                <div className="calendarDayItems">
                  {dayItems.slice(0, mode === "month" ? 4 : 12).map((item) => (
                    <CalendarChip item={item} key={`${item.kind}-${item.id}`} compact={mode === "month"} />
                  ))}
                  {dayItems.length > 4 && mode === "month" ? <span className="calendarMore">+{dayItems.length - 4} more</span> : null}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </section>
  );
}
