"use client";

import type { FormEvent, ReactNode } from "react";
import { ChevronLeft, ChevronRight, Mail, PartyPopper, Send } from "lucide-react";
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
  outreach?: {
    campaignId: string;
    campaignName: string;
    touchId: string | null;
    touchNumber: number | null;
    touchTitle: string | null;
    action: string | null;
    channel: string | null;
    subject: string | null;
    body: string | null;
    email: string | null;
  } | null;
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

type EmailDraftEdit = {
  subject: string;
  body: string;
  saveStatus?: "idle" | "saving" | "saved" | "error";
  sendStatus?: "idle" | "sending" | "sent" | "auth" | "error";
  message?: string | null;
};

const dayFormatter = new Intl.DateTimeFormat("en", { weekday: "short" });
const monthFormatter = new Intl.DateTimeFormat("en", { month: "long", year: "numeric" });
const dateFormatter = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" });
const fullDateFormatter = new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
const scheduledDateFormatter = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
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

function leadMatchesRef(lead: LeadOption, value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return lead.id.toLowerCase() === normalized || (lead.code?.toLowerCase() ?? "") === normalized;
}

function leadIdFromInput(value: string): string {
  return value.split("|")[0]?.trim() ?? value.trim();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function emailParagraphs(body: string): string[] {
  return body
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function styledEmailBody(body: string): string {
  const paragraphs = emailParagraphs(body);
  return paragraphs
    .map((paragraph, index) => {
      const escaped = escapeHtml(paragraph).replace(/\n/g, "<br>");
      if (index === 0) {
        return `<p><strong>${escaped}</strong></p>`;
      }
      if (index === paragraphs.length - 1) {
        return `<p><em>${escaped}</em></p>`;
      }
      return `<p>${escaped}</p>`;
    })
    .join("");
}

function gmailComposeUrl(email: string, subject: string, body: string): string {
  const params = new URLSearchParams({
    view: "cm",
    fs: "1",
    to: email,
    su: subject,
    body
  });
  return `https://mail.google.com/mail/?${params.toString()}`;
}

function CalendarChip({ item, compact = false, activeCampaignId }: { item: CalendarFeedItem; compact?: boolean; activeCampaignId?: string }) {
  const meta = itemMeta(item);
  const isActiveOutreach = activeCampaignId && item.outreach?.campaignId === activeCampaignId;
  return (
    <article
      className={`calendarChip ${item.kind === "reminder" ? "calendarChipReminder" : "calendarChipEvent"} ${
        item.outreach ? "calendarChipOutreach" : ""
      } ${isActiveOutreach ? "activeOutreach" : ""}`}
    >
      <div>
        <span className="calendarChipTime">{itemTimeLabel(item)}</span>
        <strong>{item.title}</strong>
      </div>
      {!compact && meta ? <p>{meta}</p> : null}
    </article>
  );
}

function OutreachEmailPreview({
  item,
  styled,
  onToggleStyled,
  draft,
  onDraftChange,
  onSaveDraft
}: {
  item: CalendarFeedItem;
  styled: boolean;
  onToggleStyled: () => void;
  draft: EmailDraftEdit;
  onDraftChange: (patch: Partial<EmailDraftEdit>) => void;
  onSaveDraft: (patch?: Partial<EmailDraftEdit>) => void;
}) {
  const subject = draft.subject;
  const body = draft.body;
  return (
    <details className="calendarEmailDetails">
      <summary>
        <span className="calendarEmailSummaryShow">Email</span>
        <span className="calendarEmailSummaryHide">Email</span>
      </summary>
      <div className="calendarEmailPreview">
        <div className="calendarEmailSubjectRow">
          <label className="outreachFloatField">
            <span>Subject</span>
            <input
              value={subject}
              placeholder="No subject prepared"
              onBlur={() => onSaveDraft()}
              onChange={(event) => onDraftChange({ subject: event.target.value })}
            />
          </label>
          <button type="button" aria-pressed={styled} onClick={onToggleStyled}>
            {styled ? "Styled" : "Plain"}
          </button>
        </div>
        <label className="calendarEmailBody outreachFloatField">
          <span>Email</span>
          {styled ? (
            <div
              className="calendarEmailStyledBody editable"
              contentEditable
              role="textbox"
              aria-label="Email body"
              suppressContentEditableWarning
              onBlur={(event) => {
                const body = event.currentTarget.innerText.trim();
                onDraftChange({ body });
                onSaveDraft({ body });
              }}
            >
              {emailParagraphs(body).map((paragraph, index, paragraphs) => (
                <p
                  className={index === 0 ? "lead" : index === paragraphs.length - 1 ? "closing" : undefined}
                  key={`${paragraph}-${index}`}
                >
                  {paragraph}
                </p>
              ))}
            </div>
          ) : (
            <textarea
              value={body}
              placeholder="No draft prepared"
              onBlur={() => onSaveDraft()}
              onChange={(event) => onDraftChange({ body: event.target.value })}
            />
          )}
        </label>
        <div className="calendarEmailActions">
          <button type="button" onClick={() => onSaveDraft()} disabled={draft.saveStatus === "saving"}>
            {draft.saveStatus === "saving" ? "Saving" : "Save draft"}
          </button>
          {draft.message ? <span className="calendarEmailStatus">{draft.message}</span> : null}
        </div>
      </div>
    </details>
  );
}

function CalendarInspector({
  selectedDate,
  items,
  styledEmailItems,
  emailDrafts,
  celebratingDoneItems,
  doneNotices,
  onToggleStyledEmail,
  onDraftChange,
  onSaveDraft,
  onSendEmail,
  onOpenGmail,
  onMarkSent,
  headerActions
}: {
  selectedDate: Date;
  items: CalendarFeedItem[];
  styledEmailItems: Record<string, boolean>;
  emailDrafts: Record<string, EmailDraftEdit>;
  celebratingDoneItems: Record<string, boolean>;
  doneNotices: Record<string, string>;
  onToggleStyledEmail: (item: CalendarFeedItem) => void;
  onDraftChange: (item: CalendarFeedItem, patch: Partial<EmailDraftEdit>) => void;
  onSaveDraft: (item: CalendarFeedItem, patch?: Partial<EmailDraftEdit>) => void;
  onSendEmail: (item: CalendarFeedItem) => void;
  onOpenGmail: (item: CalendarFeedItem) => void;
  onMarkSent: (item: CalendarFeedItem) => void;
  headerActions?: ReactNode;
}) {
  const sortedItems = sortItemsByStart(items);
  return (
    <aside className="calendarInspector" aria-label="Selected day events">
      <header>
        <div>
          <span>{dayFormatter.format(selectedDate)}</span>
          <strong>{fullDateFormatter.format(selectedDate)}</strong>
        </div>
        {headerActions ? <div className="calendarInspectorHeaderActions">{headerActions}</div> : null}
      </header>
      {sortedItems.length > 0 ? (
        <div className="calendarTimeline">
          {sortedItems.map((item) => {
            const meta = itemMeta(item);
            const draft =
              emailDrafts[item.id] ?? {
                subject: item.outreach?.subject ?? "",
                body: item.outreach?.body ?? "",
                saveStatus: "idle",
                sendStatus: "idle"
              };
            const canSendOutreachEmail =
              Boolean(item.outreach?.email && draft.subject.trim() && draft.body.trim()) && item.status !== "done";
            const isDoneCelebrating = Boolean(celebratingDoneItems[item.id]);
            const isOutreachDone = Boolean(item.outreach && item.status === "done");
            const doneNotice = doneNotices[item.id];
            return (
              <article className="calendarTimelineItem" key={`${item.kind}-${item.id}`}>
                <div className="calendarTimelineRail">
                  <span />
                </div>
                <div className="calendarTimelineCard">
                  <div className="calendarTimelineTopline">
                    <span>{itemTimeLabel(item)}</span>
                    <b>{item.kind}</b>
                  </div>
                  <strong>{item.title}</strong>
                  {item.outreach ? (
                    <p className="calendarTimelineOutreachLine">
                      {[item.outreach.campaignName, item.outreach.action].filter(Boolean).join(" ")}
                    </p>
                  ) : item.description ? (
                    <p>{item.description}</p>
                  ) : null}
                  {item.outreach?.subject || item.outreach?.body ? (
                    <OutreachEmailPreview
                      item={item}
                      styled={styledEmailItems[item.id] ?? true}
                      draft={draft}
                      onToggleStyled={() => onToggleStyledEmail(item)}
                      onDraftChange={(patch) => onDraftChange(item, patch)}
                      onSaveDraft={(patch) => void onSaveDraft(item, patch)}
                    />
                  ) : null}
                  {meta && !item.outreach ? <small>{meta}</small> : null}
                  <div className="calendarTimelineActions">
                    <div className="calendarTimelineActionsLeft">
                      {item.related.href ? (
                        <a href={item.related.href}>Open</a>
                      ) : (
                        <button type="button" onClick={() => window.alert("No linked CRM record for this item yet.")}>
                          Open
                        </button>
                      )}
                      <button
                        className={`calendarMarkDoneButton ${isDoneCelebrating ? "celebrating" : ""}`}
                        type="button"
                        disabled={item.status === "done" && !isDoneCelebrating}
                        onClick={() => onMarkSent(item)}
                      >
                        <span>{isOutreachDone ? "Sent" : item.outreach ? "Mark sent" : "Done"}</span>
                        {isDoneCelebrating ? <PartyPopper aria-hidden="true" size={14} strokeWidth={2.2} /> : null}
                      </button>
                      <button type="button" onClick={() => window.alert("Calendar rescheduling is not implemented yet.")}>
                        Move
                      </button>
                    </div>
                    {item.outreach ? (
                      <div className="calendarTimelineActionsRight">
                        <button
                          className={`calendarEmailSendButton ${draft.sendStatus === "sent" ? "sent" : ""}`}
                          type="button"
                          disabled={
                            !canSendOutreachEmail ||
                            draft.sendStatus === "sending" ||
                            draft.sendStatus === "sent"
                          }
                          onClick={() => onSendEmail(item)}
                        >
                          <Send className="calendarEmailSendIcon" aria-hidden="true" size={14} strokeWidth={2.2} />
                          <span>
                            {draft.sendStatus === "sending" ? "Sending" : item.status === "done" || draft.sendStatus === "sent" ? "Sent" : "Send email"}
                          </span>
                        </button>
                        <button
                          className="calendarEmailGmailButton"
                          type="button"
                          disabled={!canSendOutreachEmail}
                          onClick={() => onOpenGmail(item)}
                        >
                          <Mail aria-hidden="true" size={14} strokeWidth={2.1} />
                          <span>Send Gmail</span>
                        </button>
                        {draft.sendStatus === "sent" ? <span className="calendarEmailCelebration">Success</span> : null}
                      </div>
                    ) : null}
                  </div>
                  {doneNotice ? <div className="calendarDoneNotice">{doneNotice}</div> : null}
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
      <span>Reminders and events from TG, LangGraph, manual entries, and calendar sync will appear here.</span>
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
  const [selectedOutreachCampaignId, setSelectedOutreachCampaignId] = useState("all");
  const [styledEmailItems, setStyledEmailItems] = useState<Record<string, boolean>>({});
  const [emailDrafts, setEmailDrafts] = useState<Record<string, EmailDraftEdit>>({});
  const [celebratingDoneItems, setCelebratingDoneItems] = useState<Record<string, boolean>>({});
  const [doneNotices, setDoneNotices] = useState<Record<string, string>>({});
  const [refreshToken, setRefreshToken] = useState(0);
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
  const resolvedLead = useMemo(() => leadOptions.find((lead) => leadMatchesRef(lead, leadId)) ?? null, [leadId, leadOptions]);
  const resolvedLeadId = resolvedLead?.id ?? leadId;
  const visibleDays = useMemo(() => {
    const totalDays = mode === "month" ? 42 : mode === "week" ? 7 : mode === "day" ? 1 : 31;
    return Array.from({ length: totalDays }, (_, index) => addDays(range.from, index));
  }, [mode, range.from]);
  const itemsByDay = useMemo(() => {
    const grouped = new Map<string, CalendarFeedItem[]>();
    const visibleItems =
      selectedOutreachCampaignId === "all"
        ? items
        : items.filter((item) => item.outreach?.campaignId === selectedOutreachCampaignId);
    for (const item of visibleItems) {
      const key = dateKey(itemDate(item));
      grouped.set(key, [...(grouped.get(key) ?? []), item]);
    }
    return grouped;
  }, [items, selectedOutreachCampaignId]);
  const filteredItems = useMemo(
    () =>
      selectedOutreachCampaignId === "all"
        ? items
        : items.filter((item) => item.outreach?.campaignId === selectedOutreachCampaignId),
    [items, selectedOutreachCampaignId]
  );
  const outreachCampaignOptions = useMemo(() => {
    const byId = new Map<string, string>();
    for (const item of items) {
      if (item.outreach?.campaignId) {
        byId.set(item.outreach.campaignId, item.outreach.campaignName);
      }
    }
    return [...byId.entries()].map(([id, name]) => ({ id, name }));
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
    const matchingItem = items.find((item) => item.related.entity === "lead" && item.related.id === resolvedLeadId && item.related.label);
    return resolvedLead ? leadOptionLabel(resolvedLead) : matchingItem?.related.label ?? leadId;
  }, [items, leadId, resolvedLead, resolvedLeadId]);
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
    addQuery(params, "leadId", resolvedLeadId);
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
  }, [clientId, coldTargetId, endpoint, range.from, range.to, refreshToken, resolvedLeadId]);

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
    const matchingLead = leadOptions.find((lead) => leadMatchesRef(lead, leadId));
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
  const visibleItemCount = filteredItems.length;
  const selectedItems = itemsByDay.get(dateKey(selectedDate)) ?? [];

  function toggleStyledEmail(item: CalendarFeedItem) {
    setStyledEmailItems((current) => ({ ...current, [item.id]: !(current[item.id] ?? true) }));
  }

  function emailDraftForItem(item: CalendarFeedItem): EmailDraftEdit {
    return (
      emailDrafts[item.id] ?? {
        subject: item.outreach?.subject ?? "",
        body: item.outreach?.body ?? "",
        saveStatus: "idle",
        sendStatus: "idle",
        message: null
      }
    );
  }

  function updateEmailDraft(item: CalendarFeedItem, patch: Partial<EmailDraftEdit>) {
    setEmailDrafts((current) => ({
      ...current,
      [item.id]: {
        saveStatus: "idle",
        sendStatus: "idle",
        message: null,
        ...current[item.id],
        subject: current[item.id]?.subject ?? item.outreach?.subject ?? "",
        body: current[item.id]?.body ?? item.outreach?.body ?? "",
        ...patch
      }
    }));
  }

  async function saveEmailDraft(item: CalendarFeedItem, patch?: Partial<EmailDraftEdit>): Promise<EmailDraftEdit | null> {
    if (!item.outreach || item.related.entity !== "coldTarget" || !item.related.id) {
      return null;
    }
    const draft = { ...emailDraftForItem(item), ...patch };
    const originalSubject = item.outreach.subject ?? "";
    const originalBody = item.outreach.body ?? "";
    if (draft.subject === originalSubject && draft.body === originalBody && draft.saveStatus !== "error") {
      return draft;
    }
    updateEmailDraft(item, { saveStatus: "saving", message: null });
    try {
      const response = await fetch("/api/crm/outreach-campaigns/draft/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: "default",
          reminderId: item.id,
          coldTargetId: item.related.id,
          campaignId: item.outreach.campaignId,
          subject: draft.subject,
          body: draft.body
        })
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Draft save failed");
      }
      setItems((current) =>
        current.map((candidate) =>
          candidate.id === item.id
            ? {
                ...candidate,
                description: [
                  item.outreach?.campaignName,
                  item.outreach?.action,
                  draft.subject ? `Subject: ${draft.subject}` : null,
                  draft.body ? `Draft:\n${draft.body}` : null
                ]
                  .filter(Boolean)
                  .join("\n\n"),
                outreach: candidate.outreach ? { ...candidate.outreach, subject: draft.subject, body: draft.body } : candidate.outreach
              }
            : candidate
        )
      );
      const saved = { ...draft, saveStatus: "saved" as const, message: "saved" };
      updateEmailDraft(item, saved);
      return saved;
    } catch (error) {
      updateEmailDraft(item, { saveStatus: "error", message: error instanceof Error ? error.message : "Draft save failed" });
      return null;
    }
  }

  async function sendEmailDraft(item: CalendarFeedItem) {
    if (!item.outreach?.email || item.related.entity !== "coldTarget") {
      updateEmailDraft(item, { sendStatus: "error", message: "No email address." });
      return;
    }
    updateEmailDraft(item, { sendStatus: "sending", message: null });
    const savedDraft = await saveEmailDraft(item);
    const draft = savedDraft ?? emailDraftForItem(item);
    try {
      const response = await fetch("/api/crm/outreach-campaigns/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: item.outreach.email,
          subject: draft.subject,
          body: draft.body,
          htmlBody: (styledEmailItems[item.id] ?? true) ? styledEmailBody(draft.body) : null,
          returnTo: `${window.location.pathname}${window.location.search}`
        })
      });
      const payload = (await response.json()) as {
        sent?: boolean;
        authRequired?: boolean;
        authUrl?: string;
        error?: string;
        description?: string;
      };
      if (payload.authRequired && payload.authUrl) {
        updateEmailDraft(item, {
          sendStatus: "auth",
          message: payload.description ?? payload.error ?? "Authorize Gmail, then press Send again."
        });
        window.open(payload.authUrl, "_blank", "noopener,noreferrer");
        return;
      }
      if (!response.ok || !payload.sent) {
        throw new Error(payload.error ?? "Gmail send failed");
      }
      updateEmailDraft(item, { sendStatus: "sent", message: "sent" });
      await markCalendarItemDone(item);
    } catch (error) {
      updateEmailDraft(item, { sendStatus: "error", message: error instanceof Error ? error.message : "Gmail send failed" });
    }
  }

  function openGmailDraft(item: CalendarFeedItem) {
    if (!item.outreach?.email) {
      updateEmailDraft(item, { message: "No email address." });
      return;
    }
    const draft = emailDraftForItem(item);
    window.open(gmailComposeUrl(item.outreach.email, draft.subject, draft.body), "_blank", "noopener,noreferrer");
  }

  function celebrateCalendarItemDone(item: CalendarFeedItem, shouldRefresh = false, notice = "Marked done.") {
    setItems((current) => current.map((candidate) => (candidate.id === item.id ? { ...candidate, status: "done" } : candidate)));
    setDoneNotices((current) => ({ ...current, [item.id]: notice }));
    setCelebratingDoneItems((current) => ({ ...current, [item.id]: true }));
    window.setTimeout(() => {
      setCelebratingDoneItems((current) => {
        const next = { ...current };
        delete next[item.id];
        return next;
      });
      if (shouldRefresh) {
        setRefreshToken((value) => value + 1);
      }
    }, 1200);
  }

  function nextTouchNotice(item: CalendarFeedItem, calendarItems?: CalendarFeedItem[]) {
    if (!item.outreach) {
      return "Marked done.";
    }
    const nextItem = calendarItems?.find((candidate) => candidate.id !== item.id && candidate.status !== "done");
    if (!nextItem) {
      return "Touch marked sent. No next touch remains in this campaign.";
    }
    return `Touch marked sent. Next touch scheduled for ${scheduledDateFormatter.format(new Date(nextItem.startsAt))}.`;
  }

  async function markCalendarItemDone(item: CalendarFeedItem) {
    try {
      const response =
        item.outreach && item.related.entity === "coldTarget" && item.related.id
          ? await fetch("/api/crm/outreach-campaigns/advance", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  workspaceId: "default",
                  coldTargetId: item.related.id,
                  campaignId: item.outreach.campaignId,
                  reminderId: item.id,
                  action: "mark_sent"
                })
            })
          : item.kind === "reminder"
            ? await fetch("/api/crm/reminders/upsert", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  id: item.id,
                  workspaceId: "default",
                  clientId: item.related.entity === "client" ? item.related.id : null,
                  leadId: item.related.entity === "lead" ? item.related.id : null,
                  coldTargetId: item.related.entity === "coldTarget" ? item.related.id : null,
                  title: item.title,
                  description: item.description,
                  dueAt: item.startsAt,
                  status: "done",
                  sourceChannel: item.sourceChannel
                })
              })
            : await fetch("/api/crm/calendar-events/upsert", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  id: item.id,
                  workspaceId: "default",
                  clientId: item.related.entity === "client" ? item.related.id : null,
                  leadId: item.related.entity === "lead" ? item.related.id : null,
                  coldTargetId: item.related.entity === "coldTarget" ? item.related.id : null,
                  title: item.title,
                  description: item.description,
                  startsAt: item.startsAt,
                  endsAt: item.endsAt ?? item.startsAt,
                  location: item.location,
                  syncStatus: "done"
                })
              });
      const payload = (await response.json()) as { calendarItems?: CalendarFeedItem[]; error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not mark touch sent");
      }
      celebrateCalendarItemDone(item, Boolean(item.outreach), nextTouchNotice(item, payload.calendarItems));
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Could not mark touch sent");
    }
  }

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
      const targetLeadId = resolvedLeadId ?? matchingLead?.id ?? leadIdFromInput(createDraft.leadId);
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
      <label className="calendarCreateField">
        <span>
          Date <i aria-hidden="true">*</i>
        </span>
        <input
          aria-label="Event date and time"
          type="datetime-local"
          required
          value={createDraft.startsAt}
          onChange={(event) => setCreateDraft((current) => ({ ...current, startsAt: event.target.value }))}
        />
      </label>
      <label className="calendarCreateField">
        <span>
          Event title <i aria-hidden="true">*</i>
        </span>
        <input
          aria-label="Event title"
          placeholder="Event title"
          required
          value={createDraft.title}
          onChange={(event) => setCreateDraft((current) => ({ ...current, title: event.target.value }))}
        />
      </label>
      <label className="calendarCreateField">
        <span>Lead</span>
        <input
          aria-label="Lead"
          list="calendar-lead-options"
          placeholder="Lead"
          value={createDraft.leadId}
          disabled={Boolean(leadId)}
          onChange={(event) => setCreateDraft((current) => ({ ...current, leadId: event.target.value }))}
        />
      </label>
      <datalist id="calendar-lead-options">
        {leadOptions.map((lead) => (
          <option key={lead.id} value={leadOptionValue(lead)} />
        ))}
      </datalist>
      <label className="calendarCreateField">
        <span>Description</span>
        <input
          aria-label="Event description"
          placeholder="Description"
          value={createDraft.description}
          onChange={(event) => setCreateDraft((current) => ({ ...current, description: event.target.value }))}
        />
      </label>
      <button type="submit" disabled={createStatus === "saving" || !createDraft.title.trim() || !createDraft.startsAt}>
        {createStatus === "saving" ? "Saving" : "Add event"}
      </button>
      {createStatus === "error" ? <span>Could not save event.</span> : null}
    </form>
  );
  const scheduledCountLabel = isLoading ? "Loading schedule" : `${visibleItemCount} scheduled item${visibleItemCount === 1 ? "" : "s"}`;
  const monthControls = (
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
  );
  const touchFilterControl =
    outreachCampaignOptions.length > 0 ? (
      <label className="calendarTouchFilter">
        <span>Touch filter</span>
        <select value={selectedOutreachCampaignId} onChange={(event) => setSelectedOutreachCampaignId(event.target.value)}>
          <option value="all">All scheduled work</option>
          {outreachCampaignOptions.map((campaign) => (
            <option key={campaign.id} value={campaign.id}>
              {campaign.name}
            </option>
          ))}
        </select>
      </label>
    ) : null;

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
      {mode === "month" ? null : (
        <div className="calendarSummary">
          <div className="calendarSummaryTitle">
            <strong>{headerLabel}</strong>
            {touchFilterControl}
          </div>
          <span>{scheduledCountLabel}</span>
        </div>
      )}
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
                    <CalendarChip item={item} key={`${item.kind}-${item.id}`} activeCampaignId={selectedOutreachCampaignId} />
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
                        <CalendarChip item={item} key={`${item.kind}-${item.id}`} compact activeCampaignId={selectedOutreachCampaignId} />
                      ))}
                      {dayItems.length > 3 ? <span className="calendarMore">+{dayItems.length - 3} more</span> : null}
                    </div>
                  </button>
                );
              })}
            </div>
            {createEventForm}
          </div>
          <CalendarInspector
            selectedDate={selectedDate}
            items={selectedItems}
            styledEmailItems={styledEmailItems}
            emailDrafts={emailDrafts}
            celebratingDoneItems={celebratingDoneItems}
            doneNotices={doneNotices}
            onToggleStyledEmail={toggleStyledEmail}
            onDraftChange={updateEmailDraft}
            onSaveDraft={saveEmailDraft}
            onSendEmail={sendEmailDraft}
            onOpenGmail={openGmailDraft}
            onMarkSent={markCalendarItemDone}
            headerActions={
              <>
                <span className="calendarInspectorCount">{scheduledCountLabel}</span>
                {monthControls}
                {touchFilterControl}
              </>
            }
          />
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
                    <CalendarChip item={item} key={`${item.kind}-${item.id}`} activeCampaignId={selectedOutreachCampaignId} />
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
