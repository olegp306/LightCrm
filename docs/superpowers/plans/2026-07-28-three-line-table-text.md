# Three-Line Table Text Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wrapped table cells render up to three lines and reveal the full text on hover.

**Architecture:** Keep the behavior inside the existing `CrmTable` canvas rendering layer and shared table-model helpers. Add one pure helper for wrapped-row height so tests can cover sizing without browser canvas.

**Tech Stack:** React, TypeScript, `@glideapps/glide-data-grid`, Vitest, Playwright browser smoke.

## Global Constraints

- Apply only to columns already treated as wrapped: `wrapText`, `valueKind: "longText"`, and address.
- Do not change inline editing semantics.
- Do not add dependencies.
- Tooltip must be visual-only and must not persist data.

---

### Task 1: Wrapped Row Height Helper

**Files:**
- Modify: `packages/ui/src/table-model.ts`
- Modify: `packages/ui/src/table-model.test.ts`

**Interfaces:**
- Produces: `wrappedTableRowHeight(fontSize: number, maxLines?: number): number`
- Consumes: existing `shouldWrapTableColumn` and `wrapMeasuredTextLines`

- [ ] **Step 1: Add failing tests**

Add tests that verify wrapped row height allows three lines and caps at that maximum.

- [ ] **Step 2: Implement helper**

Add `wrappedTableRowHeight(fontSize, maxLines = 3)` returning line-height times max lines plus vertical padding.

- [ ] **Step 3: Run focused tests**

Run the UI table-model tests and verify they pass.

- [ ] **Step 4: Commit**

Commit the helper and tests.

### Task 2: Canvas Tooltip and Row Height

**Files:**
- Modify: `packages/ui/src/CrmTable.tsx`

**Interfaces:**
- Consumes: `wrappedTableRowHeight`
- Produces: hover tooltip state for truncated wrapped cells

- [ ] **Step 1: Wire row height**

Use `wrappedTableRowHeight(tableFontSize)` for desktop rows when configured columns include a wrapped text column.

- [ ] **Step 2: Detect truncated wrapped cells**

During `onItemHovered`, when the hovered cell is a wrapped text cell and wrapping overflows three lines, set tooltip state with full text and cell bounds.

- [ ] **Step 3: Render tooltip**

Render a positioned `<div>` inside the table frame with full text, constrained width, and preserved line breaks.

- [ ] **Step 4: Preserve editing**

Do not intercept clicks or keyboard events; hover tooltip is passive.

- [ ] **Step 5: Run typecheck**

Run UI and web TypeScript checks.

- [ ] **Step 6: Commit**

Commit the UI behavior.

### Task 3: Visual Verification

**Files:**
- No production code changes expected.

**Interfaces:**
- Consumes: local dev server and Playwright/browser automation
- Produces: visual evidence and smoke-test output

- [ ] **Step 1: Start local test server**

Run the web app from the worktree on a free local port.

- [ ] **Step 2: Mock Call Targets data**

Use browser automation with one long `Role` and one long `Hook` cell.

- [ ] **Step 3: Capture screenshot**

Verify the row is at most three text lines tall and long cells show `more`.

- [ ] **Step 4: Hover long cell**

Verify a tooltip appears and contains the full text.

- [ ] **Step 5: Final checks**

Run focused tests, typechecks, `git diff --check`, and `git status --short`.
