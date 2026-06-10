# Semantic LangGraph Orchestrator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace hardcoded phrase/regex CRM orchestration with a semantic LangGraph pipeline whose prompts, taxonomy, field mapping, safety thresholds, and graph behavior are configurable from Settings UI.

**Architecture:** Build LangGraph v2 around meaning-first nodes: intake, context, relationship memory, intent classification, target resolution, entity extraction, validation, action planning, and execution gating. LLM nodes return strict JSON validated by Zod; deterministic code validates schemas, duplicate risk, permissions, mandatory fields, and audit/undo requirements. No Russian phrases, person names, city lists, or CRM wording regexes remain in orchestration logic.

**Tech Stack:** TypeScript, Next.js API routes, React Settings UI, `@langchain/langgraph`, Zod, existing `@lightcrm/core` CRM APIs, OpenAI-compatible JSON model calls via runtime settings.

---

## Current Problem

The current orchestrator in `packages/orchestrator/src/rules.ts` classifies and extracts data with hardcoded phrase arrays, regexes, person names, locations, and fixed date patterns. That makes the CRM brittle: messages are interpreted by words rather than meaning, and any new phrase requires code changes.

The target behavior is:

```text
Read whole message
  -> understand business meaning
  -> resolve context and related CRM entity
  -> extract explicit fields with evidence
  -> validate safety and completeness
  -> plan action
  -> execute only if allowed, otherwise ask confirmation
```

## Target Graph

```text
START
  -> collect_input
  -> build_context
  -> classify_intent
  -> resolve_target
  -> extract_entities
  -> validate_action
  -> plan_action
  -> execution_gate
  -> END
```

## Files And Responsibilities

- Modify: `packages/orchestrator/package.json`
  - Add the LLM client dependency if implementation uses a package; otherwise keep fetch-based provider local.
- Modify: `packages/orchestrator/src/types.ts`
  - Add semantic settings, prompts, node names, confidence structs, field provenance, resolved targets, and v2 action types.
- Create: `packages/orchestrator/src/schemas.ts`
  - Zod schemas for LLM outputs: intent classification, entity extraction, target resolution, validation, action plan.
- Create: `packages/orchestrator/src/llm.ts`
  - Provider interface and OpenAI-compatible JSON call wrapper using `OPENAI_API_KEY`, `settings.model`, `settings.temperature`, and strict Zod parsing.
- Create: `packages/orchestrator/src/context.ts`
  - Context builder contract and a first implementation over existing CRM data inputs.
- Create: `packages/orchestrator/src/semantic-graph.ts`
  - LangGraph v2 nodes and `runSemanticCrmOrchestration`.
- Modify: `packages/orchestrator/src/graph.ts`
  - Route `runCrmOrchestration` to semantic v2 when enabled; keep old graph only as a temporary fallback switch.
- Modify: `packages/orchestrator/src/rules.ts`
  - Remove phrase/regex classification and extraction from active flow. Leave only non-language safety helpers if needed, or delete the file after callers move.
- Modify: `packages/orchestrator/src/settings.ts`
  - Replace phrase arrays with configurable semantic prompt/settings blocks.
- Modify: `packages/orchestrator/src/index.ts`
  - Export semantic graph types and stop encouraging consumers to import rule helpers.
- Modify: `packages/orchestrator/src/graph.test.ts`
  - Replace phrase-based tests with semantic orchestration tests using a fake LLM provider.
- Create: `packages/orchestrator/src/semantic-graph.test.ts`
  - Unit tests for v2 graph nodes and safety gates.
- Modify: `apps/web/app/api/crm/orchestrator/settings/route.ts`
  - Extend settings validation schema for all new LangGraph settings.
- Modify: `apps/web/app/api/crm/orchestrator/settings-store.ts`
  - Persist semantic settings and migrate old settings safely.
- Modify: `apps/web/app/settings/settings-page.tsx`
  - Add UI sections for prompts, entity schema, intent taxonomy, node toggles, thresholds, CRM field mapping, and confirmation policy.
- Modify: `apps/web/app/globals.css`
  - Add layout styles for the expanded LangGraph Settings panels.
- Modify: `apps/web/app/api/crm/orchestrator/dry-run/route.ts`
  - Return v2 semantic result with structured explanation and evidence.
- Modify: `packages/telegram-bot/src/bot-core.ts`
  - Display semantic result fields and clarification requests cleanly.
- Create: `docs/langgraph-semantic-settings.md`
  - Human-readable explanation of every runtime setting after implementation.

---

### Task 1: Expand Semantic Types

**Files:**
- Modify: `packages/orchestrator/src/types.ts`
- Create: `packages/orchestrator/src/schemas.ts`
- Test: `packages/orchestrator/src/semantic-graph.test.ts`

- [ ] **Step 1: Write failing type/schema tests**

Create `packages/orchestrator/src/semantic-graph.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import {
  IntentClassificationSchema,
  EntityExtractionSchema,
  TargetResolutionSchema,
  ValidationDecisionSchema
} from "./schemas";

describe("semantic orchestrator schemas", () => {
  it("accepts intent classification with evidence and confidence", () => {
    const parsed = IntentClassificationSchema.parse({
      primaryIntent: "create_lead",
      secondaryIntents: ["create_reminder"],
      confidence: 0.84,
      reason: "The message describes a new opportunity and asks for a future follow-up.",
      evidence: ["client describes a new house request"]
    });

    expect(parsed.primaryIntent).toBe("create_lead");
    expect(parsed.secondaryIntents).toEqual(["create_reminder"]);
  });

  it("rejects invented entity fields without evidence", () => {
    expect(() =>
      EntityExtractionSchema.parse({
        fields: {
          clientName: { value: "Maxim", confidence: 0.9, evidence: "" }
        },
        missingData: []
      })
    ).toThrow();
  });

  it("accepts target resolution that asks clarification", () => {
    const parsed = TargetResolutionSchema.parse({
      targetType: "lead",
      targetId: null,
      confidence: 0.41,
      candidates: [{ id: "lead-1", label: "L-2026-009 Maxim", score: 0.66, reason: "Similar name" }],
      needsClarification: true,
      clarificationQuestion: "Это новый лид или обновить L-2026-009 Maxim?"
    });

    expect(parsed.needsClarification).toBe(true);
  });

  it("accepts validation decision with human confirmation", () => {
    const parsed = ValidationDecisionSchema.parse({
      approved: false,
      riskLevel: "medium",
      reason: "Possible duplicate lead requires confirmation.",
      needsHumanConfirmation: true
    });

    expect(parsed.approved).toBe(false);
  });
});
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
pnpm --filter @lightcrm/orchestrator test -- semantic-graph.test.ts
```

