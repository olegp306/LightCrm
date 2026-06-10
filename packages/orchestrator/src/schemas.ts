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
