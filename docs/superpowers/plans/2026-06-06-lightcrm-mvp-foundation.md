# LightCrm MVP Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first working LightCrm foundation: a pnpm monorepo with Next.js, TypeScript, Prisma/PostgreSQL schema, a tested CRM command layer, orchestrator-ready API routes, and initial table-first CRM pages.

**Architecture:** Keep the CRM domain in `packages/core` behind repository interfaces so UI, API routes, and future orchestrators call commands rather than touching Prisma directly. Store the database model in `packages/db`, render reusable table surfaces from `packages/ui`, and keep the Next.js app in `apps/web`.

**Tech Stack:** Next.js App Router, React, TypeScript, Zod, Prisma, PostgreSQL, pnpm workspaces, Vitest, Glide Data Grid-ready UI boundaries.

---

### Task 1: Workspace And Tooling

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `apps/web/package.json`
- Create: `packages/core/package.json`
- Create: `packages/db/package.json`
- Create: `packages/ui/package.json`

- [x] **Step 1: Add workspace manifests**

Create a pnpm workspace with `apps/*` and `packages/*`, shared TypeScript defaults, and scripts for `dev`, `build`, `test`, and `lint`.

- [x] **Step 2: Install dependencies**

Run: `pnpm install`

Expected: dependencies install without peer dependency errors.

### Task 2: Core CRM Domain

**Files:**
- Create: `packages/core/src/types.ts`
- Create: `packages/core/src/repository.ts`
- Create: `packages/core/src/memory-repository.ts`
- Create: `packages/core/src/commands.ts`
- Create: `packages/core/src/search.ts`
- Create: `packages/core/src/index.ts`
- Create: `packages/core/src/commands.test.ts`
- Create: `packages/core/src/search.test.ts`

- [x] **Step 1: Write failing command tests**

Cover upsert behavior, lead-to-client linking, archive behavior, and audit log creation using the in-memory repository.

- [x] **Step 2: Implement minimal command layer**

Expose `createCrmService(repository)` with commands for clients, leads, cold targets, reminders, calendar events, outreach touches, lead linking, archiving, and global search.

- [ ] **Step 3: Replace memory persistence in route handlers with Prisma repository**

Add a Prisma-backed repository once migrations and seed data are stable.

### Task 3: Database Schema

**Files:**
- Create: `packages/db/prisma/schema.prisma`
- Create: `packages/db/src/client.ts`
- Create: `packages/db/src/index.ts`

- [x] **Step 1: Define Prisma models**

Create models for Workspace, Client, Lead, ColdTarget, OutreachTouch, Reminder, CalendarEvent, TablePreference, and AuditLog with PostgreSQL provider.

- [ ] **Step 2: Add migrations after DATABASE_URL is confirmed**

Run: `pnpm --filter @lightcrm/db prisma migrate dev --name init`

Expected: migration files are created and Prisma client generates successfully.

### Task 4: API Routes

**Files:**
- Create: `apps/web/app/api/crm/_shared.ts`
- Create: `apps/web/app/api/crm/clients/upsert/route.ts`
- Create: `apps/web/app/api/crm/leads/upsert/route.ts`
- Create: `apps/web/app/api/crm/cold-targets/upsert/route.ts`
- Create: `apps/web/app/api/crm/reminders/upsert/route.ts`
- Create: `apps/web/app/api/crm/calendar-events/upsert/route.ts`
- Create: `apps/web/app/api/crm/leads/link-client/route.ts`
- Create: `apps/web/app/api/crm/search/route.ts`

- [x] **Step 1: Add route handlers against core service**

Use Zod schemas at the route boundary and return JSON errors with HTTP 400 for invalid requests.

- [ ] **Step 2: Add route tests**

Add route-handler tests after the Prisma repository is introduced so persistence behavior is covered end to end.

### Task 5: Table-First Web UI

**Files:**
- Create: `apps/web/app/layout.tsx`
- Create: `apps/web/app/page.tsx`
- Create: `apps/web/app/clients/page.tsx`
- Create: `apps/web/app/leads/page.tsx`
- Create: `apps/web/app/cold-targets/page.tsx`
- Create: `apps/web/app/outreach/page.tsx`
- Create: `apps/web/app/calendar/page.tsx`
- Create: `apps/web/app/today/page.tsx`
- Create: `apps/web/app/globals.css`
- Create: `packages/ui/src/CrmTable.tsx`
- Create: `packages/ui/src/index.ts`

- [x] **Step 1: Build the shell and CRM pages**

Create dense operational pages with table headers, status chips, search input, filters, and row actions. Avoid marketing-style landing content.

- [ ] **Step 2: Wire live API data and inline editing**

Replace demo rows with route-backed data fetching and PATCH-like update commands.

### Task 6: Verification

**Files:**
- Modify as needed based on test and build failures.

- [ ] **Step 1: Run tests**

Run: `pnpm test`

Expected: Vitest tests in `packages/core` pass.

- [ ] **Step 2: Run build**

Run: `pnpm build`

Expected: packages and `apps/web` compile.

- [ ] **Step 3: Start local preview if build succeeds**

Check `C:\repos\PORTS.md` for an assigned port before starting `pnpm dev`.

