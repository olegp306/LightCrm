import { describe, expect, it } from "vitest";
import { buildOrchestrationContext, contextToPrompt } from "./context";
import { createJsonLlmClient, createOpenAiJsonProvider } from "./llm";
import {
  IntentClassificationSchema,
  EntityExtractionSchema,
  TargetResolutionSchema,
  ValidationDecisionSchema
} from "./schemas";
import { LANGGRAPH_PRESETS, mergeLangGraphSettings } from "./settings";
import { runSemanticCrmOrchestration } from "./semantic-graph";

function restoreOpenAiApiKey(originalApiKey: string | undefined) {
  if (originalApiKey === undefined) {
    delete process.env.OPENAI_API_KEY;
    return;
  }

  process.env.OPENAI_API_KEY = originalApiKey;
}

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
          clientName: { value: "Maxim", confidence: 0.9, evidence: "", sourceMessageIds: ["msg-1"] }
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
      clarificationQuestion: "Is this a new lead or should I update L-2026-009 Maxim?"
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

  it("keeps legacy phrase arrays empty in every preset", () => {
    for (const preset of LANGGRAPH_PRESETS) {
      expect(preset.extraNewLeadPhrases).toEqual([]);
      expect(preset.mailAnalysisPhrases).toEqual([]);
      expect(preset.reminderPhrases).toEqual([]);
    }
  });

  it("preserves semantic defaults when merging partial nested settings", () => {
    const settings = mergeLangGraphSettings({
      prompts: {
        intentClassifier: "Classify by business outcome."
      },
      thresholds: {
        duplicateCandidate: 0.81
      },
      taxonomy: {
        requiredFieldsByAction: {
          create_task: ["notes"]
        }
      },
      confirmationPolicy: {
        requireConfirmationForWrites: true
      }
    });

    expect(settings.prompts.intentClassifier).toBe("Classify by business outcome.");
    expect(settings.prompts.entityExtractor).toContain("explicitly stated");
    expect(settings.thresholds.autoExecute).toBe(0.58);
    expect(settings.thresholds.duplicateCandidate).toBe(0.81);
    expect(settings.taxonomy.intents).toContain("create_lead");
    expect(settings.taxonomy.requiredFieldsByAction.create_lead).toEqual(["clientName"]);
    expect(settings.taxonomy.requiredFieldsByAction.create_task).toEqual(["notes"]);
    expect(settings.confirmationPolicy.requireConfirmationForWrites).toBe(true);
    expect(settings.confirmationPolicy.allowAutoCreateLead).toBe(true);
  });

  it("returns cloned preset settings without shared mutable nested objects", () => {
    expect(LANGGRAPH_PRESETS[0]?.prompts).not.toBe(LANGGRAPH_PRESETS[1]?.prompts);
    expect(LANGGRAPH_PRESETS[0]?.taxonomy).not.toBe(LANGGRAPH_PRESETS[1]?.taxonomy);
    expect(LANGGRAPH_PRESETS[0]?.taxonomy.requiredFieldsByAction).not.toBe(
      LANGGRAPH_PRESETS[1]?.taxonomy.requiredFieldsByAction
    );
    expect(LANGGRAPH_PRESETS[0]?.enabledNodes).not.toBe(LANGGRAPH_PRESETS[1]?.enabledNodes);

    const leadHunter = mergeLangGraphSettings({ id: "leadHunter" });
    const mailAnalyst = mergeLangGraphSettings({ id: "mailAnalyst" });

    leadHunter.prompts.intentClassifier = "Changed";
    leadHunter.taxonomy.entityFields.push("mutatedField");
    leadHunter.taxonomy.requiredFieldsByAction.create_lead.push("mutatedRequiredField");
    leadHunter.enabledNodes.riskCheck = false;
    leadHunter.extraNewLeadPhrases.push("legacy");

    expect(mailAnalyst.prompts.intentClassifier).not.toBe("Changed");
    expect(mailAnalyst.taxonomy.entityFields).not.toContain("mutatedField");
    expect(mailAnalyst.taxonomy.requiredFieldsByAction.create_lead).toEqual(["clientName"]);
    expect(mailAnalyst.enabledNodes.riskCheck).toBe(true);
    expect(mailAnalyst.extraNewLeadPhrases).toEqual([]);

    expect(LANGGRAPH_PRESETS.find((preset) => preset.id === "leadHunter")?.prompts.intentClassifier).not.toBe(
      "Changed"
    );
    expect(LANGGRAPH_PRESETS.find((preset) => preset.id === "leadHunter")?.taxonomy.entityFields).not.toContain(
      "mutatedField"
    );
  });
});

