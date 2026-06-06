# LangGraph CRM Orchestrator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a server-side LangGraph orchestration layer that turns Telegram-style CRM messages into safe, explainable CRM action plans before anything writes to the database.

**Architecture:** Create a new `@lightcrm/orchestrator` package that owns message normalization, fact extraction, intent classification, entity resolution, risk checks, and CRM action planning. The first implementation is deterministic and testable, then the LLM provider is wired behind an interface so `OPENAI_MODEL=gpt-4.1-mini` can enrich extraction without overriding guardrails.

**Tech Stack:** TypeScript, Vitest, `@langchain/langgraph` `StateGraph`/`Annotation`/`START`/`END`, existing `@lightcrm/core` service and repository types.

---

## File Structure

- Create `packages/orchestrator/package.json`: package scripts and dependencies.
- Create `packages/orchestrator/tsconfig.json`: TypeScript config following existing packages.
- Create `packages/orchestrator/src/types.ts`: orchestration state, intents, extracted facts, message evidence, action plans, risk levels.
- Create `packages/orchestrator/src/rules.ts`: deterministic phrase and risk rules from Katya's messages.
- Create `packages/orchestrator/src/graph.ts`: LangGraph StateGraph nodes and compiled graph factory.
- Create `packages/orchestrator/src/index.ts`: public exports.
- Create `packages/orchestrator/src/graph.test.ts`: regression tests from provided Telegram examples.
- Modify `tsconfig.base.json`: add `@lightcrm/orchestrator` path alias.
- Modify `apps/web/package.json`: depend on `@lightcrm/orchestrator`.
- Create `apps/web/app/api/crm/orchestrator/dry-run/route.ts`: dry-run endpoint for checking messages without CRM writes.

## Task 1: Package Scaffolding

**Files:**
- Create: `packages/orchestrator/package.json`
- Create: `packages/orchestrator/tsconfig.json`
- Create: `packages/orchestrator/src/index.ts`
- Modify: `tsconfig.base.json`

- [ ] **Step 1: Create package manifest**

```json
{
  "name": "@lightcrm/orchestrator",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json --noEmit",
    "lint": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@langchain/langgraph": "^1.3.2",
    "@lightcrm/core": "workspace:*",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "vitest": "^2.0.5"
  }
}
```

- [ ] **Step 2: Create tsconfig**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "types": ["vitest/globals"]
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Add path alias**

Add to `tsconfig.base.json` paths:

```json
"@lightcrm/orchestrator": ["packages/orchestrator/src/index.ts"]
```

- [ ] **Step 4: Run package typecheck**

Run: `pnpm --filter @lightcrm/orchestrator typecheck`

Expected: passes once source files exist.

## Task 2: Orchestration Types And Rules

**Files:**
- Create: `packages/orchestrator/src/types.ts`
- Create: `packages/orchestrator/src/rules.ts`
- Test: `packages/orchestrator/src/graph.test.ts`

- [ ] **Step 1: Define durable action-plan types**

```ts
export type CrmIntent =
  | "create_new_lead"
  | "update_existing_lead"
  | "create_contact"
  | "update_contact"
  | "create_reminder"
  | "create_meeting"
  | "generate_offer"
  | "delete_or_undo"
  | "clarification"
  | "unknown";

export type RiskLevel = "auto" | "review" | "blocked";

export type ExtractedFacts = {
  contactName: string | null;
  projectName: string | null;
  projectType: string | null;
  location: string | null;
  areaM2: number | null;
  phone: string | null;
  budgetEur: number | null;
  dueAt: string | null;
  sourceMessageId: string | null;
  evidence: MessageEvidence;
};

export type PlannedCrmAction = {
  type: "create_lead" | "update_lead" | "create_reminder" | "create_contact" | "request_review";
  risk: RiskLevel;
  reason: string;
  payload: Record<string, unknown>;
};

export type MessageEvidence = {
  sourceMessageId: string | null;
  author: string | null;
  sourceChannel: "telegram" | "manual" | "import";
  textSnippet: string;
};
```

- [ ] **Step 2: Encode high-priority new-lead rules**