Expected: FAIL because `./schemas` does not exist.

- [ ] **Step 3: Add semantic types**

Extend `packages/orchestrator/src/types.ts` with these exported types:

```ts
export type SemanticIntent =
  | "create_lead"
  | "update_lead"
  | "create_task"
  | "create_reminder"
  | "create_meeting"
  | "attach_document"
  | "generate_offer_task"
  | "add_lead_note"
  | "ask_clarification"
  | "no_action";

export type SemanticNodeName =
  | "collectInput"
  | "buildContext"
  | "classifyIntent"
  | "resolveTarget"
  | "extractEntities"
  | "validateAction"
  | "planAction"
  | "executionGate";

export type FieldEvidence<T = string | number | boolean | null> = {
  value: T;
  confidence: number;
  evidence: string;
  sourceMessageIds: string[];
};

export type SemanticExtractedEntities = {
  fields: Record<string, FieldEvidence>;
  missingData: string[];
  notes: string[];
};

export type ResolvedTargetCandidate = {
  id: string;
  label: string;
  score: number;
  reason: string;
};

export type ResolvedTarget = {
  targetType: "lead" | "client" | "project" | "task" | "none";
  targetId: string | null;
  confidence: number;
  candidates: ResolvedTargetCandidate[];
  needsClarification: boolean;
  clarificationQuestion: string | null;
};

export type SemanticValidationDecision = {
  approved: boolean;
  riskLevel: "low" | "medium" | "high";
  reason: string;
  needsHumanConfirmation: boolean;
};
```

- [ ] **Step 4: Add Zod schemas**

Create `packages/orchestrator/src/schemas.ts`:

```ts
import { z } from "zod";

export const SemanticIntentSchema = z.enum([
  "create_lead",
  "update_lead",
  "create_task",
  "create_reminder",
  "create_meeting",
  "attach_document",
  "generate_offer_task",
  "add_lead_note",
  "ask_clarification",
  "no_action"
]);

export const IntentClassificationSchema = z.object({
  primaryIntent: SemanticIntentSchema,
  secondaryIntents: z.array(SemanticIntentSchema),
  confidence: z.number().min(0).max(1),
  reason: z.string().min(1),
  evidence: z.array(z.string().min(1))
});

const FieldEvidenceSchema = z.object({
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  confidence: z.number().min(0).max(1),
  evidence: z.string().min(1),
  sourceMessageIds: z.array(z.string())
});

export const EntityExtractionSchema = z.object({
  fields: z.record(FieldEvidenceSchema),
  missingData: z.array(z.string()),
  notes: z.array(z.string()).default([])
});

export const TargetResolutionSchema = z.object({
  targetType: z.enum(["lead", "client", "project", "task", "none"]),
  targetId: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  candidates: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      score: z.number().min(0).max(1),
      reason: z.string()
    })
  ),
  needsClarification: z.boolean(),
  clarificationQuestion: z.string().nullable()
});

export const ValidationDecisionSchema = z.object({
  approved: z.boolean(),
  riskLevel: z.enum(["low", "medium", "high"]),
  reason: z.string().min(1),
  needsHumanConfirmation: z.boolean()
});
```

- [ ] **Step 5: Run test and verify it passes**

Run:

```bash
pnpm --filter @lightcrm/orchestrator test -- semantic-graph.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/orchestrator/src/types.ts packages/orchestrator/src/schemas.ts packages/orchestrator/src/semantic-graph.test.ts
git commit -m "feat(orchestrator): add semantic graph schemas"
```

---

### Task 2: Replace Phrase Settings With Semantic Settings

**Files:**
- Modify: `packages/orchestrator/src/types.ts`
- Modify: `packages/orchestrator/src/settings.ts`
- Modify: `apps/web/app/api/crm/orchestrator/settings/route.ts`
- Test: `packages/orchestrator/src/semantic-graph.test.ts`

- [ ] **Step 1: Write failing settings merge test**

Append to `packages/orchestrator/src/semantic-graph.test.ts`:

```ts
import { mergeLangGraphSettings } from "./settings";

describe("semantic runtime settings", () => {
  it("keeps prompts and thresholds in runtime settings", () => {
    const settings = mergeLangGraphSettings({
      id: "custom",
      semanticMode: true,
      prompts: {
        systemRole: "You are an AI Chief of Staff for an architecture bureau.",
        intentClassifier: "Classify the business meaning and return JSON.",
        entityExtractor: "Extract only explicit fields with evidence.",
        targetResolver: "Resolve CRM target or ask clarification.",
        validationGuard: "Reject duplicates and hallucinated fields.",
        actionPlanner: "Plan safe CRM actions."
      },
      thresholds: {
        autoExecute: 0.82,
        askConfirmation: 0.55,
        duplicateCandidate: 0.72
      }
    });

    expect(settings.semanticMode).toBe(true);
    expect(settings.prompts.intentClassifier).toContain("business meaning");
    expect(settings.thresholds.duplicateCandidate).toBe(0.72);
  });
});
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
pnpm --filter @lightcrm/orchestrator test -- semantic-graph.test.ts
```

Expected: FAIL because semantic settings do not exist.

- [ ] **Step 3: Extend settings type**

Add to `LangGraphRuntimeSettings` in `packages/orchestrator/src/types.ts`:

```ts
  semanticMode: boolean;
  prompts: {
    systemRole: string;
    intentClassifier: string;
    entityExtractor: string;
    targetResolver: string;
    validationGuard: string;
    actionPlanner: string;
  };
  taxonomy: {
    intents: SemanticIntent[];
    entityFields: string[];
    requiredFieldsByAction: Record<string, string[]>;
  };
  thresholds: {
    autoExecute: number;
    askConfirmation: number;
    duplicateCandidate: number;
  };
  confirmationPolicy: {
    requireConfirmationForWrites: boolean;
    requireConfirmationForDuplicateCandidates: boolean;
    allowAutoCreateLead: boolean;
    allowAutoCreateReminder: boolean;
  };
```

