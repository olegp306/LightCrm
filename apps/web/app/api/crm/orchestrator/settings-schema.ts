import { z } from "zod";

const CrmIntent = z.enum([
  "create_new_lead",
  "update_existing_lead",
  "create_contact",
  "update_contact",
  "create_reminder",
  "create_meeting",
  "generate_offer",
  "delete_or_undo",
  "clarification",
  "unknown"
]);

const SemanticIntent = z.enum([
  "create_lead",
  "search_leads",
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

export const RuntimeSettingsInput = z.object({
  id: z.enum(["leadHunter", "mailAnalyst", "riskAuditor", "fastOperator", "relationshipKeeper", "custom"]),
  name: z.string().min(1),
  description: z.string().min(1),
  model: z.string().min(1),
  temperature: z.number().min(0).max(2),
  confidenceThreshold: z.number().min(0).max(1),
  autoCreateLead: z.boolean(),
  autoCreateReminder: z.boolean(),
  reviewNameOnlyUpdates: z.boolean(),
  forceReviewIntents: z.array(CrmIntent),
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
    intents: z.array(SemanticIntent),
    entityFields: z.array(z.string().min(1)),
    requiredFieldsByAction: z.record(SemanticIntent, z.array(z.string().min(1)))
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
  }),
  projectPeople: z.array(
    z.object({
      name: z.string().trim().min(1),
      role: z.string().trim().min(1),
      description: z.string().trim()
    })
  ),
  extraNewLeadPhrases: z.array(z.string()),
  mailAnalysisPhrases: z.array(z.string()),
  reminderPhrases: z.array(z.string()),
  enabledNodes: z.object({
    normalizeMessage: z.boolean(),
    extractFacts: z.boolean(),
    classifyIntent: z.boolean(),
    resolveEntities: z.boolean(),
    riskCheck: z.boolean(),
    decideAction: z.boolean()
  })
});
