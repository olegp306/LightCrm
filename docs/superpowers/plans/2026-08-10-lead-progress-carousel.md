# Lead Progress Carousel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current demo achievement groups in lead details with Katya's eight-stage document/progress path, using eight local images in one compact row with pleasant touch feedback.

**Architecture:** Keep the existing lead details HUD in `packages/ui/src/CrmTable.tsx`, but replace the four unrelated achievement sets with one ordered `leadProgressStages` definition. Persist the selected stage on the Lead record as `progressStage`; the existing business `status` remains separate. The UI derives muted/current/completed states with CSS and renders all eight stages in canonical order.

**Tech Stack:** Next.js, React, TypeScript, Prisma/PostgreSQL, `@lightcrm/ui`, CSS keyframes, local PNG assets, Vitest, TypeScript checks.

## Global Constraints

- The canonical progress order is exactly Katya's eight levels: Proposal, Contract, Prepayment invoice, Prepayment confirmed, Power of attorney, Final invoice, Final payment confirmed, Client review.
- There are exactly 8 logical stages and exactly 8 local visual assets: one image per stage. `locked`, `current`, and `completed` are CSS states, not separate files.
- All eight stage cards are visible together on desktop; only narrow screens may horizontally scroll the row.
- Selecting a stage is an explicit user action and persists to the lead; no automatic stage advancement is introduced in this iteration.
- Business `Lead.status` (`new`, `contacted`, `qualified`, `lost`, `converted`, `archived`) is not repurposed as the eight-stage progress value.
- The interaction must support mouse, keyboard, touch, reduced-motion preferences, and a clear disabled/locked visual state.
- Do not add an external image-generation or paid asset dependency; use local assets under `apps/web/public/lead-progress/`.
- Existing unrelated worktree changes must remain untouched and must not be included in the Call Targets deploy accidentally.

## File Map

- Modify `packages/db/prisma/schema.prisma`: add nullable-safe persisted lead progress stage and Katya's lead metadata fields.
- Modify `packages/core/src/types.ts`: expose the progress and metadata fields through `Lead` and `UpsertLeadInput`.
- Modify `packages/core/src/commands.ts`: pass the new fields through lead upsert/update commands.
- Modify `packages/db/src/prisma-repository.ts`: preserve the new Prisma fields in lead mapping.
- Modify `apps/web/app/api/crm/leads/upsert/route.ts` and `apps/web/app/api/crm/leads/update/route.ts`: validate and accept the new fields.
- Modify `apps/web/app/sample-data.ts`: add the eight-stage lead columns and representative values without breaking existing sample rows.
- Modify `packages/ui/src/CrmTable.tsx`: replace demo sets with the eight-stage row, stage-state derivation, persistence callback, and interaction feedback.
- Modify `apps/web/app/globals.css`: add the eight-card row, current-card focus, press/selection effects, mobile overflow, and reduced-motion rules.
- Use eight consistently framed local PNGs under `apps/web/public/lead-progress/`, one for each canonical stage.
- Add focused tests beside existing UI/core/auth tests for stage ordering, state derivation, persistence payloads, and metadata mapping.

---

### Task 1: Define the eight-stage domain contract

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Modify: `packages/core/src/types.ts`
- Modify: `packages/core/src/commands.ts`
- Modify: `packages/db/src/prisma-repository.ts`
- Test: `packages/core/src/lead-progress.test.ts`

**Interfaces:**
- `Lead.progressStage: number` is an integer from `0` through `7`, defaulting to `0`.
- `UpsertLeadInput.progressStage?: number` accepts only integers from `0` through `7`.
- Katya metadata fields are nullable and backward-compatible: `preferredLanguage`, `contractNumber`, `expectedFeeNet`, `olegPercent`, `handoffNote`, `lastPingAt`, and `clientType`.

- [ ] Write a failing core test that upserting stage `4` preserves `progressStage: 4`, rejects `-1` and `8`, and leaves old records at stage `0`.
- [ ] Run `pnpm --filter @lightcrm/core test -- lead-progress.test.ts` and confirm the new test fails before implementation.
- [ ] Add `progressStage Int @default(0)` and the nullable metadata fields to `Lead` in Prisma; keep all additions nullable/defaulted so existing production rows remain valid.
- [ ] Add matching fields to `Lead` and `UpsertLeadInput`, validate the range in the command layer, and preserve fields through Prisma mapping.
- [ ] Run Prisma generate, the focused core test, and DB/core typechecks.
- [ ] Commit as `feat: persist lead progress stage`.

