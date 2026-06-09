# Telegram CRM Intake Orchestration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Telegram a complete CRM intake surface that can create, search, link, update, and enrich leads from text, forwarded context, and files.

**Architecture:** Keep Telegram transport thin and route all business decisions through the web API and LangGraph runtime settings. Add typed orchestration actions for lead search/update/linking, add an intake bundling layer for text plus attachments, and persist every original take before summarizing it into lead fields.

**Tech Stack:** TypeScript, Next.js API routes, `@lightcrm/core`, `@lightcrm/orchestrator`, Telegram Bot HTTP polling, local/R2 storage, Vitest.

---

## Current State Check

Already works now:
- `packages/telegram-bot/src/bot.ts` polls Telegram with `getUpdates`.
- `TELEGRAM_BOT_TOKEN` and `TELEGRAM_ALLOWED_CHAT_IDS` are present in `.env`.
- Telegram API `getMe` succeeds for `LightCrmrobot`; webhook is empty; pending updates are `0`.
- Local web API is live on `http://localhost:4900`.
- Telegram bot process is running locally and logs `LightCrm Telegram bot polling started. Allowed chats: 2.`
- `packages/telegram-bot/src/bot-core.ts` can call orchestrator, create a lead, upload captioned attachments, and send a reply.
- `pnpm --filter @lightcrm/telegram-bot test` passes.
- `pnpm --filter @lightcrm/telegram-bot typecheck` passes.

Important current limits:
- File-only Telegram messages are rejected unless they include text or caption.
- Attachments are uploaded only after a new lead is auto-created.
- Existing lead search and updates are not yet executed from Telegram; they are mostly dry-run/review behavior.
- File summaries are placeholder strings, not AI-derived semantic extraction.
- Multi-message/media-group intake is not yet bundled into one lead request.
- There is no Telegram command surface for choosing/linking a found lead.

---

## File Structure

- Modify `packages/orchestrator/src/types.ts`: add orchestration actions for search, link, update, and attachment intake.
- Modify `packages/orchestrator/src/rules.ts`: classify existing-lead updates, search requests, correction phrases, and attachment-only context.
- Modify `packages/orchestrator/src/graph.ts`: include search/update/link actions in the graph result.
- Modify `packages/orchestrator/src/graph.test.ts`: TDD coverage for search, update, negation, and attachment context.
- Modify `packages/telegram-bot/src/bot-core.ts`: execute search/update/link/intake actions instead of only formatting dry-run.
- Modify `packages/telegram-bot/src/bot.ts`: wire new web API calls into bot dependencies.
- Modify `packages/telegram-bot/src/bot.test.ts`: cover real Telegram flows for create, update, search, link, and files.
- Create `apps/web/app/api/crm/leads/search/route.ts`: structured lead search endpoint for Telegram.
- Create `apps/web/app/api/crm/leads/update/route.ts`: safe update endpoint for Telegram-approved updates.
- Modify `apps/web/app/api/crm/lead-intake/route.ts`: accept grouped intake text plus uploaded document references.
- Modify `apps/web/app/api/crm/lead-intake/upload/route.ts`: allow upload before lead is known by using intake session IDs.
- Create `packages/orchestrator/src/intake-summary.ts`: deterministic summary fallback and typed summary shape.
- Create `packages/orchestrator/src/intake-summary.test.ts`: summary tests independent from Telegram transport.

---

### Task 1: Add Orchestration Actions for Search, Update, Link, and Intake

**Files:**
- Modify: `packages/orchestrator/src/types.ts`
- Modify: `packages/orchestrator/src/rules.ts`
- Test: `packages/orchestrator/src/graph.test.ts`

- [ ] **Step 1: Write failing tests**

Add tests for:
- message asks to find an existing lead;
- message corrects current lead details;
- message says file/context belongs to an existing lead;
- message says “нет, это не новый лид” and must not create a lead.

Run:
```powershell
pnpm --filter @lightcrm/orchestrator test
```

Expected: tests fail until actions exist.

- [ ] **Step 2: Extend `PlannedCrmAction`**

Add action types:
```ts
type: "create_lead" | "update_lead" | "search_leads" | "link_intake" | "create_reminder" | "create_contact" | "request_review";
```

- [ ] **Step 3: Implement minimal rules**

Map phrases like `найди лид`, `это к`, `обнови`, `исправь`, `добавь к лиду`, `не новый лид` into intent/action.

- [ ] **Step 4: Verify**

Run:
```powershell
pnpm --filter @lightcrm/orchestrator test
pnpm --filter @lightcrm/orchestrator typecheck
```

Expected: all orchestrator tests pass.

---

### Task 2: Add Web API for Structured Lead Search and Update

**Files:**
- Create: `apps/web/app/api/crm/leads/search/route.ts`
- Create: `apps/web/app/api/crm/leads/update/route.ts`
- Test: `apps/web/app/api/crm/leads/search/route.test.ts` if route tests exist; otherwise cover through Telegram bot tests with mocked fetch.

- [ ] **Step 1: Implement search route**

Accept:
```ts
{
  "workspaceId": "default",
  "query": "Максим дом 140",
  "limit": 5
}
```

Return:
```ts
{
  "matches": [
    { "id": "lead-1", "name": "Максим", "status": "new", "score": 0.86 }
  ]
}
```

- [ ] **Step 2: Implement update route**

Accept safe partial lead updates:
```ts
{
  "workspaceId": "default",
  "leadId": "lead-1",
  "patch": { "name": "Максим", "phone": "+491234567" },
  "source": { "channel": "telegram", "messageId": "200" }
}
```

- [ ] **Step 3: Verify**

