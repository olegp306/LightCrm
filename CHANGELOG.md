# Changelog

All notable LightCrm releases are documented here. Starting with `0.2.0`, every version bump must include a changelog entry.

## 0.3.34 - 2026-06-15

### Added

- Added a separate Telegram `/crm` command that returns a single CRM launcher button without mixing in lead search results.
- Added a separate Telegram `/search` command that lists the latest six leads and opens the standard Telegram lead card from lead-number buttons.
- Added a Leads web API and UI action for sending one or more selected lead cards to TG from desktop table selection.
- Added a compact mobile lead-card send-to-TG button so operators can push the currently viewed lead card back into Telegram.

### Changed

- Reused the existing compact Telegram lead-card structure for searched leads, including CRM, offer, summary, and downloads actions.
- Normalized recent-lead status mapping before sending Telegram cards, keeping API string values inside the core lead status contract.
- Converted relative document download URLs to full app URLs when sending lead cards to TG.

### Verification

- `pnpm --filter @lightcrm/telegram-bot test`
- `pnpm --filter @lightcrm/telegram-bot typecheck`
- `pnpm --filter @lightcrm/ui typecheck`
- `pnpm --filter @lightcrm/web typecheck`

## 0.3.33 - 2026-06-14

### Added

- Added a manual `Ball` handoff column for Leads so operators can double-click a cell to move initiative between `us` and `client` with an arcing ball animation.
- Added selectable handoff ball icons for football, basketball, volleyball, and hot potato through a compact desktop-only toolbar popover.
- Added real local MP3 handoff sounds from Mixkit assets, with one fixed sound per ball type and a persistent sound on/off toggle.

### Changed

- Styled the handoff cell without boxed `us`/`client` labels, keeping the cell lighter while preserving the curved handoff path.
- Added a gold insight-style hover glow and placeholder tooltip when the ball is on the `us` side, preparing the cell for future suggested next actions.
- Reset the Leads table preference key to include the new `Ball` column in the default layout.

### Verification

- `pnpm --filter @lightcrm/web typecheck`
- Local smoke: `/leads` returned HTTP 200.
- Local smoke: all four handoff MP3 assets returned HTTP 200 as `audio/mpeg`.

## 0.3.32 - 2026-06-14

### Added

- Added a reusable Details popup flow for non-lead tables that have an update endpoint, starting with Clients.
- Added `/api/crm/clients/update` so client records can be edited from the shared table Details popup.

### Changed

- Generalized table Details saving so each table can choose its record id field instead of assuming `leadId`.
- Restored the Leads Details popup as a full edit form with all configured fields visible, while keeping compact field omission only for summary-style cards.
- Simplified non-lead Details popups so they show the editable record form without lead-only offer/download/history sections.

### Verification

- `pnpm --filter @lightcrm/web typecheck`
- Local smoke: `/clients` returned HTTP 200.
- Local smoke: `/api/crm/clients/update` returned `404 Client not found` for a missing client id.

## 0.3.31 - 2026-06-14

### Changed

- Restored the canonical Leads table column set and order by resetting the saved table preference key to `leads.v6`.
- Made the lead details popup skip empty fields entirely so blank labels and empty controls do not inflate the card.
- Moved the mobile backup action into the top sidebar row between `LightCrm` and the light/dark mode toggle, with a muted borderless style.

### Verification

- `pnpm --filter @lightcrm/web typecheck`

## 0.3.30 - 2026-06-14

### Added

- Added commercial-offer readiness separation between price-critical fields and document-completion fields, including manual gross price support for offers that cannot be priced automatically.
- Added LangGraph/TG support for filling offer fields from replies to lead or offer prompts, so operators can add BGF, project type, manual gross price, client/project/address data, and continue toward offer generation without creating a new lead.
- Added specific generated-offer summaries that preserve offer version, price, pricing mode, missing fields, and a concise promise snapshot for later comparison in lead document history.
- Replaced the desktop lead Details side drawer with a centered lead-card modal that mirrors the Telegram/mobile card structure, with editable lead fields, missing-offer chips, summary, downloads, and calendar history.
- Made mobile lead cards open the same lead-card modal for review/editing while preserving local actions for copy, downloads, and document preview.

