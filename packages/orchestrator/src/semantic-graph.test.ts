import { describe, expect, it } from "vitest";
import {
  IntentClassificationSchema,
  EntityExtractionSchema,
  TargetResolutionSchema,
  ValidationDecisionSchema
} from "./schemas";
import { LANGGRAPH_PRESETS, mergeLangGraphSettings } from "./settings";

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