Run:
```powershell
pnpm --filter @lightcrm/web typecheck
```

Expected: no type errors.

---

### Task 3: Execute Search and Update Actions in Telegram

**Files:**
- Modify: `packages/telegram-bot/src/bot.ts`
- Modify: `packages/telegram-bot/src/bot-core.ts`
- Modify: `packages/telegram-bot/src/bot.test.ts`

- [ ] **Step 1: Write failing bot tests**

Cover:
- `search_leads` calls `/api/crm/leads/search`;
- one confident match updates/links automatically if risk is `auto`;
- multiple matches asks user to clarify;
- `update_lead` calls `/api/crm/leads/update`.

- [ ] **Step 2: Add deps**

Extend `TelegramBotDeps`:
```ts
searchLeads?: (input: SearchLeadsInput) => Promise<SearchLeadsResult>;
updateLead?: (input: UpdateLeadInput) => Promise<Lead>;
```

- [ ] **Step 3: Wire real web calls**

In `packages/telegram-bot/src/bot.ts`, add:
```ts
async function searchLeads(input: SearchLeadsInput) {
  return crmCall<SearchLeadsResult>("/api/crm/leads/search", input);
}

async function updateLead(input: UpdateLeadInput) {
  return crmCall<Lead>("/api/crm/leads/update", input);
}
```

- [ ] **Step 4: Verify**

Run:
```powershell
pnpm --filter @lightcrm/telegram-bot test
pnpm --filter @lightcrm/telegram-bot typecheck
```

Expected: tests and typecheck pass.

---

### Task 4: Support Attachment-Only and Multi-Message Intake Sessions

**Files:**
- Modify: `packages/telegram-bot/src/bot-core.ts`
- Modify: `packages/telegram-bot/src/bot.test.ts`
- Modify: `apps/web/app/api/crm/lead-intake/upload/route.ts`
- Modify: `apps/web/app/api/crm/lead-intake/route.ts`

- [ ] **Step 1: Write failing tests**

Cover:
- photo/document without caption is accepted into a pending intake session;
- caption + files are grouped by `media_group_id`;
- follow-up text attaches to the same pending session for the same chat;
- user can later say which lead it belongs to.

- [ ] **Step 2: Add pending intake model**

Use in-memory local bot session first:
```ts
type PendingTelegramIntake = {
  chatId: number;
  mediaGroupId: string | null;
  sourceMessageIds: string[];
  textItems: Array<{ sourceMessageId: string; author: string | null; text: string }>;
  attachments: LeadIntakeAttachmentInput[];
  createdAt: number;
};
```

- [ ] **Step 3: Verify**

Run:
```powershell
pnpm --filter @lightcrm/telegram-bot test
```

Expected: pending intake tests pass.

---

### Task 5: Add Semantic File Summary Pipeline

**Files:**
- Create: `packages/orchestrator/src/intake-summary.ts`
- Create: `packages/orchestrator/src/intake-summary.test.ts`
- Modify: `apps/web/app/api/crm/lead-intake/route.ts`

- [ ] **Step 1: Write summary tests**

Cover:
- PDF/document/image/audio metadata produce stable short summary;
- multiple text items and attachments produce one lead-level summary;
- fallback summary works without OpenAI.

- [ ] **Step 2: Implement deterministic fallback**

Return:
```ts
{
  "shortSummary": "Client sent house brief and budget context.",
  "longSummary": "Telegram intake contains text, one PDF, and one image...",
  "facts": { "projectType": "private_house", "areaM2": 140 }
}
```

- [ ] **Step 3: Add optional LLM provider boundary**

Keep LLM call behind a typed function:
```ts
summarizeLeadIntake(input, { provider: process.env.OPENAI_API_KEY ? "openai" : "fallback" })
```

- [ ] **Step 4: Verify**

Run:
```powershell
pnpm --filter @lightcrm/orchestrator test
pnpm --filter @lightcrm/web typecheck
```

Expected: tests pass without needing an external LLM.

---

### Task 6: Manual Telegram Smoke Script

**Files:**
- Create: `scripts/smoke-telegram-local.ps1`

- [ ] **Step 1: Add local checks**

Script verifies:
- web responds at `http://localhost:4900/api/crm/orchestrator/settings`;
- Telegram `getMe` succeeds;
- bot process contains `packages\telegram-bot`;
- `.telegram-bot.log` contains `polling started`.

- [ ] **Step 2: Run**

Run:
```powershell
powershell -ExecutionPolicy Bypass -File scripts/smoke-telegram-local.ps1
```

Expected:
```text
WEB OK
TELEGRAM API OK
BOT PROCESS OK
POLLING LOG OK
```

---

## Manual Test Matrix

Use allowed Telegram chat IDs only.

- Send `/start`: bot replies with help text.
- Send `Ещё новый лид: Максим хочет дом 140 м2`: bot dry-runs and, if active settings allow auto create, creates a lead.
- Send a PDF with caption `Ещё новый лид: дом 140 м2`: bot creates lead and saves attachment.
- Send a PDF without caption: after Task 4, bot should create pending intake instead of rejecting.
- Send `нет, это не новый лид`: bot must not create a lead.
- Send `найди лид Максим`: after Task 3, bot returns top matches.
- Send `добавь телефон +491234567 к Максиму`: after Task 3, bot updates or asks to clarify.

---

## Completion Criteria

- `pnpm test` passes.
- `pnpm typecheck` passes.
- `pnpm build` passes with web dev server stopped during build.
- Telegram bot can process text, captioned file, file-only pending intake, lead search, and lead update flows.
- Every Telegram action response includes what happened and whether it was auto, review, or blocked.
- No secrets are printed in logs.