### Changed

- Offer generation now reports missing price fields before template availability, producing a clearer Telegram prompt when the commercial-offer number is not ready.
- Lead-card details now use the table field order for the editable/viewable top section and keep document and calendar history under compact sections.

### Verification

- `pnpm --filter @lightcrm/core test`
- `pnpm --filter @lightcrm/orchestrator test`
- `pnpm --filter @lightcrm/telegram-bot test`
- `pnpm --filter @lightcrm/core typecheck`
- `pnpm --filter @lightcrm/orchestrator typecheck`
- `pnpm --filter @lightcrm/telegram-bot typecheck`
- `pnpm --filter @lightcrm/web typecheck`

## 0.3.28 - 2026-06-13

### Added

- Added a read-only CRM Excel backup export from the sidebar `backup` button with `Календарь`, `Клиенты`, and `Лиды` sheets, linked CRM URLs, nearest calendar dates, lead/client relationships, document counts, and a `Сегодня` calendar helper column.
- Added a reusable core backup model with coverage for the cross-linked export sheet contract.
- Added explicit Telegram follow-up handling so review requests can be completed by replying with a lead/client reference after the original calendar or lead action needs clarification.

### Changed

- Improved Telegram calendar date parsing for relative weekday phrases and stricter calendar-event date validation.
- Extended orchestrator settings/schema options for clarification and follow-up behavior.
- Forced `LIGHTCRM_REPOSITORY=memory` to use the memory CRM repository even when a local `DATABASE_URL` is present, making explicit memory-mode tests reliable.

### Fixed

- Fixed dark-theme table column selection colors so selected columns remain readable instead of turning white.
- Preserved table column sizing stability when selection and hover states change.

### Verification

- `pnpm typecheck`
- `pnpm test`
- Local XLSX smoke test: downloaded `/api/crm/backup` and verified workbook sheets `Календарь`, `Клиенты`, `Лиды`.

## 0.3.27 - 2026-06-13

### Changed

- Reworked Telegram lead cards so the lead number is followed by one bold line containing `client  lead name`, with the separate `Client` field removed.
- Removed `Full summary` from Telegram cards and kept a short cleaned intake summary without TG source/thread boilerplate.
- Adjusted Telegram card calendar and download sections: one item is shown inline, while multiple items are shown in an expandable drawer.

### Verification

- `pnpm --filter @lightcrm/telegram-bot test -- --runInBand`
- `pnpm --filter @lightcrm/telegram-bot typecheck`
- `pnpm --filter @lightcrm/telegram-bot build`
- `pnpm test`
- `pnpm typecheck`

## 0.3.26 - 2026-06-13

### Changed

- Telegram attachment-only messages no longer attach silently to the active lead. The bot now asks whether to create a new lead or add files to the active lead, while explicit replies and text-guided follow-ups still use the active lead context.
- Added pending Telegram attachment decisions so inline choices can resume the original file intake as either a new lead or an active-lead attachment.

### Verification

- `pnpm --filter @lightcrm/telegram-bot test -- --runInBand`
- `pnpm typecheck`
- `pnpm --filter @lightcrm/telegram-bot build`
- `pnpm test`

## 0.3.25 - 2026-06-13

### Changed

- Reworked Telegram lead cards to mirror the mobile web card structure: readable lead number first, larger lead name, compact fields, missing-offer state, summary, full summary, and documents.
- Added Telegram HTML expandable quotes for `Missing for offer`, `Summary`, `Full summary`, and `Downloads: n items`, while keeping CRM/offer/undo actions available as inline buttons.
- Included lead document previews and summaries directly in Telegram cards when document data is available.

### Verification

- `pnpm --filter @lightcrm/telegram-bot test`
- `pnpm --filter @lightcrm/telegram-bot typecheck`

## 0.3.24 - 2026-06-13

### Added

- Replaced the mobile web lead list with compact lead cards showing lead number, lead name, client, description, offer-missing fields, clipped summary, and collapsible `Downloads: n items` document previews.
- Added tap-to-copy behavior for the mobile lead card header so tapping the lead number/name copies the readable lead number and shows an inline confirmation.

### Changed