Keep legacy fields for one migration release, but mark them as unused by semantic mode:

```ts
  extraNewLeadPhrases: string[];
  mailAnalysisPhrases: string[];
  reminderPhrases: string[];
```

- [ ] **Step 4: Update default settings**

In `packages/orchestrator/src/settings.ts`, define:

```ts
const defaultPrompts = {
  systemRole:
    "You are an operational AI Chief of Staff for an architecture bureau. Understand the whole message before deciding CRM actions. Return only valid JSON for the requested schema.",
  intentClassifier:
    "Classify the business meaning of the message. Do not rely on isolated keywords. If the message negates an action, classify the negated meaning. If uncertain, choose ask_clarification.",
  entityExtractor:
    "Extract only data explicitly stated or directly implied by the message and context. Every field must include evidence and confidence. Do not invent missing values.",
  targetResolver:
    "Resolve whether the message refers to an existing CRM entity or a new opportunity. Use candidates and context. If ambiguous, ask a clarification question.",
  validationGuard:
    "Reject unsafe actions: duplicate creation, writes without resolved target, hallucinated fields, missing required offer fields, or destructive operations without confirmation.",
  actionPlanner:
    "Plan CRM actions only after intent, target, extracted entities, and validation are available."
};

const defaultTaxonomy = {
  intents: [
    "create_lead",
    "update_lead",
    "create_task",
    "create_reminder",
    "create_meeting",
    "attach_document",
    "generate_offer_task",
    "add_lead_note",
    "ask_clarification",
    "no_action"
  ],
  entityFields: [
    "clientName",
    "company",
    "requestType",
    "projectAddress",
    "areaM2",
    "budgetEur",
    "phone",
    "email",
    "desiredStart",
    "desiredMoveIn",
    "meetingDateTime",
    "reminderDateTime",
    "notes"
  ],
  requiredFieldsByAction: {
    create_lead: ["clientName"],
    update_lead: [],
    create_meeting: ["meetingDateTime"],
    create_reminder: ["reminderDateTime"],
    generate_offer_task: ["clientName", "requestType"]
  }
};
```

Set every preset to `semanticMode: true` and empty phrase arrays:

```ts
extraNewLeadPhrases: [],
mailAnalysisPhrases: [],
reminderPhrases: [],
```

- [ ] **Step 5: Extend settings API schema**

In `apps/web/app/api/crm/orchestrator/settings/route.ts`, add Zod validation for `semanticMode`, `prompts`, `taxonomy`, `thresholds`, and `confirmationPolicy`. Keep legacy phrase arrays optional for migration:

```ts
semanticMode: z.boolean(),
prompts: z.object({
  systemRole: z.string().min(1),
  intentClassifier: z.string().min(1),
  entityExtractor: z.string().min(1),
  targetResolver: z.string().min(1),
  validationGuard: z.string().min(1),
  actionPlanner: z.string().min(1)
}),
taxonomy: z.object({
  intents: z.array(z.string().min(1)),
  entityFields: z.array(z.string().min(1)),
  requiredFieldsByAction: z.record(z.array(z.string()))
}),
thresholds: z.object({
  autoExecute: z.number().min(0).max(1),
  askConfirmation: z.number().min(0).max(1),
  duplicateCandidate: z.number().min(0).max(1)
}),
confirmationPolicy: z.object({
  requireConfirmationForWrites: z.boolean(),
  requireConfirmationForDuplicateCandidates: z.boolean(),
  allowAutoCreateLead: z.boolean(),
  allowAutoCreateReminder: z.boolean()
})
```

- [ ] **Step 6: Run tests**

Run:

```bash
pnpm --filter @lightcrm/orchestrator test -- semantic-graph.test.ts
pnpm --filter @lightcrm/web typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/orchestrator/src/types.ts packages/orchestrator/src/settings.ts packages/orchestrator/src/semantic-graph.test.ts apps/web/app/api/crm/orchestrator/settings/route.ts
git commit -m "feat(orchestrator): move semantic behavior into runtime settings"
```

---

### Task 3: Add LLM Provider With Strict JSON Parsing

**Files:**
- Create: `packages/orchestrator/src/llm.ts`
- Modify: `packages/orchestrator/src/semantic-graph.test.ts`
- Modify: `packages/orchestrator/package.json`

- [ ] **Step 1: Write failing fake-provider test**

Append:

```ts
import { createJsonLlmClient } from "./llm";
import { IntentClassificationSchema } from "./schemas";

describe("json llm client", () => {
  it("parses provider JSON through the supplied schema", async () => {
    const client = createJsonLlmClient({
      callJson: async () => ({
        primaryIntent: "add_lead_note",
        secondaryIntents: [],
        confidence: 0.77,
        reason: "The message adds context but does not request a write to a specific field.",
        evidence: ["general project context"]
      })
    });

    const result = await client.runJson({
      schema: IntentClassificationSchema,
      system: "system",
      user: "user",
      model: "fake",
      temperature: 0
    });

    expect(result.primaryIntent).toBe("add_lead_note");
  });
});
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
pnpm --filter @lightcrm/orchestrator test -- semantic-graph.test.ts
```

Expected: FAIL because `./llm` does not exist.

- [ ] **Step 3: Implement provider wrapper**

Create `packages/orchestrator/src/llm.ts`:

```ts
import type { z } from "zod";

export type JsonLlmCallInput = {
  system: string;
  user: string;
  model: string;
  temperature: number;
};

export type JsonLlmProvider = {
  callJson(input: JsonLlmCallInput): Promise<unknown>;
};

export type RunJsonInput<T extends z.ZodTypeAny> = JsonLlmCallInput & {
  schema: T;
};

export function createJsonLlmClient(provider: JsonLlmProvider) {
  return {
    async runJson<T extends z.ZodTypeAny>(input: RunJsonInput<T>): Promise<z.infer<T>> {
      const raw = await provider.callJson(input);
      return input.schema.parse(raw);
    }
  };
}

export function createOpenAiJsonProvider(fetchImpl: typeof fetch = fetch): JsonLlmProvider {
  return {
    async callJson(input) {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error("OPENAI_API_KEY is required for semantic LangGraph mode.");
      }

      const response = await fetchImpl("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: input.model,
          temperature: input.temperature,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: input.system },
            { role: "user", content: input.user }
          ]
        })
      });

      const payload = (await response.json()) as {
        error?: { message?: string };
        choices?: Array<{ message?: { content?: string } }>;
      };

      if (!response.ok) {
        throw new Error(payload.error?.message ?? "OpenAI JSON call failed.");
      }

      const content = payload.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error("OpenAI JSON call returned no content.");
      }

      return JSON.parse(content) as unknown;
    }
  };
}
```

