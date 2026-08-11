# Lead Commercial Fields Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store and edit the Lead net amount, Oleg commission percentage, and its enabled state, with a plain two-column table presentation and a card-level toggle.

**Architecture:** Extend the existing Lead Prisma/core model and existing upsert/update API contracts. New Leads default to an enabled 2% commission; existing records remain disabled through a nullable-safe migration default. Reuse the existing details save flow and table column system without adding special color styling.

**Tech Stack:** Prisma/PostgreSQL, TypeScript, Next.js API routes, React, Glide Data Grid, Vitest.

## Global Constraints

- Commercial fields belong to Leads only and must not affect Cold Targets.
- `olegPercent` starts at `2` for new Leads and remains manually editable.
- Existing Leads must not be enabled automatically.
- Amount and percentage remain ordinary numeric fields without custom color treatment.

### Task 1: Persist commission state

**Files:** `packages/db/prisma/schema.prisma`, `packages/core/src/types.ts`, `packages/core/src/commands.ts`, `apps/web/app/api/crm/leads/upsert/route.ts`, `apps/web/app/api/crm/leads/update/route.ts`

- [x] Add `olegCommissionEnabled Boolean @default(false)` to `Lead` and expose it through core input/record types.
- [x] Default new core-created Leads to `true` and `olegPercent` to `2`; preserve existing values on updates.
- [x] Accept and persist the toggle in both API routes.
- [x] Add route/command tests for new defaults, manual percentage edits, and disabling the toggle.
- [x] Run focused API/core tests and Prisma type generation.

### Task 2: Present and edit commercial fields

**Files:** `apps/web/app/sample-data.ts`, `packages/ui/src/CrmTable.tsx`

- [x] Add `Fee net`, `Oleg %`, and `Oleg commission` columns to Leads, with the two numeric columns available in the table and the toggle available in the details card.
- [x] Make details-card fields use the existing save-details patch flow.
- [x] Keep the fields ordinary controls and numeric display; do not introduce color-specific styling.
- [x] Add UI/model coverage for the column contract and payload mapping.

### Task 3: Verify and publish

- [x] Run UI tests, API tests, typechecks, and `git diff --check`.
- [ ] Run Prisma `db push` against the test database and build the web app.
- [ ] Deploy the checked `main` commit to `http://204.168.163.99:3004/` and verify service/HTTP health.
