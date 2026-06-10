import { NextResponse } from "next/server";
import { z } from "zod";
import type { LangGraphRuntimeSettings } from "@lightcrm/orchestrator";
import { handleRouteError, parseJson } from "../../_shared";
import { getLangGraphPresets, getLangGraphSettings, updateLangGraphSettings } from "../settings-store";

export const dynamic = "force-dynamic";

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

const RuntimeSettingsInput = z.object({
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
  }),
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

export async function GET() {
  try {
    return NextResponse.json({
      settings: await getLangGraphSettings(),
      presets: getLangGraphPresets()
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const input = await parseJson(request, RuntimeSettingsInput);
    return NextResponse.json({
      settings: await updateLangGraphSettings(input as Partial<LangGraphRuntimeSettings>),
      presets: getLangGraphPresets()
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