- Shortened generated lead summaries for Telegram/mobile use and capped full summaries for compact lead cards.
- Reduced the default leads table column set to the canonical operational fields while keeping Documents and Calendar visible.
- Made table tooltips follow the selected table font size.

### Verification

- `pnpm --filter @lightcrm/ui typecheck`
- `pnpm --filter @lightcrm/web typecheck`
- `pnpm --filter @lightcrm/core test`
- `pnpm --filter @lightcrm/orchestrator test`
- `pnpm --filter @lightcrm/telegram-bot test`
- `pnpm typecheck`

## 0.3.23 - 2026-06-13

### Fixed

- Preserve multi-intent Telegram requests that introduce a new lead and also ask for a meeting, so the bot creates the lead and links the calendar event to it.

### Verification

- `pnpm --filter @lightcrm/orchestrator test`
- `pnpm --filter @lightcrm/telegram-bot test`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`

## 0.3.22 - 2026-06-13

### Added

- Added executable Telegram `create_meeting` handling that creates CRM calendar events from recognized meeting/calendar requests.

### Fixed

- Normalize Telegram reminder and calendar datetimes to strict ISO UTC before calling CRM APIs, including timezone-free local values interpreted as Europe/Paris.

### Verification

- `pnpm --filter @lightcrm/orchestrator test`
- `pnpm --filter @lightcrm/telegram-bot test`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`

## 0.3.21 - 2026-06-12

### Changed

- Cut a clean deployment baseline after verifying `main`, `origin/main`, open PRs, and unmerged remote branches for `olegp306/LightCrm`.

### Verification

- `pnpm test`
- `pnpm typecheck`

## 0.3.20 - 2026-06-12

### Fixed

- Rebuild Telegram lead intake summaries from all active lead documents after each additional attachment intake, so multi-message file sets show the full file count and every semantic file summary in the latest lead summary.

### Verification

- `pnpm --filter @lightcrm/core test`
- `pnpm test`
- `pnpm typecheck`

## 0.3.19 - 2026-06-12

### Changed

- Cut a clean test-stand release for the full five-set physical Telegram intake verification run.

### Verification

- `pnpm test`
- `pnpm typecheck`

## 0.3.18 - 2026-06-12

### Fixed

- Normalize Telegram `audio/mp4` clipboard uploads from `.mp4` to `.m4a` before OpenAI transcription so semantic audio summaries do not fall back to generic placeholders.

### Verification

- `pnpm --filter @lightcrm/telegram-bot test`
- `pnpm --filter @lightcrm/telegram-bot typecheck`
- `pnpm test`
- `pnpm typecheck`

## 0.3.17 - 2026-06-12

### Added

- Added semantic PDF analysis for Telegram attachments by extracting PDF text and summarizing it through the OpenAI JSON analyzer.
- Added semantic audio/voice analysis for Telegram attachments by transcribing audio through OpenAI and summarizing the transcript.
- Added support for semantic summaries of text-like document attachments.

### Verification

- `pnpm --filter @lightcrm/telegram-bot test`
- `pnpm --filter @lightcrm/telegram-bot typecheck`
- `pnpm test`
- `pnpm typecheck`

## 0.3.16 - 2026-06-12

### Fixed

- Ignore placeholder semantic facts such as `not explicitly stated` when naming Telegram attachment-only leads.

### Verification

- `pnpm --filter @lightcrm/telegram-bot test`
- `pnpm typecheck`

## 0.3.15 - 2026-06-12

### Fixed

- Treat Telegram source markers as note-field boundaries so `Budget EUR` reads back as the numeric budget only.
- Rename attachment-only draft leads from extracted project type when the semantic graph does not provide a separate project name.

### Verification

- `pnpm --filter @lightcrm/telegram-bot test`
- `pnpm typecheck`

## 0.3.14 - 2026-06-12

### Fixed

- Read tabular lead note fields with uppercase acronyms such as `Budget EUR` without swallowing the following source marker.

### Verification

- `pnpm typecheck`

## 0.3.13 - 2026-06-12

### Fixed

- Apply semantic attachment facts to the current draft lead even when the semantic graph asks for review instead of returning an explicit `update_lead` action.
- Avoid a pre-upload empty lead update for attachment-only messages sent to an active Telegram lead.

### Verification