- [ ] **Step 4: Run test**

Run:

```bash
pnpm --filter @lightcrm/orchestrator test -- semantic-graph.test.ts
pnpm --filter @lightcrm/orchestrator typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/orchestrator/src/llm.ts packages/orchestrator/src/semantic-graph.test.ts packages/orchestrator/package.json
git commit -m "feat(orchestrator): add strict json llm provider"
```

---

### Task 4: Build Context And Relationship Memory Contract

**Files:**
- Create: `packages/orchestrator/src/context.ts`
- Modify: `packages/orchestrator/src/types.ts`
- Modify: `packages/orchestrator/src/semantic-graph.test.ts`

- [ ] **Step 1: Write failing context test**

Append:

```ts
import { buildOrchestrationContext } from "./context";

describe("orchestration context", () => {
  it("builds relationship memory without hardcoded names", async () => {
    const context = await buildOrchestrationContext({
      input: {
        workspaceId: "default",
        messageId: "m-1",
        author: "architect",
        text: "это снова Максим, нужно подготовить предложение",
        sourceChannel: "telegram"
      },
      recentLeads: [
        { id: "lead-1", label: "L-2026-009 Maxim T.", summary: "Private house in Munich", lastTouchedAt: "2026-06-10T10:00:00.000Z" }
      ],
      recentMessages: [{ id: "m-0", text: "Maxim asked about a private house", createdAt: "2026-06-10T09:00:00.000Z" }]
    });

    expect(context.recentLeads[0].id).toBe("lead-1");
    expect(context.relationshipHints).toContain("Previous related CRM activity is available.");
  });
});
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
pnpm --filter @lightcrm/orchestrator test -- semantic-graph.test.ts
```

Expected: FAIL because `./context` does not exist.

- [ ] **Step 3: Add context types**

Add to `packages/orchestrator/src/types.ts`:

```ts
export type ContextLeadCandidate = {
  id: string;
  label: string;
  summary: string | null;
  lastTouchedAt: string | null;
};

export type ContextMessage = {
  id: string;
  text: string;
  createdAt: string;
};

export type OrchestrationContextInput = {
  input: CrmOrchestrationInput;
  recentLeads?: ContextLeadCandidate[];
  recentMessages?: ContextMessage[];
};

export type OrchestrationContext = {
  source: CrmOrchestrationInput;
  recentLeads: ContextLeadCandidate[];
  recentMessages: ContextMessage[];
  relationshipHints: string[];
};
```

- [ ] **Step 4: Implement context builder**

Create `packages/orchestrator/src/context.ts`:

```ts
import type { OrchestrationContext, OrchestrationContextInput } from "./types";

export async function buildOrchestrationContext(input: OrchestrationContextInput): Promise<OrchestrationContext> {
  const recentLeads = input.recentLeads ?? [];
  const recentMessages = input.recentMessages ?? [];
  return {
    source: input.input,
    recentLeads,
    recentMessages,
    relationshipHints: recentLeads.length > 0 || recentMessages.length > 0 ? ["Previous related CRM activity is available."] : []
  };
}

export function contextToPrompt(context: OrchestrationContext): string {
  return JSON.stringify(
    {
      message: context.source,
      recentLeads: context.recentLeads,
      recentMessages: context.recentMessages,
      relationshipHints: context.relationshipHints
    },
    null,
    2
  );
}
```

- [ ] **Step 5: Run test**

Run:

```bash
pnpm --filter @lightcrm/orchestrator test -- semantic-graph.test.ts
pnpm --filter @lightcrm/orchestrator typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/orchestrator/src/types.ts packages/orchestrator/src/context.ts packages/orchestrator/src/semantic-graph.test.ts
git commit -m "feat(orchestrator): add relationship context contract"
```

---

### Task 5: Implement Semantic LangGraph V2

**Files:**
- Create: `packages/orchestrator/src/semantic-graph.ts`
- Modify: `packages/orchestrator/src/graph.ts`
- Modify: `packages/orchestrator/src/index.ts`
- Modify: `packages/orchestrator/src/semantic-graph.test.ts`

- [ ] **Step 1: Write failing semantic graph test**

Append:

```ts
import { runSemanticCrmOrchestration } from "./semantic-graph";

describe("semantic crm orchestration", () => {
  it("uses meaning-based intent, target resolution, extraction, and validation", async () => {
    const calls: string[] = [];
    const result = await runSemanticCrmOrchestration(
      {
        workspaceId: "default",
        messageId: "m-2",
        author: "architect",
        text: "Нет, это не новый лид. Это информация по Максиму, добавь как заметку.",
        sourceChannel: "telegram"
      },
      {
        llmProvider: {
          async callJson(input) {
            calls.push(input.system);
            if (input.system.includes("Classify")) {
              return {
                primaryIntent: "add_lead_note",
                secondaryIntents: [],
                confidence: 0.91,
                reason: "The user explicitly negates new lead and asks to add a note.",
                evidence: ["не новый лид", "добавь как заметку"]
              };
            }
            if (input.system.includes("Resolve")) {
              return {
                targetType: "lead",
                targetId: "lead-maxim",
                confidence: 0.86,
                candidates: [{ id: "lead-maxim", label: "Maxim current project", score: 0.86, reason: "Context mentions Maxim" }],
                needsClarification: false,
                clarificationQuestion: null
              };
            }
            if (input.system.includes("Extract")) {
              return {
                fields: {
                  notes: { value: "Information should be added as a note.", confidence: 0.9, evidence: "добавь как заметку", sourceMessageIds: ["m-2"] }
                },
                missingData: [],
                notes: ["Negated create lead."]
              };
            }
            return {
              approved: true,
              riskLevel: "low",
              reason: "Resolved note update with explicit target.",
              needsHumanConfirmation: false
            };
          }
        }
      }
    );

    expect(result.intent).toBe("add_lead_note");
    expect(result.actions[0]).toMatchObject({ type: "update_lead", risk: "auto" });
    expect(result.actions[0]?.payload).toMatchObject({ targetId: "lead-maxim" });
  });
});
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
pnpm --filter @lightcrm/orchestrator test -- semantic-graph.test.ts
```

