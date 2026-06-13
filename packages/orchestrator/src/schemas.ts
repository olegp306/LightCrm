import { z } from "zod";

const OptionalStringSchema = z.preprocess((value) => (value === null || value === undefined ? "" : value), z.string());
const RequiredStringSchema = z.preprocess(
  (value) =>
    value === null || value === undefined || (typeof value === "string" && value.trim() === "")
      ? "No evidence provided."
      : value,
  z.string().min(1)
);
const StringListSchema = z
  .array(OptionalStringSchema)
  .default([])
  .transform((values) => values.map((value) => value.trim()).filter(Boolean));

export const SemanticIntentSchema = z.enum([
  "create_lead",
  "search_leads",
  "update_lead",
  "create_task",
  "create_reminder",
  "create_meeting",
  "attach_document",
  "generate_offer_task",
  "add_lead_note",
  "system_help",
  "ask_clarification",
  "no_action"
]);

export const IntentClassificationSchema = z.object({
  primaryIntent: SemanticIntentSchema,
  secondaryIntents: z.array(SemanticIntentSchema),
  confidence: z.number().min(0).max(1),
  reason: RequiredStringSchema,
  evidence: StringListSchema.pipe(z.array(z.string().min(1)).min(1))
});

const FieldEvidenceSchema = z.object({
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  confidence: z.number().min(0).max(1),
  evidence: RequiredStringSchema,
  sourceMessageIds: StringListSchema
});

export const EntityExtractionSchema = z.object({
  fields: z.record(FieldEvidenceSchema),
  missingData: StringListSchema,
  notes: StringListSchema
});

export const TargetResolutionSchema = z.object({
  targetType: z.enum(["lead", "client", "project", "task", "none"]),
  targetId: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  candidates: z.array(
    z.object({
      id: OptionalStringSchema,
      label: OptionalStringSchema,
      score: z.number().min(0).max(1),
      reason: OptionalStringSchema
    })
  ),
  needsClarification: z.boolean(),
  clarificationQuestion: OptionalStringSchema.nullable()
});

export const ValidationDecisionSchema = z.object({
  approved: z.boolean(),
  riskLevel: z.enum(["low", "medium", "high"]),
  reason: RequiredStringSchema,
  needsHumanConfirmation: z.boolean()
});