- `pnpm --filter @lightcrm/telegram-bot test`
- `pnpm --filter @lightcrm/telegram-bot typecheck`

## 0.3.12 - 2026-06-12

### Added

- Added Telegram image attachment analysis via OpenAI vision when TG Intake Policy allows attachment analysis.
- Added a post-upload enrichment pass so attachment-only draft leads are updated with extracted project, area, location, and budget facts.
- Added regressions for semantic image summaries enriching draft leads and for OpenAI image-analysis payloads.

### Changed

- Preserve existing lead notes on TG lead updates by sending structured tabular fields instead of replacing the notes blob.
- Persist uploaded attachment `longSummary` values from multipart TG uploads.

### Verification

- `pnpm --filter @lightcrm/telegram-bot test`
- `pnpm typecheck`
- `pnpm test`

## 0.3.11 - 2026-06-12

### Changed

- Let attachment-only TG messages create draft leads instead of stopping before the intake pipeline.
- Pass the generated attachment intake summary into the first uploaded TG attachment so saved files are not recorded with empty context.

### Added

- Added Telegram bot regressions for PDF-only and image-only intake creating draft leads and saving attachments.

### Verification

- `pnpm --filter @lightcrm/telegram-bot test`
- `pnpm --filter @lightcrm/telegram-bot typecheck`
- `pnpm test`
- `pnpm typecheck`

## 0.3.10 - 2026-06-12

### Project Snapshot

LightCrm now has a configurable LangGraph intake layer for safer TG lead creation and commercial-offer readiness. Operators can tune how strict TG intake should be, define which offer fields matter, and teach the system internal project people with aliases so directors, operators, and testers are not mistaken for clients.

### Added

- Added TG Intake Policy settings for action strictness, attachment analysis, attachment-only protection, meaningful-content requirements, bundling delay, and undo visibility for write actions.
- Added Offer Readiness settings with editable field map, aliases, source hints, confidence thresholds, required flags, and auto-fill flags for commercial offer preparation.
- Added Project People aliases in settings so one internal person can have several names across TG, WhatsApp, Russian, English, and testing contexts.
- Added LangGraph prompt wiring for TG intake policy, project people aliases, and offer-readiness field extraction.

### Changed

- Made LangGraph lead creation more conservative for file-only TG messages while still allowing explicit draft lead intake when the message meaning is clear.
- Blocked attachment-only TG intake without active lead context and asks for context instead of creating stray draft leads.
- Added safe undo buttons to TG write-result cards; create undo still archives the new lead, while update undo is guarded until full rollback is connected.
- Fixed Project People editing so text fields no longer lose focus after each typed character.

### Verification

- `pnpm --filter @lightcrm/telegram-bot test`
- `pnpm --filter @lightcrm/telegram-bot typecheck`
- `pnpm --filter @lightcrm/orchestrator test`
- `pnpm --filter @lightcrm/orchestrator typecheck`
- `pnpm --filter @lightcrm/web typecheck`

## 0.3.9 - 2026-06-12

### Project Snapshot

LightCrm now has cleaner TG-facing language across intake, lead summaries, document names, logs, and CRM surfaces. The release also preserves the latest operator workflow improvements: compact lead cards with document drawers, Project People settings for LangGraph context, tighter Today event creation, safer document preview actions, and no sample-data flicker while live data loads.

### Added

- Added Project People settings so LangGraph can treat known operators, directors, developers, and testers as internal context instead of external clients.
- Added compact TG lead-card document access with a `Downloads` drawer and per-document links.
- Added display helpers that show `TG` in table/calendar/source UI while keeping the internal `telegram` integration value intact.

### Changed

- Replaced user-facing `Telegram` wording with `TG` in new summaries, notes, bot replies/logs, calendar text, settings labels, and default attachment file names such as `TG-photo-...`.
- Tightened document preview and toolbar button styling so actions fit better in desktop table workflows.
- Reduced live-data flicker by avoiding temporary sample rows while CRM tables are loading.
- Made Today event creation fields more visible and easier to scan.

### Verification