describe("orchestration context", () => {
  it("passes through recent CRM context without aliasing caller-owned items", async () => {
    const recentLeads = [
      {
        id: "lead-1",
        label: "L-2026-009 Maxim T.",
        summary: "Private house in Munich",
        lastTouchedAt: "2026-06-10T10:00:00.000Z"
      }
    ];
    const recentMessages = [
      { id: "m-0", text: "Maxim asked about a private house", createdAt: "2026-06-10T09:00:00.000Z" }
    ];

    const context = await buildOrchestrationContext({
      input: {
        workspaceId: "default",
        messageId: "m-1",
        author: "architect",
        text: "это снова Максим, нужно подготовить предложение",
        sourceChannel: "telegram"
      },
      recentLeads,
      recentMessages
    });

    expect(context.recentLeads[0].id).toBe("lead-1");
    expect(context.recentLeads).not.toBe(recentLeads);
    expect(context.recentLeads[0]).not.toBe(recentLeads[0]);
    expect(context.recentMessages).not.toBe(recentMessages);
    expect(context.recentMessages[0]).not.toBe(recentMessages[0]);
    expect(context.relationshipHints).toContain("Recent CRM activity is available for context.");
  });

  it("serializes prompt context as parseable JSON", () => {
    const prompt = contextToPrompt({
      source: {
        workspaceId: "default",
        messageId: "m-1",
        author: "architect",
        text: "prepare the offer",
        sourceChannel: "telegram"
      },
      recentLeads: [
        {
          id: "lead-1",
          label: "L-2026-009 Maxim T.",
          summary: "Private house in Munich",
          lastTouchedAt: "2026-06-10T10:00:00.000Z"
        }
      ],
      recentMessages: [{ id: "m-0", text: "Maxim asked about a private house", createdAt: "2026-06-10T09:00:00.000Z" }],
      relationshipHints: ["Recent CRM activity is available for context."]
    });

    const parsed = JSON.parse(prompt);

    expect(parsed.message).toEqual({
      workspaceId: "default",
      messageId: "m-1",
      author: "architect",
      text: "prepare the offer",
      sourceChannel: "telegram"
    });
    expect(parsed.recentLeads).toEqual([
      {
        id: "lead-1",
        label: "L-2026-009 Maxim T.",
        summary: "Private house in Munich",
        lastTouchedAt: "2026-06-10T10:00:00.000Z"
      }
    ]);
    expect(parsed.recentMessages).toEqual([
      { id: "m-0", text: "Maxim asked about a private house", createdAt: "2026-06-10T09:00:00.000Z" }
    ]);
    expect(parsed.relationshipHints).toEqual(["Recent CRM activity is available for context."]);
  });
});

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

  it("does not pass the schema to the provider at runtime", async () => {
    let providerInput: unknown;
    const client = createJsonLlmClient({
      callJson: async (input) => {
        providerInput = input;
        return {
          primaryIntent: "add_lead_note",
          secondaryIntents: [],
          confidence: 0.77,
          reason: "The message adds context but does not request a write to a specific field.",
          evidence: ["general project context"]
        };
      }
    });

    await client.runJson({
      schema: IntentClassificationSchema,
      system: "system",
      user: "user",
      model: "fake",
      temperature: 0
    });

    expect(providerInput).toEqual({
      system: "system",
      user: "user",
      model: "fake",
      temperature: 0
    });
  });

  it("throws a missing key message before calling OpenAI", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    const fetchImpl: typeof fetch = async () => {
      throw new Error("fetch should not be called");
    };

    try {
      const provider = createOpenAiJsonProvider(fetchImpl);

      await expect(
        provider.callJson({
          system: "system",
          user: "user",
          model: "fake",
          temperature: 0
        })
      ).rejects.toThrow("OPENAI_API_KEY is required for semantic LangGraph mode.");
    } finally {
      restoreOpenAiApiKey(originalApiKey);
    }
  });

  it("parses successful OpenAI message content JSON", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "test-key";

    const fetchImpl: typeof fetch = async () =>
      ({
        ok: true,
        json: async () => ({ choices: [{ message: { content: "{\"result\":\"ok\"}" } }] })
      }) as unknown as Response;

    try {
      const provider = createOpenAiJsonProvider(fetchImpl);

      const result = await provider.callJson({
        system: "system",
        user: "user",
        model: "fake",
        temperature: 0
      });

      expect(result).toEqual({ result: "ok" });
    } finally {
      restoreOpenAiApiKey(originalApiKey);
    }
  });

  it("throws a clean OpenAI failure message for non-JSON failed responses", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "test-key";

    const fetchImpl: typeof fetch = async () =>
      ({
        ok: false,
        json: async () => {
          throw new SyntaxError("Unexpected end of JSON input");
        }
      }) as unknown as Response;

    try {
      const provider = createOpenAiJsonProvider(fetchImpl);

      await expect(
        provider.callJson({
          system: "system",
          user: "user",
          model: "fake",
          temperature: 0
        })
      ).rejects.toThrow("OpenAI JSON call failed.");
    } finally {
      restoreOpenAiApiKey(originalApiKey);
    }
  });

  it("throws when an ok OpenAI response has no content", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "test-key";

    const fetchImpl: typeof fetch = async () =>
      ({
        ok: true,
        json: async () => ({ choices: [{ message: {} }] })
      }) as unknown as Response;

    try {
      const provider = createOpenAiJsonProvider(fetchImpl);

      await expect(
        provider.callJson({
          system: "system",
          user: "user",
          model: "fake",
          temperature: 0
        })
      ).rejects.toThrow("OpenAI JSON call returned no content.");
    } finally {
      restoreOpenAiApiKey(originalApiKey);
    }
  });

  it("throws a clean message when OpenAI content is invalid JSON", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "test-key";

    const fetchImpl: typeof fetch = async () =>
      ({
        ok: true,
        json: async () => ({ choices: [{ message: { content: "not json" } }] })
      }) as unknown as Response;

    try {
      const provider = createOpenAiJsonProvider(fetchImpl);

      await expect(
        provider.callJson({
          system: "system",
          user: "user",
          model: "fake",
          temperature: 0
        })
      ).rejects.toThrow("OpenAI JSON call returned invalid JSON.");
    } finally {
      restoreOpenAiApiKey(originalApiKey);
    }
  });
});

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
