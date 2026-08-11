# Today Cold Outreach Done Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `Done` on Today reliably complete cold outreach touches, advance the campaign, write the outreach protocol, and use the same compact floating-label email editor as Cold Target Details.

**Architecture:** Keep campaign state changes in the existing outreach advance endpoint. Make the calendar feed expose a stable outreach marker for campaign reminders, and make the Today action route every recognized cold outreach item through that endpoint. Extract the shared email editor into a UI component used by both surfaces so labels, save behavior, and editing states cannot drift.

**Tech Stack:** Next.js 14, React, TypeScript, Prisma, Vitest, CSS modules/global CSS.

## Global Constraints

- Cold outreach actions must create an `outreachTouch` and preserve actor attribution from the CRM session.
- The current reminder must become `done`; the next campaign touch must remain scheduled.
- Leads and ordinary calendar reminders keep their existing behavior.
- Email fields use compact float labels and retain draft save/autosave behavior.
- Do not change database ownership or mix lead protocol history with cold-target protocol history.

### Task 1: Stabilize outreach recognition in the calendar feed

**Files:**
- Modify: `apps/web/app/api/crm/calendar-feed/route.ts`
- Create/Modify test: `apps/web/app/api/crm/calendar-feed/route.test.ts`

**Interfaces:**
- Produce a calendar item with `outreach` metadata whenever a reminder has `sourceChannel: "outreach-campaign"` and a cold target, including the campaign id, touch metadata, and editable draft content.
- Preserve `null` outreach for ordinary reminders and calendar events.

- [x] **Step 1: Write the failing test** for a campaign reminder with a matching campaign description and a cold target, asserting that `outreach` is non-null and contains the campaign id, channel, subject, body, and target email.
- [x] **Step 2: Run the focused test** and confirm the missing helper contract was exposed before the implementation was added.
- [x] **Step 3: Implement the smallest feed fix** by centralizing campaign/touch parsing and accepting the persisted campaign marker without weakening ordinary reminder handling.
- [x] **Step 4: Run the focused test** and confirm it passes, then run the existing UI outreach tests.

### Task 2: Make Today `Done` complete cold outreach and refresh the next touch

**Files:**
- Modify: `apps/web/app/components/CrmCalendar.tsx`
- Modify: `apps/web/app/api/crm/outreach-campaigns/advance/route.ts` only if the focused regression identifies a response-shape issue
- Create/Modify test: `apps/web/app/components/CrmCalendar.test.tsx` or an extracted pure helper test

**Interfaces:**
- `markCalendarItemDone` sends `{ coldTargetId, campaignId, action: "mark_sent" }` for every recognized cold outreach reminder.
- The UI marks the current item sent immediately, then refreshes and displays the next scheduled touch plus a concise success notice.

- [x] **Step 1: Add a pure failing test** for the route-selection helper: outreach cold-target items use `/api/crm/outreach-campaigns/advance`, while normal reminders still use `/api/crm/reminders/upsert`.
- [x] **Step 2: Run the focused test** and confirm the current helper/branching fails for the broken Today case.
- [x] **Step 3: Implement the minimal UI state and label fix**: recognize the stable outreach marker, show `Mark sent` for cold outreach, preserve disabled state only after completion, and refresh after the response so the next touch appears.
- [x] **Step 4: Run focused tests and typecheck**, verifying that protocol rows from the endpoint are reflected without affecting lead/client reminders.

### Task 3: Share the compact floating-label email editor

**Files:**
- Modify: `apps/web/app/components/CrmCalendar.tsx`
- Modify: `packages/ui/src/CrmTable.tsx`
- Modify: `apps/web/app/globals.css`
- Create/Modify test: `packages/ui/src/outreach-draft-autosave.test.ts` and UI component/helper tests as needed

**Interfaces:**
- Shared editor renders `Subject` and `Email` with the same compact float-label structure, editable body mode, styled/plain toggle, save action, and save status.
- Today and Cold Target Details continue using their existing endpoints and draft keys.

- [x] **Step 1: Add focused tests** for draft state updates and save-state labels used by both editors.
- [x] **Step 2: Run the focused tests** to establish the expected failure for the new shared presentation contract.
- [x] **Step 3: Extract or align the editor markup and class names** without changing draft endpoint payloads.
- [x] **Step 4: Add responsive CSS** so the fields keep the same compact height, labels stay readable, and the email body expands when opened.
- [x] **Step 5: Run UI tests, typecheck, and production build.**

### Task 4: Manual verification and release

**Files:**
- No source changes expected.

- [ ] Verify Today cold outreach: open email, edit subject/body, save, click `Mark sent`, observe success state, next touch, and protocol entry.
- [ ] Verify ordinary reminder `Done` still becomes done without creating outreach protocol history.
- [ ] Verify Cold Target Details editor has matching float-label sizing and save behavior.
- [ ] Capture desktop screenshots of Today and Cold Target Details after the interaction.
- [ ] Deploy to test only after local checks pass; re-run the same user flow on the test URL.