Implement `classifyIntentByRules(text: string): CrmIntent` so these phrases return `create_new_lead`: `новый клиент`, `новый лид`, `ещё новый лид`, `следующий клиент`, `следующий объект`, `следующего потенциального клиента`, `это новый лид`, `снова клиент`.

- [ ] **Step 3: Encode risk rules**

Implement `riskCheck(intent, facts, text)`:
- `delete_or_undo`, `generate_offer`, and suspicious name-only updates return `review`.
- `create_new_lead` returns `auto` even if contact name matches an existing lead.
- `unknown` returns `review`.
- Future write-enabled nodes must return `review` for linking records, converting leads, archiving/deleting, overwriting non-empty fields, and updating an existing lead when evidence is weak or based only on recency.
- Every planned action payload must include `sourceChannel`, `externalMessageId`, and `evidence` so later CRM writes can populate the existing source fields.

## Task 3: LangGraph Pipeline

**Files:**
- Create: `packages/orchestrator/src/graph.ts`
- Modify: `packages/orchestrator/src/index.ts`
- Test: `packages/orchestrator/src/graph.test.ts`

- [ ] **Step 1: Write failing tests**

Test examples:
- `"Ещё новый лид: снова Максим Тютюник, проект в Швейцарии, частный дом"` plans `create_lead`, not update.
- `"Имя клиента - Максим Тютюник"` plans `request_review`.
- `"Следующего потенциального клиента-застройщика зовут Артур Grauberger. У него пока нет никакого конкретного проекта..."` still plans a `create_lead` or `create_contact` reviewable opportunity, not drops it.
- `"Это в понедельник в 10 утра, 8 июня"` plans a reminder.

These strings must remain real UTF-8 Russian/German text in source files, not mojibake. Use message ids `1869`, `1878`, `arthur`, and `ufuk-follow-up` in tests.

- [ ] **Step 2: Implement graph nodes**

Use nodes:
- `normalize_message`
- `extract_facts`
- `classify_intent`
- `resolve_entities`
- `decide_action`
- `risk_check`

- [ ] **Step 3: Compile with LangGraph**

Use official LangGraph JS `StateGraph` with `Annotation`, `START`, and `END`. The compiled graph should expose `runCrmOrchestration(input)`.

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @lightcrm/orchestrator test`

Expected: all examples pass.

## Task 4: Dry-Run API

**Files:**
- Modify: `apps/web/package.json`
- Create: `apps/web/app/api/crm/orchestrator/dry-run/route.ts`

- [ ] **Step 1: Add workspace dependency**

Add:

```json
"@lightcrm/orchestrator": "workspace:*"
```

- [ ] **Step 2: Add POST endpoint**

Endpoint accepts:

```json
{
  "messageId": "1869",
  "author": "Катя",
  "text": "Ещё новый лид: снова Максим Тютюник, проект в Швейцарии, частный дом"
}
```

Response returns intent, facts, action plan, risk, explanation, and message evidence. It must not write to CRM.

- [ ] **Step 3: Test with curl or Playwright request**

Run POSTs for the supplied Katya examples and verify risky cases return `request_review`.

## Task 5: Verification

**Files:**
- All changed files.

- [ ] **Step 1: Run package tests**

Run: `pnpm test`

Expected: all tests pass.

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`

Expected: all packages pass.

- [ ] **Step 3: Run production build**

Run: `pnpm build`

Expected: Next build passes and includes `/api/crm/orchestrator/dry-run`.

- [ ] **Step 4: Smoke test real messages**

Use the dry-run endpoint with messages 1869, 1878, Arthur Grauberger, and the 8 June follow-up. Confirm the plan matches the desired behavior from the pasted analysis.

## Self-Review

- Spec coverage: intent-first flow, entity-resolution guardrail, risky-action review, potential developer without project, and message evidence/provenance propagation are represented.
- Placeholder scan: no TODO/TBD steps remain.
- Type consistency: `CrmIntent`, `ExtractedFacts`, `PlannedCrmAction`, and `runCrmOrchestration` are consistently named across tasks.
