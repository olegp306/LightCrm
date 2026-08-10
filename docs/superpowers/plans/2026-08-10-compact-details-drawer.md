# Compact Details Drawer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make lead and cold target details drawers fit dense records by reducing field height and keeping footer actions visible.

**Architecture:** This is a focused CSS layout change in `apps/web/app/globals.css`. Existing JSX field structure remains unchanged; labels are visually converted into floating labels with CSS so editable and readonly details fields share the same compact rhythm.

**Tech Stack:** Next.js app CSS, existing React components in `packages/ui/src/CrmTable.tsx`, browser visual QA on the deployed test stand.

## Global Constraints

- Do not change data behavior or field ordering.
- Keep details fields readable on desktop and mobile.
- Keep `Cancel` and `Save details` inside the drawer viewport.
- Verify visually on lead `0-0-0-2` after deployment to test.

---

### Task 1: Compact Details Fields

**Files:**
- Modify: `apps/web/app/globals.css`

**Interfaces:**
- Consumes: Existing `.detailsDrawerFields label`, `.detailsDrawerField`, `.detailsFieldLabel`, input/select/textarea/readonly markup.
- Produces: Compact floating-label visuals without JSX changes.

- [ ] Reduce drawer gaps and field gaps.
- [ ] Render `.detailsFieldLabel` as a small pill overlapping the field border.
- [ ] Add top padding to controls so labels do not cover values.
- [ ] Keep textarea values readable and multiline.

### Task 2: Keep Footer Visible

**Files:**
- Modify: `apps/web/app/globals.css`

**Interfaces:**
- Consumes: Existing `.detailsDrawer footer`.
- Produces: Sticky footer inside the modal with compact action buttons.

- [ ] Make footer sticky to the bottom of the drawer.
- [ ] Add subtle background/border so it stays readable over scrolled content.
- [ ] Reduce button height enough to fit dense drawers.

### Task 3: Compact Lead Progress

**Files:**
- Modify: `apps/web/app/globals.css`

**Interfaces:**
- Consumes: Existing `.leadProgressHud`, `.leadProgressIcon`, `.leadProgressTrack`, `.leadProgressReward`.
- Produces: Smaller desktop lead progress panel while preserving click targets and labels.

- [ ] Reduce lead progress min-height and icon height.
- [ ] Reduce grid gaps and reward typography.
- [ ] Keep mobile horizontal scrolling behavior intact.

### Task 4: Verification

**Files:**
- No source changes.

**Interfaces:**
- Consumes: Deployed test stand at `https://lightcrm-test.204-168-163-99.sslip.io/leads`.
- Produces: Screenshots showing details drawer fit.

- [ ] Run UI/web typecheck and production build.
- [ ] Deploy to test with backup.
- [ ] Open lead `0-0-0-2`.
- [ ] Verify `polytouch`, `next action`, `Cancel`, and `Save details` fit inside the drawer.
- [ ] Capture desktop screenshots.