Expected: FAIL because `./semantic-graph` does not exist.

- [ ] **Step 3: Implement semantic graph**

Create `packages/orchestrator/src/semantic-graph.ts` with nodes:

```ts
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { buildOrchestrationContext, contextToPrompt } from "./context";
import { createJsonLlmClient, createOpenAiJsonProvider, type JsonLlmProvider } from "./llm";
import { DEFAULT_LANGGRAPH_SETTINGS, mergeLangGraphSettings } from "./settings";
import { EntityExtractionSchema, IntentClassificationSchema, TargetResolutionSchema, ValidationDecisionSchema } from "./schemas";
import type {
  CrmOrchestrationInput,
  CrmOrchestrationResult,
  LangGraphRuntimeSettings,
  PlannedCrmAction,
  RiskLevel,
  SemanticExtractedEntities,
  SemanticIntent,
  SemanticValidationDecision,
  ResolvedTarget,
  OrchestrationContext
} from "./types";

type SemanticDeps = {
  llmProvider?: JsonLlmProvider;
};

const SemanticAnnotation = Annotation.Root({
  input: Annotation<CrmOrchestrationInput>,
  settings: Annotation<LangGraphRuntimeSettings>,
  context: Annotation<OrchestrationContext | null>,
  intent: Annotation<SemanticIntent>,
  intentConfidence: Annotation<number>,
  target: Annotation<ResolvedTarget | null>,
  entities: Annotation<SemanticExtractedEntities | null>,
  validation: Annotation<SemanticValidationDecision | null>,
  risk: Annotation<RiskLevel>,
  actions: Annotation<PlannedCrmAction[]>,
  explanations: Annotation<string[]>({
    reducer: (left, right) => [...left, ...right],
    default: () => []
  }),
  deps: Annotation<SemanticDeps>
});

type SemanticState = typeof SemanticAnnotation.State;

function modelSettings(state: SemanticState) {
  return { model: state.settings.model, temperature: state.settings.temperature };
}

async function collectInput(state: SemanticState): Promise<Partial<SemanticState>> {
  return { explanations: [`Received ${state.input.sourceChannel ?? "telegram"} message.`] };
}

async function buildContext(state: SemanticState): Promise<Partial<SemanticState>> {
  return { context: await buildOrchestrationContext({ input: state.input }) };
}

async function classifyIntent(state: SemanticState): Promise<Partial<SemanticState>> {
  const llm = createJsonLlmClient(state.deps.llmProvider ?? createOpenAiJsonProvider());
  const result = await llm.runJson({
    schema: IntentClassificationSchema,
    system: `Classify intent. ${state.settings.prompts.systemRole}\n${state.settings.prompts.intentClassifier}`,
    user: contextToPrompt(state.context!),
    ...modelSettings(state)
  });
  return {
    intent: result.primaryIntent,
    intentConfidence: result.confidence,
    explanations: [result.reason]
  };
}

async function resolveTarget(state: SemanticState): Promise<Partial<SemanticState>> {
  const llm = createJsonLlmClient(state.deps.llmProvider ?? createOpenAiJsonProvider());
  const result = await llm.runJson({
    schema: TargetResolutionSchema,
    system: `Resolve CRM target. ${state.settings.prompts.systemRole}\n${state.settings.prompts.targetResolver}`,
    user: JSON.stringify({ context: state.context, intent: state.intent }, null, 2),
    ...modelSettings(state)
  });
  return { target: result };
}

async function extractEntities(state: SemanticState): Promise<Partial<SemanticState>> {
  const llm = createJsonLlmClient(state.deps.llmProvider ?? createOpenAiJsonProvider());
  const result = await llm.runJson({
    schema: EntityExtractionSchema,
    system: `Extract entities. ${state.settings.prompts.systemRole}\n${state.settings.prompts.entityExtractor}`,
    user: JSON.stringify({ context: state.context, intent: state.intent, target: state.target, fields: state.settings.taxonomy.entityFields }, null, 2),
    ...modelSettings(state)
  });
  return { entities: result };
}

async function validateAction(state: SemanticState): Promise<Partial<SemanticState>> {
  const llm = createJsonLlmClient(state.deps.llmProvider ?? createOpenAiJsonProvider());
  const result = await llm.runJson({
    schema: ValidationDecisionSchema,
    system: `Validate action. ${state.settings.prompts.systemRole}\n${state.settings.prompts.validationGuard}`,
    user: JSON.stringify({ intent: state.intent, target: state.target, entities: state.entities, thresholds: state.settings.thresholds }, null, 2),
    ...modelSettings(state)
  });
  const risk: RiskLevel = result.approved && !result.needsHumanConfirmation ? "auto" : "review";
  return { validation: result, risk, explanations: [result.reason] };
}

function planAction(state: SemanticState): Partial<SemanticState> {
  const basePayload = {
    intent: state.intent,
    targetId: state.target?.targetId ?? null,
    targetType: state.target?.targetType ?? "none",
    entities: state.entities,
    evidence: {
      sourceMessageId: state.input.messageId ?? null,
      author: state.input.author ?? null,
      sourceChannel: state.input.sourceChannel ?? "telegram",
      textSnippet: state.input.text.slice(0, 240)
    }
  };

  if (state.risk !== "auto" || state.intent === "ask_clarification" || state.target?.needsClarification) {
    return {
      actions: [{
        type: "request_review",
        risk: "review",
        reason: state.target?.clarificationQuestion ?? state.validation?.reason ?? "Human confirmation required.",
        payload: basePayload
      }]
    };
  }

  const actionType =
    state.intent === "create_lead"
      ? "create_lead"
      : state.intent === "create_reminder"
        ? "create_reminder"
        : state.intent === "add_lead_note" || state.intent === "update_lead"
          ? "update_lead"
          : "request_review";

  return {
    actions: [{
      type: actionType,
      risk: actionType === "request_review" ? "review" : "auto",
      reason: state.validation?.reason ?? "Semantic orchestration approved action.",
      payload: basePayload
    }]
  };
}

function executionGate(state: SemanticState): Partial<SemanticState> {
  if (state.settings.confirmationPolicy.requireConfirmationForWrites && state.actions[0]?.type !== "request_review") {
    return {
      actions: [{
        type: "request_review",
        risk: "review",
        reason: "Runtime settings require confirmation for write operations.",
        payload: state.actions[0]?.payload ?? {}
      }]
    };
  }
  return {};
}

export function createSemanticCrmOrchestratorGraph() {
  return new StateGraph(SemanticAnnotation)
    .addNode("collect_input", collectInput)
    .addNode("build_context", buildContext)
    .addNode("classify_intent", classifyIntent)
    .addNode("resolve_target", resolveTarget)
    .addNode("extract_entities", extractEntities)
    .addNode("validate_action", validateAction)
    .addNode("plan_action", planAction)
    .addNode("execution_gate", executionGate)
    .addEdge(START, "collect_input")
    .addEdge("collect_input", "build_context")
    .addEdge("build_context", "classify_intent")
    .addEdge("classify_intent", "resolve_target")
    .addEdge("resolve_target", "extract_entities")
    .addEdge("extract_entities", "validate_action")
    .addEdge("validate_action", "plan_action")
    .addEdge("plan_action", "execution_gate")
    .addEdge("execution_gate", END)
    .compile();
}

const semanticGraph = createSemanticCrmOrchestratorGraph();

export async function runSemanticCrmOrchestration(
  input: CrmOrchestrationInput,
  deps: SemanticDeps = {},
  settingsInput?: Partial<LangGraphRuntimeSettings> | null
): Promise<CrmOrchestrationResult> {
  const settings = mergeLangGraphSettings(settingsInput ?? DEFAULT_LANGGRAPH_SETTINGS);
  const result = await semanticGraph.invoke({
    input,
    settings,
    context: null,
    intent: "no_action",
    intentConfidence: 0,
    target: null,
    entities: null,
    validation: null,
    risk: "review",
    actions: [],
    deps
  });

  return {
    workspaceId: input.workspaceId,
    normalizedText: input.text.trim().replace(/\s+/g, " "),
    intent: result.intent,
    facts: {
      contactName: null,
      projectName: null,
      projectType: null,
      location: null,
      areaM2: null,
      phone: null,
      budgetEur: null,
      dueAt: null,
      sourceMessageId: input.messageId ?? null,
      evidence: {
        sourceMessageId: input.messageId ?? null,
        author: input.author ?? null,
        sourceChannel: input.sourceChannel ?? "telegram",
        textSnippet: input.text.slice(0, 240)
      }
    },
    actions: result.actions,
    risk: result.risk,
    explanations: result.explanations,
    settings
  };
}
```