- `pnpm --filter @lightcrm/telegram-bot test`
- `pnpm --filter @lightcrm/telegram-bot typecheck`
- `pnpm --filter @lightcrm/orchestrator test`
- `pnpm --filter @lightcrm/orchestrator typecheck`
- `pnpm --filter @lightcrm/core test`
- `pnpm --filter @lightcrm/db test`
- `pnpm --filter @lightcrm/ui typecheck`
- `pnpm --filter @lightcrm/web typecheck`

## 0.3.8 - 2026-06-12

### Project Snapshot

LightCrm now opens lead links by the readable lead number, such as `L-2026-006`, while still resolving the real internal CRM record behind the scenes. Telegram CRM buttons, calendar links, and mobile lead-card focus now use this cleaner handoff without leaving a row selected for deletion.

### Added

- Added readable lead-code CRM URLs for Telegram CRM buttons when a lead has a public code.
- Added localhost callback support that keeps the internal lead id hidden in callback data while returning a short readable lead URL.
- Added web resolution for `/leads?leadId=L-...` so the table can focus the matching record by code.
- Added Today calendar resolution for lead-code query params before filtering or creating lead-linked events.
- Added a compact mobile lead-card title showing the public lead number.
- Added a Telegram semantic intake implementation plan covering reply bundles, attachment analysis, and offer error recovery.

### Changed

- Opening a lead from a CRM link now scrolls to and softly highlights the row without selecting it for bulk actions.
- Calendar inspector lead links now point back to `/leads?leadId=<lead-code>` where a code is available.

### Verification

- `pnpm --filter @lightcrm/telegram-bot test`
- `pnpm --filter @lightcrm/ui typecheck`
- `pnpm --filter @lightcrm/web typecheck`

## 0.3.7 - 2026-06-11

### Project Snapshot

LightCrm can now resolve clients automatically while saving leads from the web table or Telegram/API flows. When a lead has a phone number or email, the backend can create a new client, link an existing unique client, or leave the lead unlinked when contact details point to conflicting clients.

### Added

- Added backend client resolution for lead saves based on normalized email and phone values.
- Added automatic client creation when a saved lead has unique contact details and no matching client.
- Added automatic lead-to-client linking when exactly one active client matches the lead email or phone.
- Added conflict audit logging when email and phone match multiple clients, avoiding unsafe overwrites.
- Added table payload mapping so `client.phone` and `client.email` lead-table columns save as native lead contact fields.

### Changed

- Switched lead create/update API routes to use client-aware lead saving.
- Matched clients may be enriched only in empty fields; existing client contact/company fields are not overwritten.

### Verification

- `pnpm --filter @lightcrm/core test`
- `pnpm --filter @lightcrm/core typecheck`
- `pnpm --filter @lightcrm/ui test`
- `pnpm --filter @lightcrm/ui typecheck`
- `pnpm --filter @lightcrm/web typecheck`

## 0.3.6 - 2026-06-11

### Project Snapshot

LightCrm Today calendar navigation is cleaner and safer to use. Month navigation now uses stable icon buttons instead of glyphs that could render as broken symbols, and the month view has direct month/year controls next to the visible calendar range.

### Added

- Added month-level previous/next controls next to the Today calendar month heading.
- Added direct month and year selectors for the Today month calendar.
- Added Telegram bot coverage for public HTTP CRM URLs so non-local HTTP deployments still send an inline CRM URL button instead of a localhost callback.

### Changed

- Replaced fragile calendar navigation glyphs with lucide chevron icons.
- Kept Today calendar month controls compact on mobile by letting month/year selectors fill the available width.

### Verification

- `pnpm --filter @lightcrm/web typecheck`
- `pnpm --filter @lightcrm/telegram-bot test`
- `pnpm --filter @lightcrm/telegram-bot typecheck`

## 0.3.5 - 2026-06-11

### Project Snapshot

LightCrm now has safer production Telegram handoff behavior. Telegram CRM buttons can open the deployed CRM as a Telegram WebApp when a public HTTPS app URL is configured, and newly created leads include an immediate undo action for accidental draft creation.

### Added

- Added Telegram `web_app` CRM buttons for production HTTPS CRM URLs.
- Added an `undo` inline button to newly created Telegram leads.
- Added Telegram undo handling that archives the created lead through the CRM archive API.
- Added `.env.example` guidance for `NEXT_PUBLIC_APP_URL` as the public HTTPS CRM URL used by Telegram WebApp buttons.

