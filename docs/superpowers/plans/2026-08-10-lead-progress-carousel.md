# Lead Progress Carousel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current demo achievement groups in lead details with Katya's eight-stage document/progress path, using 40 local visual states, a compact 9.5-card carousel, pleasant touch feedback, and a persisted progress bar.

**Architecture:** Keep the existing lead details HUD in `packages/ui/src/CrmTable.tsx`, but replace the four unrelated achievement sets with one ordered `leadProgressStages` definition. Persist the selected stage on the Lead record as `progressStage`; the existing business `status` remains separate. The UI derives each card's visual state from the selected stage and renders the current stage first while preserving the canonical stage order for the carousel.

**Tech Stack:** Next.js, React, TypeScript, Prisma/PostgreSQL, `@lightcrm/ui`, CSS keyframes, local PNG assets, Vitest, TypeScript checks.

## Global Constraints

- The canonical progress order is exactly Katya's eight levels: Proposal, Contract, Prepayment invoice, Prepayment confirmed, Power of attorney, Final invoice, Final payment confirmed, Client review.
- There are exactly 8 logical stages and exactly 40 local visual assets: 5 states per stage (`locked`, `available`, `current`, `completed`, `celebrate`).
- The current stage is always the first visible card; the carousel viewport intentionally reveals 9.5 cards on desktop to communicate that it is scrollable.
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
- Modify `packages/ui/src/CrmTable.tsx`: replace demo sets with the eight-stage carousel, stage-state derivation, persistence callback, progress bar, and interaction feedback.
- Modify `apps/web/app/globals.css`: add the 9.5-card viewport, current-card focus, progress bar, celebration effects, mobile overflow, and reduced-motion rules.
- Create or replace assets in `apps/web/public/lead-progress/`: exactly 40 consistently framed local PNGs, five states for each canonical stage.
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
- Define one ordered `LeadProgressStage` list with eight entries and one `LeadProgressState` union: `locked | available | current | completed | celebrate`.
- Each stage has `id`, `label`, `color`, `description`, and five asset paths. The exact order is the order in the Global Constraints section.
- `deriveLeadProgressState(stageIndex: number, selectedStage: number): LeadProgressState` must be pure and deterministic.

- [ ] Write failing tests asserting there are exactly 8 stages, exactly 5 assets per stage, and 40 unique asset paths.
- [ ] Add tests for stage `0`, middle stage, final stage, and an invalid persisted value falling back to stage `0`.
- [ ] Replace `leadAchievementSets`, `leadProgressMarks`, and the demo localStorage marks with the typed stage definition plus a single selected stage per lead.
- [ ] Keep the existing reward/fee summary only if it remains semantically useful; rename it so it does not imply that clicking a stage grants money.
- [ ] Run the focused UI test and verify the existing 21 UI tests remain green.
- [ ] Commit as `refactor: model lead progress as eight stages`.

### Task 4: Build the 9.5-card interactive carousel

**Files:**
- Modify: `packages/ui/src/CrmTable.tsx`
- Modify: `apps/web/app/globals.css`
- Test: `packages/ui/src/lead-progress.test.ts`

**Interfaces:**
- The carousel exposes previous/next controls with accessible labels, a horizontally scrollable track, and an `aria-current` marker for the selected stage.
- The selected stage is rendered first in the visible sequence; remaining stages follow the canonical order without mutating the stored order.
- Selecting a non-locked stage calls the existing row update endpoint with `{ id, progressStage }` and updates the local row only after a successful response.

- [ ] Add failing tests for current-first ordering, previous/next wrapping/clamping, locked-card prevention, and progress percentage (`stage / 7`).
- [ ] Implement a pure `orderedVisibleStages` helper and use it from the component.
- [ ] Use a fixed card width and viewport math that reveals nine full cards plus approximately half of the tenth on desktop; use horizontal scroll/snap on touch layouts.
- [ ] Add a thin progress bar below the cards with current label, `n / 8`, and percentage; animate width changes with a short ease-out transition.
- [ ] Make the selected card visually calm and clear: stronger border, elevated image, label, and a small current marker; completed cards remain colorful, future cards are muted/locked.
- [ ] Run focused UI tests and typecheck.
- [ ] Commit as `feat: add lead progress carousel`.

### Task 5: Add the 40 visual states and polished feedback

**Files:**
- Create/modify: `apps/web/public/lead-progress/*.png`
- Modify: `packages/ui/src/CrmTable.tsx`
- Modify: `apps/web/app/globals.css`
- Test: `packages/ui/src/lead-progress.test.ts`

**Interfaces:**
- Asset naming is deterministic: `stage-01-<slug>-locked.png`, `...-available.png`, `...-current.png`, `...-completed.png`, `...-celebrate.png`.
- Every image uses the same canvas, transparent framing, character scale, and no decorative border/halo outside the intended artwork.

- [ ] Add an asset manifest test that checks all 40 paths are present and all files have the expected dimensions/aspect ratio.
- [ ] Replace/reframe existing unrelated achievement images where needed so each of the eight Katya stages has its own coherent illustration and five controlled states.
- [ ] On press, use a brief scale-down and spring return; on selection, animate only the changed card and progress bar; on completion, use a restrained glow/sparkle rather than a large burst.
- [ ] Add `prefers-reduced-motion: reduce` rules that remove transforms and keyframe movement while preserving focus, state color, and progress changes.
- [ ] Verify keyboard focus, `aria-pressed`/`aria-current`, image alt handling, and no layout shift while the image changes.
- [ ] Run asset tests, UI tests, typechecks, and `git diff --check`.
- [ ] Commit as `feat: add lead progress stage artwork and motion`.

### Task 6: Visual QA and user-case verification

**Files:**
- Modify: `apps/web/app/globals.css` or `packages/ui/src/CrmTable.tsx` only if QA finds a concrete issue.
- Test: existing UI tests plus a browser/e2e checklist artifact under `docs/superpowers/verification/`.

- [ ] Verify a new lead starts at `КП`, shows `1 / 8` and `0%`, and has only the appropriate next stages available.
- [ ] Select each of the eight stages, reload the page, reopen the same lead, and confirm the selected stage and progress bar persist.
- [ ] Verify the current stage is first, 9.5 cards are visible on desktop, touch scrolling works, and the mobile layout does not clip labels or buttons.
- [ ] Verify pressing a locked stage does nothing, clicking the current stage is idempotent, and a failed save restores the previous selected stage with an error notice.
- [ ] Verify all five visual states, completion feedback, reduced-motion behavior, and no halo/shimmer/size jumping around the images.
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
| New lead | `КП`, stage `1 / 8`, 0% progress, first asset is current and later assets are locked/available according to the model |
| Select stage 2-7 | Selected card moves first, progress bar updates, row saves `progressStage`, no business `status` mutation |
| Select stage 8 | `8 / 8`, 100%, final celebration state appears once, no layout jump |
| Reload after save | Same lead reopens at the saved stage |
| Locked stage click | No request and no visual state change |
| Desktop carousel | 9.5 cards visible, clear next-card affordance, arrows and wheel/trackpad work |
| Mobile carousel | Horizontal touch scroll/snap, labels fit, no clipped controls |
| Reduced motion | State changes remain clear without keyframe movement |
| Old production lead | Missing/null new fields render safely with neutral defaults |
| Call Targets deploy | Protocol author badge shows the current CRM login and old touches remain readable |
