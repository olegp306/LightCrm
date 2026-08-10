# Compact Cold Target Outreach Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Cold Target Details Outreach section compact enough for daily use while preserving campaign editing, touch expansion, protocol history, and calendar access.

**Architecture:** Keep campaign and draft behavior in `packages/ui/src/CrmTable.tsx`; add only presentation state needed to order the current touch first and expose the touch list as a three-row scroll window. Use scoped CSS in `apps/web/app/globals.css` for floating labels, one-line summaries, compact protocol tiles, and a compact related-activity row. No API or data-model changes are required.

**Tech Stack:** React, TypeScript, existing native `details` disclosure elements, CSS Grid, Vitest, Next.js production build, deployed browser QA.

## Global Constraints

- Preserve existing campaign start, advance, stop, restart, draft editing, autosave, and email actions.
- The current touch must remain visually primary and appear first in the compact touch window.
- Desktop protocol items must render three per row; narrow and mobile layouts must collapse without horizontal overflow.
- The complete text of truncated summaries remains available through the existing disclosure content or a hover title.
- History and Calendar remain available, but their closed state must occupy one compact row.

---

### Task 1: Compact Outreach Header and Current Touch

**Files:**
- Modify: `packages/ui/src/CrmTable.tsx`
- Modify: `apps/web/app/globals.css`

**Interfaces:**
- Consumes: `selectedOutreachCampaign`, `detailsOutreachProgress`, `detailsCurrentOutreachTouch`, and existing campaign status values.
- Produces: one-line Outreach status, floating-label campaign selector, one-line current touch summary.

- [ ] Replace the duplicated Outreach header text with a single status row containing `Outreach` and the current campaign status.
- [ ] Render the campaign selector with the same floating-label markup already used by details fields.
- [ ] Render the campaign summary as one clamped line with a `title` attribute for the full text.
- [ ] Render the Current touch block with the label `Current touch` and one summary containing progress, channel/title, and `D+dayOffset`.
- [ ] Keep the existing next-action text available as a title or secondary inline value without adding another full-height row.
- [ ] Add focused CSS selectors for the compact header and current touch typography; keep the progress number larger and bold.

### Task 2: Three-Row Touch Window

**Files:**
- Modify: `packages/ui/src/CrmTable.tsx`
- Modify: `apps/web/app/globals.css`

**Interfaces:**
- Consumes: `selectedOutreachCampaign.touchpoints` and `detailsOutreachProgress.current`.
- Produces: a stable touch ordering with the current touch first, followed by the next two touches, while all touches remain scrollable and individually expandable.

- [ ] Build a derived touch list that orders the current touch first, then future touches, then completed touches; when there is no active progress, retain campaign order.
- [ ] Keep the existing `details` element around each touch so opening a touch still loads and displays the full draft editor.
- [ ] Set the touch-list viewport to approximately three compact summaries and allow vertical scrolling for the remaining touches.
- [ ] Remove any behavior that forces every current draft open on initial render; the current summary stays visible and the full draft opens on click.
- [ ] Preserve current/past class names and the existing draft key so autosave and protocol updates continue to target the same touch.
- [ ] Add CSS for a compact summary row, a visually stronger current row, a quieter past row, and an expanded draft that can use the drawer scroll area.

### Task 3: Compact Protocol and Related Activity

**Files:**
- Modify: `apps/web/app/globals.css`
- Modify: `packages/ui/src/CrmTable.tsx`

**Interfaces:**
- Consumes: `detailsPanelOutreachProtocol`, `detailsPanelCalendarItems`, and existing calendar timeline markup.
- Produces: a three-column protocol grid and a compact History/Calendar disclosure row.

- [ ] Change Protocol items to a three-column desktop grid with compact padding and a two-line content limit.
- [ ] Keep actor/channel/date and subject readable; expose full subject text through the item title or disclosure.
- [ ] Collapse the protocol list height naturally without changing protocol data or ordering.
- [ ] Group the existing History and Calendar details into a compact related-activity row with counts in each summary.
- [ ] Keep the existing expanded timelines intact when the user opens History or Calendar.
- [ ] Add responsive rules for two columns on medium widths and one column on mobile.

### Task 4: Verification and Test Deployment

**Files:**
- Test: `packages/ui/src/table-model.test.ts`
- Test: `packages/ui/src/cold-target-model.test.ts`
- No new data files.

**Interfaces:**
- Consumes: the updated Cold Target Details UI and existing test stand at `https://lightcrm-test.204-168-163-99.sslip.io/cold-targets`.
- Produces: passing type checks/build, a deployed test version, and visual evidence at desktop and mobile widths.

- [ ] Add or update pure helper tests only if touch ordering or compact labels are extracted from JSX.
- [ ] Run UI and web TypeScript checks, focused Vitest tests, `git diff --check`, and the Next.js production build.
- [ ] Deploy the branch to test with a timestamped backup and confirm both test services are active.
- [ ] Open an active Cold Target and verify one-line Outreach header, floating Campaign label, current touch emphasis, and three-row touch window.
- [ ] Expand a non-current touch and verify the full draft editor, Preview/Edit, autosave, Save draft, Recreate, and Send email behavior.
- [ ] Expand Protocol and verify three cards per row; expand History and Calendar and verify their counts and timelines.
- [ ] Capture desktop and mobile screenshots and check for clipped text, horizontal overflow, or footer displacement.