- [ ] **Step 4: Export semantic graph**

Modify `packages/orchestrator/src/index.ts`:

```ts
export * from "./graph";
export * from "./semantic-graph";
export * from "./settings";
export * from "./types";
export * from "./schemas";
```

Do not export `rules.ts` from the public index after semantic mode is wired.

- [ ] **Step 5: Run test**

Run:

```bash
pnpm --filter @lightcrm/orchestrator test -- semantic-graph.test.ts
pnpm --filter @lightcrm/orchestrator typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/orchestrator/src/semantic-graph.ts packages/orchestrator/src/index.ts packages/orchestrator/src/semantic-graph.test.ts
git commit -m "feat(orchestrator): add semantic langgraph pipeline"
```

---

### Task 6: Route Dry-Run And Telegram Through Semantic Mode

**Files:**
- Modify: `packages/orchestrator/src/graph.ts`
- Modify: `apps/web/app/api/crm/orchestrator/dry-run/route.ts`
- Modify: `packages/telegram-bot/src/bot-core.ts`
- Test: `packages/telegram-bot/src/bot.test.ts`

- [ ] **Step 1: Write failing route compatibility test**

Add a telegram bot test asserting that a semantic result with intent `add_lead_note` is formatted without pretending it is a new lead:

```ts
import { formatOrchestrationReply } from "./bot-core";

it("formats semantic note orchestration results", () => {
  const reply = formatOrchestrationReply({
    workspaceId: "default",
    normalizedText: "Нет, это не новый лид",
    intent: "add_lead_note",
    risk: "review",
    actions: [{ type: "request_review", risk: "review", reason: "Need target confirmation.", payload: {} }],
    explanations: ["The message negates lead creation."],
    facts: {
      contactName: null,
      projectName: null,
      projectType: null,
      location: null,
      areaM2: null,
      phone: null,
      budgetEur: null,
      dueAt: null,
      sourceMessageId: "m-1",
      evidence: { sourceMessageId: "m-1", author: "architect", sourceChannel: "telegram", textSnippet: "Нет, это не новый лид" }
    },
    settings: {} as never
  });

  expect(reply).toContain("Intent: add_lead_note");
  expect(reply).toContain("Action: request_review");
});
```

- [ ] **Step 2: Run test**

Run:

```bash
pnpm --filter @lightcrm/telegram-bot test
```

Expected: FAIL until type unions include semantic intents.

- [ ] **Step 3: Route `runCrmOrchestration`**

In `packages/orchestrator/src/graph.ts`, import semantic runner and route when `settings.semanticMode` is true:

```ts
import { runSemanticCrmOrchestration } from "./semantic-graph";
```

Inside `runCrmOrchestration` before invoking old graph:

```ts
const settings = mergeLangGraphSettings(settingsInput ?? DEFAULT_LANGGRAPH_SETTINGS);
if (settings.semanticMode) {
  return runSemanticCrmOrchestration(input, {}, settings);
}
```

- [ ] **Step 4: Update dry-run route**

Keep `apps/web/app/api/crm/orchestrator/dry-run/route.ts` API shape unchanged. It should call `runCrmOrchestration(...)`; routing happens inside the package.

- [ ] **Step 5: Update Telegram formatting**

In `packages/telegram-bot/src/bot-core.ts`, make `formatOrchestrationReply` handle semantic intents and payload target:

```ts
const targetId = action?.payload && typeof action.payload === "object" ? (action.payload as { targetId?: unknown }).targetId : null;
```