### Task 2: Wire lead API validation and Katya's additional columns

**Files:**
- Modify: `apps/web/app/api/crm/leads/upsert/route.ts`
- Modify: `apps/web/app/api/crm/leads/update/route.ts`
- Modify: `apps/web/app/sample-data.ts`
- Test: `packages/db/src/lead-progress.test.ts` or the existing lead CSV/API mapping test location.

**Interfaces:**
- Lead upsert/update JSON accepts `progressStage` and the nullable metadata fields.
- Invalid progress values return the existing validation error shape rather than partially updating a lead.

- [ ] Add a failing mapping/API validation test for a valid stage and a rejected stage.
- [ ] Extend the existing Zod/request schema and payload mapping without changing unrelated lead fields.
- [ ] Add visible/default-hidden columns matching Katya's request: language flag, contract number, expected net fee, Oleg percentage, client type, handoff expectation, and last ping; keep long text wrapped and money values formatted.
- [ ] Keep the already present `Interest`, `Urgency`, `Todo`, `Ball`, documents, and calendar columns; do not duplicate messenger and phone.
- [ ] Run the focused test and `pnpm --filter @lightcrm/web typecheck`.
- [ ] Commit as `feat: expose lead progress and follow-up fields`.

### Task 3: Replace demo achievement groups with the canonical stage model

**Files:**
- Modify: `packages/ui/src/CrmTable.tsx`
- Test: `packages/ui/src/lead-progress.test.ts`

**Interfaces:**
- Define one ordered `LeadProgressStage` list with eight entries and one `LeadProgressState` union: `locked | available | current | completed`.
- Each stage has `id`, `label`, `color`, `description`, and one asset path. The exact order is the order in the Global Constraints section.
- `deriveLeadProgressState(stageIndex: number, selectedStage: number): LeadProgressState` must be pure and deterministic.

- [ ] Write failing tests asserting there are exactly 8 stages, one asset per stage, and 8 unique asset paths.
- [ ] Add tests for stage `0`, middle stage, final stage, and an invalid persisted value falling back to stage `0`.
- [ ] Replace `leadAchievementSets`, `leadProgressMarks`, and the demo localStorage marks with the typed stage definition plus a single selected stage per lead.
- [ ] Remove the percentage/progress reward/status footer from this HUD; the selected card itself is the only progress indicator.
- [ ] Run the focused UI test and verify the existing 21 UI tests remain green.
- [ ] Commit as `refactor: model lead progress as eight stages`.

### Task 4: Build the eight-card progress row

**Files:**
- Modify: `packages/ui/src/CrmTable.tsx`
- Modify: `apps/web/app/globals.css`
- Test: `packages/ui/src/lead-progress.test.ts`

**Interfaces:**
- The row exposes eight focusable cards in canonical order and an `aria-current` marker for the selected stage.
- All eight stages are visible on desktop; the row may scroll horizontally only on narrow layouts.
- Selecting a non-locked stage calls the existing row update endpoint with `{ id, progressStage }` and updates the local row only after a successful response.

- [ ] Add failing tests for canonical ordering, locked-card prevention, and row persistence.
- [ ] Implement the row with stable card dimensions that fit all eight cards on desktop; use horizontal scroll/snap only on touch layouts where needed.
- [ ] Do not render a progress bar, percentage, or separate status footer.
- [ ] Make the selected card visually calm and clear: stronger border, elevated image, label, and a small current marker; completed cards remain colorful, future cards are muted/locked.
- [ ] Run focused UI tests and typecheck.
- [ ] Commit as `feat: add lead progress carousel`.

### Task 5: Add the eight visual assets and polished feedback

**Files:**
- Use: `apps/web/public/lead-progress/01-*.png` through `08-*.png`
- Modify: `packages/ui/src/CrmTable.tsx`
- Modify: `apps/web/app/globals.css`
- Test: `packages/ui/src/lead-progress.test.ts`

