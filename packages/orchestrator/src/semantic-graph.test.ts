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