Add line:

```ts
targetId ? `Target: ${String(targetId)}` : null,
```

- [ ] **Step 6: Run tests**

Run:

```bash
pnpm --filter @lightcrm/orchestrator test
pnpm --filter @lightcrm/telegram-bot test
pnpm --filter @lightcrm/web typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/orchestrator/src/graph.ts apps/web/app/api/crm/orchestrator/dry-run/route.ts packages/telegram-bot/src/bot-core.ts packages/telegram-bot/src/bot.test.ts
git commit -m "feat(orchestrator): route crm intake through semantic mode"
```

---

### Task 7: Expand Settings UI For Full LangGraph Configuration

**Files:**
- Modify: `apps/web/app/settings/settings-page.tsx`
- Modify: `apps/web/app/globals.css`
- Modify: `docs/langgraph-semantic-settings.md`
- Test: `apps/web/app/api/crm/orchestrator/settings/route.ts`

- [ ] **Step 1: Add Settings UI sections**

Replace the old `Language` panel with these panels:

```tsx
<section className="settingsPanel wide">
  <h2>Semantic Prompts</h2>
  {(["systemRole", "intentClassifier", "entityExtractor", "targetResolver", "validationGuard", "actionPlanner"] as const).map((key) => (
    <label key={key}>
      <span>{key}</span>
      <textarea
        rows={5}
        value={settings.prompts[key]}
        onChange={(event) =>
          patchSettings({
            prompts: {
              ...settings.prompts,
              [key]: event.target.value
            }
          })
        }
      />
    </label>
  ))}
</section>

<section className="settingsPanel wide">
  <h2>Taxonomy</h2>
  <label>
    <span>Entity fields</span>
    <textarea
      rows={6}
      value={settings.taxonomy.entityFields.join("\n")}
      onChange={(event) =>
        patchSettings({
          taxonomy: {
            ...settings.taxonomy,
            entityFields: parsePhrases(event.target.value)
          }
        })
      }
    />
  </label>
</section>
```

- [ ] **Step 2: Add thresholds and confirmation policy controls**

Add to the `Gates` panel:

```tsx
<label>
  <span>Auto execute {percent(settings.thresholds.autoExecute)}</span>
  <input
    max="1"
    min="0"
    step="0.01"
    type="range"
    value={settings.thresholds.autoExecute}
    onChange={(event) =>
      patchSettings({
        thresholds: {
          ...settings.thresholds,
          autoExecute: Number(event.target.value)
        }
      })
    }
  />
</label>
<label className="switchRow">
  <input
    checked={settings.confirmationPolicy.requireConfirmationForWrites}
    type="checkbox"
    onChange={(event) =>
      patchSettings({
        confirmationPolicy: {
          ...settings.confirmationPolicy,
          requireConfirmationForWrites: event.target.checked
        }
      })
    }
  />
  <span>Confirm all writes</span>
</label>
```

- [ ] **Step 3: Remove old phrase fields from UI**

Delete labels for:

```tsx
New lead phrases
Mail analysis phrases
Reminder phrases
```

These arrays remain in the API only for migration compatibility, not as active product controls.

- [ ] **Step 4: Document settings**

Create `docs/langgraph-semantic-settings.md`:

```md
# LangGraph Semantic Settings

`semanticMode` enables meaning-first orchestration.

`prompts.systemRole` defines the AI Chief of Staff role.
`prompts.intentClassifier` controls semantic intent classification.
`prompts.entityExtractor` controls explicit field extraction with evidence.
`prompts.targetResolver` controls existing lead/client/project resolution.
`prompts.validationGuard` controls anti-hallucination and duplicate safety.
`prompts.actionPlanner` controls action planning after validation.

`taxonomy.intents` lists allowed business intents.
`taxonomy.entityFields` lists CRM fields the extractor may return.
`taxonomy.requiredFieldsByAction` defines mandatory fields per action.

`thresholds.autoExecute` is the minimum confidence for auto actions.
`thresholds.askConfirmation` is the lower bound below which clarification is required.
`thresholds.duplicateCandidate` is the score at which similar records block auto-create.

`confirmationPolicy.requireConfirmationForWrites` forces human review for all writes.
`confirmationPolicy.requireConfirmationForDuplicateCandidates` blocks auto-create when similar records exist.
`confirmationPolicy.allowAutoCreateLead` allows create_lead when validation approves it.
`confirmationPolicy.allowAutoCreateReminder` allows create_reminder when validation approves it.
```

- [ ] **Step 5: Run typecheck**

Run:

```bash
pnpm --filter @lightcrm/web typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/settings/settings-page.tsx apps/web/app/globals.css docs/langgraph-semantic-settings.md
git commit -m "feat(settings): expose semantic langgraph configuration"
```

---

### Task 8: Remove Active Rule Parser Logic

**Files:**
- Modify: `packages/orchestrator/src/rules.ts`
- Modify: `packages/orchestrator/src/index.ts`
- Modify: `packages/orchestrator/src/graph.test.ts`
- Test: `packages/orchestrator/src/semantic-graph.test.ts`

- [ ] **Step 1: Add guard test that scans for forbidden hardcoded parser patterns**

Create `packages/orchestrator/src/no-hardcoded-rules.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("orchestrator rule hygiene", () => {
  it("does not keep active phrase or regex parser tables in rules.ts", () => {
    const source = readFileSync(join(__dirname, "rules.ts"), "utf8");

    expect(source).not.toContain("newLeadPhrases");
    expect(source).not.toContain("negatedNewLeadPatterns");
    expect(source).not.toContain("riskyPhrases");
    expect(source).not.toContain("firstMatch(");
    expect(source).not.toContain("includesAnyPhrase(");
  });
});
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
pnpm --filter @lightcrm/orchestrator test -- no-hardcoded-rules.test.ts
```

Expected: FAIL while old parser code exists.

- [ ] **Step 3: Delete active parser implementation**

Replace `packages/orchestrator/src/rules.ts` with safety-only helpers:

```ts
import type { PlannedCrmAction, RiskLevel } from "./types";

export function reviewAction(reason: string, payload: Record<string, unknown> = {}): PlannedCrmAction {
  return {
    type: "request_review",
    risk: "review",
    reason,
    payload
  };
}

export function riskFromConfirmation(needsHumanConfirmation: boolean): RiskLevel {
  return needsHumanConfirmation ? "review" : "auto";
}
```