### Changed

- Kept local CRM URLs on the existing callback/link fallback path so localhost testing continues to work.
- Cleared the active Telegram lead context after undo so later attachments do not keep linking to the archived draft.

### Verification

- `pnpm --filter @lightcrm/telegram-bot test`
- `pnpm --filter @lightcrm/telegram-bot typecheck`

## 0.3.4 - 2026-06-11

### Project Snapshot

LightCrm now has a cleaner operator workspace shell and more polished table/calendar controls. The release focuses on making the day-to-day CRM surface calmer: primary navigation highlights Today, Clients, and Leads; advanced tables move behind a secondary drawer; the Today calendar uses a stable split layout; and table columns can persist typographic emphasis.

### Added

- Added persisted per-column typography preferences for CRM tables.
- Added selected-column controls for medium weight, super-bold weight, and italic text styling.
- Added direct `lucide-react` navigation icons in the web shell so sidebar icons match the cleaner reference style.
- Added a focused sidebar navigation grouping: primary operator tabs remain visible, while secondary tables live under `More tables`.

### Changed

- Changed column bold behavior from a binary toggle to a three-state cycle: normal, medium, and super.
- Changed Today month view into a stable split layout with the month calendar on the left and the selected-day event inspector on the right.
- Moved the month-view event creation form under the calendar so long event lists no longer stretch the calendar grid.
- Updated calendar lead selection labels to show public lead number, client/name, and project without exposing internal ids first.
- Renamed secondary navigation labels to `StorageTable`, `CallTargetTable`, and `CalendarTable`.
- Replaced CSS-drawn sidebar icons with lucide icons for Today, Clients, Leads, StorageTable, Settings, CallTargetTable, Outreach, and CalendarTable.

### Fixed

- Fixed Today calendar month grid stretching when the selected day contains many events.
- Fixed sidebar visual focus so operators see Today, Clients, and Leads first instead of a long flat navigation list.
- Kept compatibility with previously saved `bold: true` column preferences by treating them as super-bold.

### Verification

- `pnpm --filter @lightcrm/web typecheck`
- `pnpm --filter @lightcrm/ui typecheck`
- `pnpm --filter @lightcrm/ui test`
- Browser smoke checks for `/leads` and `/today`

## 0.3.3 - 2026-06-11

### Project Snapshot

LightCrm is now closer to a showable operator CRM build: production-export data can be reviewed in the current table model, Telegram/LangGraph intake can create draft leads from incomplete multi-file context, lead cards expose documents and schedules more compactly, and calendar work is visible both in Today and inside lead/table views.

### Added

- Added draft-first Telegram intake behavior so incomplete incoming messages and attachments can still be saved as leads for later enrichment.
- Added multi-attachment Telegram intake feedback, including the short `reviewing the files, back shortly` acknowledgement for larger batches.
- Added Telegram CRM buttons for newly created or opened leads so users can jump directly into the web lead view.
- Added reply-to-lead-card handling groundwork so Telegram replies to a lead card can be interpreted as updates, notes, schedules, or follow-up actions for that lead.
- Added lead and client public identifiers such as `L-2026-001` and `C-2026-001`, generated from year-based incremental counters.
- Added compact lead-card summary support with short summary, expandable full summary, and summary history plumbing.
- Added a Documents section to the lead details card, reusing the table document-chip visual language for preview, download, summary inspection, and commercial offer review.
- Added CRM settings groundwork for commercial offer templates, honorarium tables, and generated-offer readiness.
- Added manual calendar-event creation from the Today calendar with selected-date prefill and optional lead linking.
- Added table/client-cell client reassignment affordance for leads with an in-cell focused picker.

### Changed