**Interfaces:**
- Asset naming is deterministic: `stage-01-<slug>.png` through `stage-08-<slug>.png`.
- Every image uses the same canvas, transparent framing, character scale, and no decorative border/halo outside the intended artwork.

- [ ] Add an asset manifest test that checks all 8 paths are present and all files have the expected dimensions/aspect ratio.
- [ ] Reuse or reframe eight existing local images where needed so each of Katya's stages has its own coherent illustration.
- [ ] On press, use a brief scale-down and spring return; on selection, animate only the changed card; on completion, use a restrained glow/sparkle rather than a large burst.
- [ ] Add `prefers-reduced-motion: reduce` rules that remove transforms and keyframe movement while preserving focus, state color, and progress changes.
- [ ] Verify keyboard focus, `aria-pressed`/`aria-current`, image alt handling, and no layout shift while the image changes.
- [ ] Run asset tests, UI tests, typechecks, and `git diff --check`.
- [ ] Commit as `feat: add lead progress stage artwork and motion`.

### Task 6: Visual QA and user-case verification

**Files:**
- Modify: `apps/web/app/globals.css` or `packages/ui/src/CrmTable.tsx` only if QA finds a concrete issue.
- Test: existing UI tests plus a browser/e2e checklist artifact under `docs/superpowers/verification/`.

- [ ] Verify a new lead starts at `КП`, with the first asset current and later stages muted/locked as defined.
- [ ] Select each of the eight stages, reload the page, reopen the same lead, and confirm the selected stage persists.
- [ ] Verify all eight cards are visible on desktop, touch scrolling works on narrow layouts, and the mobile layout does not clip labels or buttons.
- [ ] Verify pressing a locked stage does nothing, clicking the current stage is idempotent, and a failed save restores the previous selected stage with an error notice.
- [ ] Verify locked/current/completed CSS states, completion feedback, reduced-motion behavior, and no halo/shimmer/size jumping around the images.
- [ ] Run `pnpm --filter @lightcrm/ui test`, UI/web/DB typechecks, and any available browser smoke test.
- [ ] Capture desktop and mobile screenshots for review before deploy.

### Task 7: Backup and deploy the completed Call Targets changes

**Files:**
- Read/execute: `LightCrm-deploy-handoff-2026-06-30.md` from the Downloads handoff document.
- Modify: release/version files only after the feature branch is reviewed.
- Create: timestamped backup under the existing backup location defined by the handoff.

- [ ] Isolate only the reviewed Call Targets changes, including the actor-aware outreach protocol and nullable `OutreachTouch.actorEmail`; exclude the lead carousel work until it passes QA.
- [ ] Confirm SSH host/key aliases from the handoff and run a read-only connection check before touching production.
- [ ] Create a timestamped production database/data backup and record its path and row counts.
- [ ] Run the schema update using the repository's existing `prisma db push --schema prisma/schema.prisma` process after backup; nullable `actorEmail` must not rewrite existing touch rows.
- [ ] Build and deploy the Call Targets release to the production port configured in the handoff.
- [ ] Smoke-test Call Targets: open a card, load protocol, mark a touch sent, verify the current logged-in author marker, and confirm existing drafts/save behavior.
- [ ] Record deployed version, URL, backup path, and rollback command before reporting completion.

## Verification Matrix

| Scenario | Expected result |
|---|---|
| New lead | `КП`, first asset is current and later assets are muted/locked according to the model |
| Select stage 2-7 | Selected card changes state, row saves `progressStage`, no business `status` mutation |
| Select stage 8 | Final card is current, completion feedback appears once, no layout jump |
| Reload after save | Same lead reopens at the saved stage |
| Locked stage click | No request and no visual state change |
| Desktop progress row | All 8 cards visible together and selectable without a separate carousel control |
| Mobile carousel | Horizontal touch scroll/snap, labels fit, no clipped controls |
| Reduced motion | State changes remain clear without keyframe movement |
| Old production lead | Missing/null new fields render safely with neutral defaults |
| Call Targets deploy | Protocol author badge shows the current CRM login and old touches remain readable |
