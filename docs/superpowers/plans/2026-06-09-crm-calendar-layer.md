# CRM Calendar Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a calendar layer that aggregates reminders, CRM calendar events, Telegram/LangGraph-created notifications, and entity-specific follow-ups into a clear operational schedule.

**Architecture:** Keep `Reminder` and `CalendarEvent` as the backend source records, and add a read-model API that projects both into one calendar feed. Build calendar UI as a dedicated React component instead of forcing calendar behavior into Glide Data Grid; Glide remains the best tool for table views, not month/week/day scheduling.

**Tech Stack:** Next.js app router, TypeScript, existing `@lightcrm/core` service, Prisma repository, React/CSS calendar component, existing local dark-mode theme variables.

---

## Current System Notes

- `Reminder` already supports `clientId`, `leadId`, `coldTargetId`, `title`, `description`, `dueAt`, `status`, and `sourceChannel`.
- `CalendarEvent` already supports `clientId`, `leadId`, `coldTargetId`, `reminderId`, `title`, `description`, `startsAt`, `endsAt`, `location`, external sync metadata, and archive fields.
- Existing `/today` is a table backed by `/api/crm/reminders`.
- Existing `/calendar` is a table backed by `/api/crm/calendar-events`.
- Glide Data Grid has date/time header icons and custom cell renderers, but no native calendar view, month grid, week timeline, agenda grouping, drag scheduling, or event layout engine. Use it for editable event tables, not the primary calendar.

## Target Design

### General Today Calendar

The `/today` page becomes the operator/director calendar dashboard. It should combine:

- open reminders, shown at their `dueAt`;
- CRM calendar events, shown from `startsAt` to `endsAt`;
- future LangGraph-created reminders from Telegram, agents, and manually entered tasks;
- source badges so the user can see whether an item came from manual input, Telegram, LangGraph, calendar sync, or local CRM.

The first implementation should include Month, Week, Day, and Agenda switches. Month gives the big overview; Week and Day show denser operational work; Agenda gives a compact list.

### Entity Calendars

Lead and client detail calendars should be built after the general calendar feed exists. They should use the same feed API with filters:

- `leadId=<id>` for lead calendar;
- `clientId=<id>` for client calendar;
- later `coldTargetId=<id>` if needed.

The entity calendar can start as a compact agenda/sidebar, then evolve into a mini month/week view when record detail pages exist.

### Data/API Contract

Create a calendar feed API returning normalized items:

```ts
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
```

Initial query params:

- `workspaceId`, defaulting to the current `LIGHTCRM_WORKSPACE_ID`;
- `from` and `to` ISO timestamps for view ranges;
- optional `leadId`, `clientId`, `coldTargetId`;
- `includeArchived=false` by default.

### LangGraph/Telegram Integration Direction

The orchestrator should continue to emit `create_reminder` plans. The execution layer should persist those as `Reminder` records with `sourceChannel` such as `telegram`, `langgraph`, or `agent`. Once persisted, those records automatically appear in the general calendar feed and any matching lead/client calendar.

## Implementation Tasks

### Task 1: Calendar Feed Read Model

**Files:**

- Create: `apps/web/app/api/crm/calendar-feed/route.ts`
- Optional test later: `apps/web/app/api/crm/calendar-feed/route.test.ts`

- [ ] Read `reminder`, `calendarEvent`, `lead`, `client`, and `coldTarget` records from `getCrm().listRecords`.
- [ ] Filter reminders by `dueAt` and events by `startsAt`/`endsAt` overlapping the requested range.
- [ ] Filter by optional `leadId`, `clientId`, or `coldTargetId`.
- [ ] Normalize records into `CalendarFeedItem`.
- [ ] Resolve related labels and hrefs from loaded entities.

### Task 2: Calendar UI Component

**Files:**

- Create: `apps/web/app/components/CrmCalendar.tsx`
- Modify: `apps/web/app/globals.css`

- [ ] Build a client component that fetches `/api/crm/calendar-feed`.
- [ ] Add Month, Week, Day, and Agenda view controls.
- [ ] Add previous/today/next navigation.
- [ ] Render day cells with event/reminder chips and source/kind badges.
- [ ] Render agenda list grouped by date.
- [ ] Support dark mode with existing CSS variables.
- [ ] Keep mobile layout usable by collapsing dense grids into agenda-friendly content.

### Task 3: Today Page Replacement

**Files:**

- Modify: `apps/web/app/today/page.tsx`
- Modify: `apps/web/app/calendar/page.tsx`

- [ ] Replace `/today` table with the general `CrmCalendar`.
- [ ] Keep `/calendar` as an editable table of raw calendar events for now.
- [ ] Use page copy that clearly says Today is the unified schedule.

### Task 4: Entity Calendar Hooks

**Files:**

- Future: lead/client detail pages once they exist.
- Future: `apps/web/app/components/EntityCalendarPanel.tsx`

- [ ] Add a compact calendar panel that accepts `leadId` or `clientId`.
- [ ] Render feed data filtered by entity.
- [ ] Provide a small "add reminder/event" action.

### Task 5: Creation and Agent Wiring

**Files:**

- Future: orchestrator execution endpoint.
- Future: Telegram bot command execution path.
- Existing: `apps/web/app/api/crm/reminders/upsert/route.ts`
- Existing: `apps/web/app/api/crm/calendar-events/upsert/route.ts`

- [ ] Ensure Telegram/LangGraph reminder actions persist via `upsertReminder`.
- [ ] Store `sourceChannel` so calendar chips explain where work came from.
- [ ] Add optional event creation from reminder conversion when needed.

### Task 6: Verification

- [ ] Run `pnpm --filter @lightcrm/web typecheck`.
- [ ] Run `pnpm -r test` if core logic changes.
- [ ] Run `pnpm build` before pushing.
- [ ] Verify `/today` and `/calendar` respond locally.
- [ ] Manually inspect light/dark rendering.

## First Slice Acceptance Criteria

- `/today` shows a real calendar UI, not a table.
- `/today` combines reminders and calendar events in one feed.
- Month, Week, Day, and Agenda switches are available.
- Calendar respects dark mode.
- Existing `/calendar` event table still works.
- Typecheck passes.
