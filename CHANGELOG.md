# Changelog

All notable LightCrm releases are documented here. Starting with `0.2.0`, every version bump must include a changelog entry.

## 0.3.0 - 2026-06-09

### Project Snapshot

LightCrm now has the first operational calendar layer. The calendar is treated as a CRM scheduling surface rather than only a raw table: reminders and CRM calendar events can be viewed together on Today, and lead rows can expose their own upcoming calendar work directly inside the Leads table.

### Added

- Added `/api/crm/calendar-feed`, a normalized read-model API that combines `Reminder` and `CalendarEvent` records into one calendar feed.
- Added support for calendar feed filtering by `leadId`, `clientId`, `coldTargetId`, `from`, and `to`.
- Added related-record resolution in the calendar feed, including related entity type, id, display label, and href.
- Added a dedicated `CrmCalendar` client component with Month, Week, Day, and Agenda views.
- Replaced the `/today` table with a unified operational calendar for reminders, scheduled events, Telegram intake, and LangGraph agent work.
- Added query-filtered Today calendars such as `/today?leadId=<id>`.
- Added a `calendar` table value kind in the UI package.
- Added a compact calendar-cell renderer for the Leads table, showing upcoming lead events/reminders as small chips.
- Added calendar-feed enrichment to live table loading so lead rows can display related calendar work.
- Added a calendar implementation plan at `docs/superpowers/plans/2026-06-09-crm-calendar-layer.md`.

### Changed

- Kept `/calendar` as the raw editable calendar-event table while `/today` becomes the higher-level schedule view.
- Updated the Leads default table key to `leads.v3` so the new Calendar column appears in the default column order.
- Improved table value handling so document arrays and calendar arrays are normalized, displayed, exported, and rendered separately.

### Verification

- `pnpm --filter @lightcrm/ui typecheck`
- `pnpm --filter @lightcrm/web typecheck`
- `pnpm --filter @lightcrm/ui test`
- `pnpm build`
- Local `/leads`, `/today?leadId=seed_lead_nora`, and `/api/crm/calendar-feed` routes respond successfully on the development server.

## 0.2.0 - 2026-06-09

### Project Snapshot

LightCrm is a lightweight, table-first CRM workspace for managing clients, leads, documents, outreach, reminders, and orchestration-assisted intake flows. The product is built as a TypeScript monorepo with a Next.js web app, reusable UI package, Prisma-backed database layer, storage abstraction, LangGraph-oriented orchestrator package, and a Telegram bot package.

The current product focuses on fast CRM work inside rich tables: users can inspect leads and clients, edit values inline, configure visible columns, resize and reorder columns, sort by column, export CSV, add records inline, and work with linked client fields inside lead tables. Table preferences persist locally, including column widths, order, hidden columns, table font scale, and relation highlight color.

### Added

- Added table-first web CRM pages for clients, leads, storage, settings, cold targets, outreach, calendar, and today views.
- Added a reusable Glide Data Grid table component with inline editing, column menus, column sorting, column resizing, column reordering, CSV export, mobile list fallback, persisted table preferences, and configurable table font scale.
- Added inline record creation for wide web tables: adding a record now appends a draft row directly in the table and focuses the first editable cell.
- Added row selection behavior with per-row checkbox selection on row markers, a toolbar-level selected-record action area, single-record delete flow with confirmation, and multi-record `Try to merge` placeholder.
- Added linked-table visual treatment for client fields shown inside leads, including configurable relation color, soft boundary styling, compact group header, and explanatory tooltip.
- Added dark mode support across the shell, table surface, controls, modals, tooltips, forms, and document UI, with the theme switcher moved to the bottom of the sidebar.
- Added a storage/document workflow for leads:
  - document column rendering with compact file cards and extension badges;
  - click-to-preview and download actions;
  - multi-file upload from the lead table;
  - one modal with per-file summaries;
  - async upload indicator in the table cell;
  - tooltip metadata for file name, summary, and creation date;
  - support for local storage and S3-compatible Cloudflare R2 configuration placeholders.
- Added storage package support for S3-compatible upload wiring and related tests.
- Added lead intake upload API wiring for document attachments.
- Added archive API support for table delete actions.
- Added Telegram bot package wiring for local bot polling and LightCrm API calls.
- Added LangGraph-oriented orchestrator settings groundwork and runtime settings UI for experimentation.

### Changed

- Improved the main layout by removing the top theme header row and placing the light/dark toggle in the sidebar footer.
- Improved bulk action controls so selected-record actions appear before search without causing the table to jump.
- Improved the selected-record delete and clear buttons to fit cleanly inside the toolbar.
- Centered lead interest/temperature text in the table while keeping it as plain text.
- Improved document-cell spacing, hover behavior, upload trigger behavior, and compact rendering when several files are attached.
- Improved tooltips so linked-table and document metadata overlays appear in a more predictable position.
- Improved `.env.example` and ignore rules for local storage and integration placeholders.

### Fixed

- Fixed persisted column widths after refresh.
- Fixed arbitrary multi-row selection such as selecting rows 2, 7, and 9 independently.
- Fixed document upload handling so multiple selected files are uploaded as a batch instead of opening one dialog per file.
- Fixed document filename display issues and extension badge styling for image, PDF, Excel, and generic document types.
- Fixed table action button sizing and text clipping in the selected-record toolbar.

### Verification

- `pnpm --filter @lightcrm/ui typecheck`
- `pnpm --filter @lightcrm/web typecheck`
- Local `/leads` and `/clients` routes respond successfully on the development server.
