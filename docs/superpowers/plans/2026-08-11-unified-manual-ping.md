# Unified Manual Ping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one manual Ping action and isolated protocol history for Leads, Cold Targets, and Clients.

**Architecture:** Reuse the existing `OutreachTouch` table. Add one validated manual-touch API that links exactly one entity and one channel, plus one protocol API that reads the entity-specific history. Reuse one UI channel picker for the table Ping cell and details card; the existing automatic Ping becomes the newest touch date.

**Tech Stack:** Next.js App Router, Prisma, Zod, React, Glide Data Grid, Vitest, TypeScript.

## Global Constraints

- Channels are exactly `email`, `linkedin`, `phone`, `telegram`, and `whatsapp`.
- The actor comes from the authenticated CRM session; the UI never asks the user to type or select an actor.
- A touch is linked to exactly one Lead, Cold Target, or Client.
- Protocol entries show channel, actor, and date/time.
- Existing campaign-generated Cold Target touches remain unchanged.

---

### Task 1: Domain Helpers And API Contract

**Files:**
- Create: `apps/web/app/api/crm/manual-ping/route.ts`
- Create: `apps/web/app/api/crm/manual-ping/route.test.ts`
- Modify: `apps/web/app/api/crm/_shared/outreach-columns.ts`
- Test: `apps/web/app/api/crm/leads/route.test.ts`

**Interfaces:**
- `POST /api/crm/manual-ping` accepts `{ workspaceId?, entity, recordId, channel }` and returns `{ touch, pingAt, protocolEntry }`.
- `GET /api/crm/manual-ping?entity=lead|coldTarget|client&recordId=...` returns protocol entries for that one record.
- `manualPingChannels` is the shared readonly channel list.

- [ ] **Step 1: Write failing API tests** for valid channels, authenticated actor, entity isolation, and invalid channel/record combinations.
- [ ] **Step 2: Run the focused route tests** and verify they fail because the route does not exist.
- [ ] **Step 3: Implement the route** with Zod validation, session actor lookup, Prisma `OutreachTouch.create`, and entity-specific protocol reads.
- [ ] **Step 4: Extend the shared latest-touch helper** so Leads, Cold Targets, and Clients use the same newest-touch rule.
- [ ] **Step 5: Run focused API tests and existing Leads/Cold Target route tests** and verify they pass.

### Task 2: Shared UI Picker And Protocol Model

**Files:**
- Modify: `packages/ui/src/table-model.ts`
- Create: `packages/ui/src/manual-ping.test.ts`
- Modify: `packages/ui/src/CrmTable.tsx`

**Interfaces:**
- `manualPingChannels` exposes `{ value, label }` for the five channels.
- `formatManualPingProtocolEntry` formats `channel | actor | local date/time`.
- `ManualPingTarget` identifies `lead`, `coldTarget`, or `client` plus the record id.

- [ ] **Step 1: Write failing helper tests** for channel labels and protocol formatting.
- [ ] **Step 2: Run the focused UI test** and verify the missing helper failure.
- [ ] **Step 3: Implement the shared channel list and formatting helper.**
- [ ] **Step 4: Add reusable UI state and request handling** for opening the picker, posting a channel, refreshing the affected row, and reporting errors.
- [ ] **Step 5: Run the focused UI tests and all existing UI tests.**

### Task 3: Leads And Cold Targets UI

**Files:**
- Modify: `packages/ui/src/CrmTable.tsx`
- Modify: `apps/web/app/globals.css`
- Modify: `apps/web/app/sample-data.ts`

**Interfaces:**
- The Ping cell opens the same channel picker used by the details card.
- The details card shows `Record ping` and the same five channel buttons.
- The protocol section shows channel, actor, and date/time for the active record.

- [ ] **Step 1: Add the failing component-level behavior assertions** through accessible labels in the existing UI model test surface.
- [ ] **Step 2: Implement table Ping-cell activation** without making the cell text-editable.
- [ ] **Step 3: Implement the compact card picker** and immediate save behavior for Leads and Cold Targets.
- [ ] **Step 4: Render the same protocol strip in both cards**, emphasizing the latest item and preserving the existing Cold Target protocol layout.
- [ ] **Step 5: Add CSS for compact buttons, hover/focus states, and mobile wrapping.**
- [ ] **Step 6: Run UI tests, typecheck, and production build.**

### Task 4: Clients And End-To-End Verification

**Files:**
- Modify: `apps/web/app/api/crm/clients/route.ts`
- Modify: `apps/web/app/sample-data.ts`
- Modify: `docs/qa/katya-crm-test-cases.md`

**Interfaces:**
- Client rows expose their own latest Ping and protocol endpoint data without reading Lead or Cold Target touches.

- [ ] **Step 1: Add Client route coverage** for latest Ping and isolated protocol history.
- [ ] **Step 2: Wire the Client table/card to the same manual Ping API if the shared table configuration exposes details actions.**
- [ ] **Step 3: Extend QA cases** with Lead, Cold Target, and Client isolation scenarios.
- [ ] **Step 4: Run the full test suite, typecheck, `git diff --check`, and production build.**
- [ ] **Step 5: Deploy to the test server and verify service health plus manual table/card flows.**