- [ ] **Step 4: Remove old rule exports**

In `packages/orchestrator/src/index.ts`, keep:

```ts
export * from "./graph";
export * from "./semantic-graph";
export * from "./settings";
export * from "./types";
export * from "./schemas";
```

Do not export `./rules`.

- [ ] **Step 5: Rewrite old tests**

Move old phrase tests out of `graph.test.ts`. Replace them with semantic fake-LLM tests in `semantic-graph.test.ts`:

```ts
it("does not create a lead when the meaning negates lead creation", async () => {
  const result = await runSemanticCrmOrchestration(
    {
      workspaceId: "default",
      messageId: "negated",
      text: "Нет, это не новый лид. Добавь это к существующему проекту.",
      sourceChannel: "telegram"
    },
    {
      llmProvider: {
        async callJson(input) {
          if (input.system.includes("Classify")) {
            return {
              primaryIntent: "update_lead",
              secondaryIntents: [],
              confidence: 0.93,
              reason: "The user negates lead creation and asks to attach information to an existing project.",
              evidence: ["не новый лид", "к существующему проекту"]
            };
          }
          if (input.system.includes("Resolve")) {
            return {
              targetType: "lead",
              targetId: null,
              confidence: 0.45,
              candidates: [],
              needsClarification: true,
              clarificationQuestion: "К какому существующему лиду добавить информацию?"
            };
          }
          if (input.system.includes("Extract")) {
            return { fields: {}, missingData: ["targetLead"], notes: ["Needs target clarification."] };
          }
          return { approved: false, riskLevel: "medium", reason: "No resolved target.", needsHumanConfirmation: true };
        }
      }
    }
  );

  expect(result.actions[0]).toMatchObject({ type: "request_review", risk: "review" });
  expect(result.actions[0]?.reason).toContain("какому");
});
```

- [ ] **Step 6: Run full orchestrator tests**

Run:

```bash
pnpm --filter @lightcrm/orchestrator test
pnpm --filter @lightcrm/orchestrator typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/orchestrator/src/rules.ts packages/orchestrator/src/index.ts packages/orchestrator/src/graph.test.ts packages/orchestrator/src/semantic-graph.test.ts packages/orchestrator/src/no-hardcoded-rules.test.ts
git commit -m "refactor(orchestrator): remove hardcoded phrase parsers"
```

---

### Task 9: Verification, Local Smoke Test, And Release Prep

**Files:**
- Modify if needed: `CHANGELOG.md`
- Modify if needed: `package.json`
- Modify if needed: workspace package versions

- [ ] **Step 1: Run full tests**

Run:

```bash
pnpm --filter @lightcrm/orchestrator test
pnpm --filter @lightcrm/telegram-bot test
pnpm --filter @lightcrm/ui typecheck
pnpm --filter @lightcrm/web typecheck
```

Expected: all commands exit 0.

- [ ] **Step 2: Run local dry-run smoke test**

Start the app if needed:

```bash
$env:PORT=4900; pnpm --filter @lightcrm/web dev -- --port 4900
```

Then call:

```powershell
$body = @{ text = 'Нет, это не новый лид. Это информация по существующему проекту Максима.'; author = 'architect'; sourceChannel = 'telegram' } | ConvertTo-Json
Invoke-WebRequest -Uri http://localhost:4900/api/crm/orchestrator/dry-run -Method POST -Body $body -ContentType 'application/json; charset=utf-8' -UseBasicParsing
```

Expected:

```text
intent is not create_lead
action is request_review unless a target is confidently resolved
response includes explanation and evidence
```

- [ ] **Step 3: Smoke test Settings UI**

Open:

```text
http://localhost:4900/settings
```

Expected:

```text
Semantic Prompts panel is visible
Taxonomy panel is visible
Threshold controls are visible
Old phrase textareas are not visible
Saving a prompt shows Live
Reload preserves changes from .local-storage/langgraph-settings.json
```

- [ ] **Step 4: Update changelog and version**

If this implementation is merged as a release, bump patch version and add changelog entry:

```md
## 0.3.2 - 2026-06-10

### Changed

- Replaced hardcoded LangGraph phrase parsing with semantic JSON orchestration.
- Added runtime-configurable prompts, taxonomy, thresholds, and confirmation policy.
- Added relationship-aware context and target resolution before CRM writes.
- Removed active Russian phrase and regex parsers from orchestration decisions.

### Verification

- `pnpm --filter @lightcrm/orchestrator test`
- `pnpm --filter @lightcrm/telegram-bot test`
- `pnpm --filter @lightcrm/ui typecheck`
- `pnpm --filter @lightcrm/web typecheck`
```

- [ ] **Step 5: Commit**

```bash
git add CHANGELOG.md package.json apps/web/package.json packages/*/package.json
git commit -m "chore: release semantic langgraph orchestrator"
```

---

## Migration Rules

- No active orchestrator logic may contain hardcoded Russian phrase arrays.
- No active orchestrator logic may contain hardcoded client/person names.
- No active orchestrator logic may contain hardcoded city/address lists.
- No active orchestrator logic may use regexes to infer business intent from domain wording.
- Regex is allowed only for technical validation such as JSON parsing, email/URL validation, or schema-safe primitive checks.
- LLM output is never trusted directly; every node output must pass Zod validation.
- Any CRM write requires: intent, target resolution, extracted entities, validation decision, and execution gate.
- If target resolution is ambiguous, the action must become `request_review` or `ask_clarification`.

## Self-Review

**Spec coverage:** The plan removes phrase/regex parser logic, adds semantic meaning-first nodes, moves prompts/taxonomy/thresholds/confirmation policy into Settings UI, preserves safety gates, and routes Telegram/dry-run through the new semantic pipeline.

**Placeholder scan:** No task uses TBD/TODO placeholders. Each implementation task includes concrete files, code snippets, commands, expected failures, and expected passes.

**Type consistency:** `SemanticIntent`, `ResolvedTarget`, `SemanticExtractedEntities`, `SemanticValidationDecision`, `LangGraphRuntimeSettings.prompts`, `taxonomy`, `thresholds`, and `confirmationPolicy` are introduced before later tasks depend on them.