- Improved the semantic LangGraph settings layer so more orchestration behavior is driven from Settings UI instead of code-level phrase or regex rules.
- Improved Telegram attachment handling so files, captions, forwarded context, and operator instructions can be treated as one intake context rather than isolated leads.
- Improved lead table defaults by returning to the compact intended default column set and hiding imported/internal fields from default views.
- Improved the Details entry point in desktop tables so it appears near the selected cell with a softer, less intrusive hover treatment.
- Improved the Today month view: lighter borders, selected-day styling, selected-date-aware event creation, and a wider timeline/inspector panel.
- Improved mobile Today calendar layout for iPhone-sized screens with a compact month grid and event list.
- Improved table calendar chips so they align visually with Today calendar events, use lighter borders, show date/time consistently, and collapse when there are too many events.
- Improved document chips and badges with muted file-type colors, tighter spacing, stable tooltips, and preview-based delete confirmation.
- Improved selected-record actions by removing `Regenerate`, renaming `Generate` to `Generate offer`, and making commercial-offer readiness errors more specific.
- Improved desktop and mobile shell polish, including version display in place of the old workspace label and mobile navigation/header density.

### Fixed

- Fixed Telegram intake cases where one text message plus several files created several draft leads instead of preserving the intended shared intake context.
- Fixed server-side Telegram processing so failures can be surfaced back to Telegram with a short developer-notification message.
- Fixed tooltip placement around document/calendar chips so popups do not get clipped by the top table toolbar.
- Fixed calendar border weight in Today so the month grid uses lighter, semi-transparent borders.
- Fixed lead table action buttons so `Generate offer`, `Refresh`, `Delete`, and close controls fit on one toolbar row.
- Fixed document deletion UX by removing table-cell delete crosses and keeping delete inside the preview confirmation flow.

### Verification

- `pnpm --filter @lightcrm/web typecheck`
- `pnpm --filter @lightcrm/ui typecheck`
- `pnpm --filter @lightcrm/ui test`
- `pnpm --filter @lightcrm/core test`
- `pnpm --filter @lightcrm/telegram-bot test`

## 0.3.2 - 2026-06-10

### Project Snapshot

LightCrm now routes CRM intake through a semantic LangGraph orchestration layer. The orchestrator reads the whole message, resolves target context, extracts fields with evidence, validates safety, and plans CRM actions from structured JSON instead of hardcoded phrase matching.

### Added

- Added a semantic LangGraph pipeline with `collect_input`, `build_context`, `classify_intent`, `resolve_target`, `extract_entities`, `validate_action`, `plan_action`, and `execution_gate` nodes.
- Added strict Zod schemas for semantic intent classification, target resolution, entity extraction, and validation decisions.
- Added an OpenAI-compatible JSON LLM provider with schema validation and clean error handling.
- Added runtime Settings UI for semantic prompts, taxonomy, required fields, thresholds, and confirmation policy.
- Added relationship context plumbing for recent CRM leads/messages.
- Added Telegram dry-run formatting for semantic intents and target ids.
- Added guard coverage to prevent the old hardcoded rule parser from returning.
- Added `docs/langgraph-semantic-settings.md` explaining each semantic setting.

### Changed

- Routed default CRM orchestration through semantic mode.
- Kept `semanticMode: false` as a safe review-only fallback rather than a phrase parser.
- Moved lead/reminder auto-create policy into semantic confirmation settings.
- Populated legacy compatibility facts from semantic extracted entities when type-safe.
- Removed visible Settings UI controls for old new-lead, mail-analysis, and reminder phrase lists.

### Removed

- Removed active Russian phrase arrays, person/city lists, and regex-based business intent/fact extraction from the orchestrator.

### Verification

- `pnpm --filter @lightcrm/orchestrator test`
- `pnpm --filter @lightcrm/orchestrator typecheck`
- `pnpm --filter @lightcrm/telegram-bot test`
- `pnpm --filter @lightcrm/web typecheck`

## 0.3.1 - 2026-06-10

### Project Snapshot

LightCrm now has a clearer table search experience. When users search inside CRM tables, the search field visually indicates the active filtered state, and matching text fragments are highlighted directly inside table cells without coloring the entire cell.

### Changed

- Improved the table search control so active searches use stronger text weight, larger input text, and an accent focus glow.
- Added inline search-result highlighting in Glide Data Grid text cells, including dark-mode-aware highlight colors.
- Kept search highlighting scoped to the matched text fragment rather than the whole table cell.

### Verification

- `pnpm --filter @lightcrm/ui typecheck`
- `pnpm --filter @lightcrm/web typecheck`
- Local `/clients` and `/leads` routes respond successfully on the development server.

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
