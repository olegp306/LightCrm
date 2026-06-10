import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { buildOrchestrationContext, contextToPrompt } from "./context";
import { createJsonLlmClient, createOpenAiJsonProvider, type JsonLlmProvider } from "./llm";
import {
  EntityExtractionSchema,
  IntentClassificationSchema,
  TargetResolutionSchema,
  ValidationDecisionSchema
} from "./schemas";
import { DEFAULT_LANGGRAPH_SETTINGS, mergeLangGraphSettings, type LangGraphRuntimeSettingsInput } from "./settings";
import type {
  CrmOrchestrationInput,
  CrmOrchestrationResult,
  ExtractedFacts,
  LangGraphRuntimeSettings,
  OrchestrationContext,
  PlannedCrmAction,
  ResolvedTarget,
  RiskLevel,
  SemanticExtractedEntities,
  SemanticIntent,
  SemanticValidationDecision
} from "./types";

export type SemanticDeps = { llmProvider?: JsonLlmProvider };

type IntentClassification = {
  primaryIntent: SemanticIntent;
  secondaryIntents: SemanticIntent[];
  confidence: number;
  reason: string;
  evidence: string[];
};

type JsonLlmClient = ReturnType<typeof createJsonLlmClient>;

const SemanticOrchestrationAnnotation = Annotation.Root({
  input: Annotation<CrmOrchestrationInput>,
  settings: Annotation<LangGraphRuntimeSettings>,
  llm: Annotation<JsonLlmClient>,
  workspaceId: Annotation<string>,
  normalizedText: Annotation<string>,
  context: Annotation<OrchestrationContext>,
  intent: Annotation<SemanticIntent>,
  intentClassification: Annotation<IntentClassification>,
  target: Annotation<ResolvedTarget>,
  entities: Annotation<SemanticExtractedEntities>,
  validation: Annotation<SemanticValidationDecision>,
  risk: Annotation<RiskLevel>,
  facts: Annotation<ExtractedFacts>,
  actions: Annotation<PlannedCrmAction[]>,
  explanations: Annotation<string[]>({
    reducer: (left, right) => [...left, ...right],
    default: () => []
  })
});

type SemanticOrchestrationState = typeof SemanticOrchestrationAnnotation.State;

function collectInput(state: SemanticOrchestrationState): Partial<SemanticOrchestrationState> {
  const normalizedText = state.input.text.trim().replace(/\s+/g, " ");
  return {
    workspaceId: state.input.workspaceId,
    normalizedText,
    explanations: [`Received ${state.input.sourceChannel ?? "telegram"} message.`]
  };
}

async function buildContext(state: SemanticOrchestrationState): Promise<Partial<SemanticOrchestrationState>> {
  return {
    context: await buildOrchestrationContext({ input: state.input })
  };
}

function semanticSystemPrompt(state: SemanticOrchestrationState, nodeInstruction: string): string {
  return [state.settings.prompts.systemRole, nodeInstruction].join("\n\n");
}

const intentJsonContract = [
  "Return exactly this JSON shape:",
  "{",
  '  "primaryIntent": "create_lead | update_lead | create_task | create_reminder | create_meeting | attach_document | generate_offer_task | add_lead_note | ask_clarification | no_action",',
  '  "secondaryIntents": [],',
  '  "confidence": 0.0,',
  '  "reason": "short explanation",',
  '  "evidence": ["short source quote or observation"]',
  "}"
].join("\n");

const targetJsonContract = [
  "Return exactly this JSON shape:",
  "{",
  '  "targetType": "lead | client | project | task | none",',
  '  "targetId": null,',
  '  "confidence": 0.0,',
  '  "candidates": [{"id": "candidate id", "label": "candidate label", "score": 0.0, "reason": "why this candidate"}],',
  '  "needsClarification": false,',
  '  "clarificationQuestion": null',
  "}"
].join("\n");

const entitiesJsonContract = [
  "Return exactly this JSON shape:",
  "{",
  '  "fields": {',
  '    "fieldName": {"value": "string, number, boolean, or null", "confidence": 0.0, "evidence": "short source quote", "sourceMessageIds": ["message id"]}',
  "  },",
  '  "missingData": [],',
  '  "notes": []',
  "}"
].join("\n");

const validationJsonContract = [
  "Return exactly this JSON shape:",
  "{",
  '  "approved": false,',
  '  "riskLevel": "low | medium | high",',
  '  "reason": "short explanation",',
  '  "needsHumanConfirmation": true',
  "}"
].join("\n");

async function classifyIntent(state: SemanticOrchestrationState): Promise<Partial<SemanticOrchestrationState>> {
  const result = await state.llm.runJson({
    schema: IntentClassificationSchema,
    system: semanticSystemPrompt(state, `Classify intent.\n${state.settings.prompts.intentClassifier}\n\n${intentJsonContract}`),
    user: contextToPrompt(state.context),
    model: state.settings.model,
    temperature: state.settings.temperature
  });

  return {
    intent: result.primaryIntent,
    intentClassification: result,
    explanations: [`Classified intent as ${result.primaryIntent} (${result.confidence}). ${result.reason}`]
  };
}

async function resolveTarget(state: SemanticOrchestrationState): Promise<Partial<SemanticOrchestrationState>> {
  const result = await state.llm.runJson({
    schema: TargetResolutionSchema,
    system: semanticSystemPrompt(state, `Resolve CRM target.\n${state.settings.prompts.targetResolver}\n\n${targetJsonContract}`),
    user: JSON.stringify(
      {
        context: JSON.parse(contextToPrompt(state.context)),
        intent: state.intentClassification
      },
      null,
      2
    ),
    model: state.settings.model,
    temperature: state.settings.temperature
  });

  return {
    target: result,
    explanations: [`Resolved target as ${result.targetType}:${result.targetId ?? "none"} (${result.confidence}).`]
  };
}

async function extractEntities(state: SemanticOrchestrationState): Promise<Partial<SemanticOrchestrationState>> {
  const result = await state.llm.runJson({
    schema: EntityExtractionSchema,
    system: semanticSystemPrompt(state, `Extract entities.\n${state.settings.prompts.entityExtractor}\n\n${entitiesJsonContract}`),
    user: JSON.stringify(
      {
        context: JSON.parse(contextToPrompt(state.context)),
        intent: state.intentClassification,
        target: state.target,
        allowedEntityFields: state.settings.taxonomy.entityFields
      },
      null,
      2
    ),
    model: state.settings.model,
    temperature: state.settings.temperature
  });

  return {
    entities: result,
    explanations: [`Extracted ${Object.keys(result.fields).length} semantic field(s).`]
  };
}

function riskFromValidation(state: SemanticOrchestrationState, validation: SemanticValidationDecision): RiskLevel {
  if (
    validation.approved &&
    !validation.needsHumanConfirmation &&
    validation.riskLevel === "low" &&
    state.intentClassification.confidence >= state.settings.thresholds.autoExecute
  ) {
    return "auto";
  }

  if (validation.riskLevel === "high") {
    return "blocked";
  }

  return "review";
}

async function validateAction(state: SemanticOrchestrationState): Promise<Partial<SemanticOrchestrationState>> {
  const validation = await state.llm.runJson({
    schema: ValidationDecisionSchema,
    system: semanticSystemPrompt(state, `Validate planned CRM action.\n${state.settings.prompts.validationGuard}\n\n${validationJsonContract}`),
    user: JSON.stringify(
      {
        intent: state.intentClassification,
        target: state.target,
        entities: state.entities,
        thresholds: state.settings.thresholds,
        confirmationPolicy: state.settings.confirmationPolicy,
        requiredFieldsByAction: state.settings.taxonomy.requiredFieldsByAction
      },
      null,
      2
    ),
    model: state.settings.model,
    temperature: state.settings.temperature
  });
  const risk = riskFromValidation(state, validation);

  return {
    validation,
    risk,
    explanations: [`Validated action as ${risk}. ${validation.reason}`]
  };
}

function compatibilityFacts(state: SemanticOrchestrationState): ExtractedFacts {
  const fields = state.entities.fields;
  const stringField = (...keys: string[]): string | null => {
    for (const key of keys) {
      const value = fields[key]?.value;
      if (typeof value === "string") {
        return value;
      }
    }
    return null;
  };
  const numberField = (...keys: string[]): number | null => {
    for (const key of keys) {
      const value = fields[key]?.value;
      if (typeof value === "number") {
        return value;
      }
    }
    return null;
  };

  return {
    contactName: stringField("clientName"),
    projectName: stringField("projectName"),
    projectType: stringField("requestType", "projectType"),
    location: stringField("projectAddress", "location"),
    areaM2: numberField("areaM2"),
    phone: stringField("phone"),
    budgetEur: numberField("budgetEur"),
    dueAt: stringField("reminderDateTime", "meetingDateTime", "dueAt"),
    sourceMessageId: state.input.messageId ?? null,
    evidence: {
      sourceMessageId: state.input.messageId ?? null,
      author: state.input.author ?? null,
      sourceChannel: state.input.sourceChannel ?? "telegram",
      textSnippet: state.normalizedText.slice(0, 240)
    }
  };
}

function createReviewAction(state: SemanticOrchestrationState, reason: string): PlannedCrmAction {
  return {
    type: "request_review",
    risk: "review",
    reason,
    payload: semanticPayload(state)
  };
}

function semanticPayload(state: SemanticOrchestrationState): Record<string, unknown> {
  return {
    intent: state.intent,
    targetId: state.target.targetId,
    targetType: state.target.targetType,
    entities: state.entities,
    evidence: state.intentClassification.evidence
  };
}

function planAction(state: SemanticOrchestrationState): Partial<SemanticOrchestrationState> {
  const reviewReason =
    state.target.clarificationQuestion ??
    state.validation.reason ??
    "Semantic orchestration requires human review before execution.";

  if (state.risk !== "auto" || state.intent === "ask_clarification" || state.target.needsClarification) {
    return {
      facts: compatibilityFacts(state),
      actions: [createReviewAction(state, reviewReason)]
    };
  }

  const actionByIntent: Partial<Record<SemanticIntent, PlannedCrmAction["type"]>> = {
    create_lead: "create_lead",
    create_reminder: "create_reminder",
    add_lead_note: "update_lead",
    update_lead: "update_lead"
  };
  const actionType = actionByIntent[state.intent];

  if (!actionType) {
    return {
      facts: compatibilityFacts(state),
      actions: [createReviewAction(state, `No executable CRM action is mapped for semantic intent ${state.intent}.`)]
    };
  }

  if (actionType === "create_lead" && !state.settings.confirmationPolicy.allowAutoCreateLead) {
    return {
      risk: "review",
      facts: compatibilityFacts(state),
      actions: [createReviewAction(state, "Runtime settings do not allow automatic lead creation.")]
    };
  }

  if (actionType === "create_reminder" && !state.settings.confirmationPolicy.allowAutoCreateReminder) {
    return {
      risk: "review",
      facts: compatibilityFacts(state),
      actions: [createReviewAction(state, "Runtime settings do not allow automatic reminder creation.")]
    };
  }

  return {
    facts: compatibilityFacts(state),
    actions: [
      {
        type: actionType,
        risk: state.risk,
        reason: state.validation.reason,
        payload: semanticPayload(state)
      }
    ]
  };
}

function executionGate(state: SemanticOrchestrationState): Partial<SemanticOrchestrationState> {
  const action = state.actions[0];
  if (!action || action.type === "request_review" || !state.settings.confirmationPolicy.requireConfirmationForWrites) {
    return {};
  }

  return {
    risk: "review",
    actions: [
      {
        type: "request_review",
        risk: "review",
        reason: "Runtime settings require confirmation for write operations.",
        payload: semanticPayload(state)
      }
    ],
    explanations: ["Runtime settings require confirmation for write operations."]
  };
}

export function createSemanticCrmOrchestratorGraph() {
  return new StateGraph(SemanticOrchestrationAnnotation)
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

export async function runSemanticCrmOrchestration(
  input: CrmOrchestrationInput,
  deps: SemanticDeps = {},
  settingsInput?: LangGraphRuntimeSettingsInput | null
): Promise<CrmOrchestrationResult> {
  const settings = mergeLangGraphSettings(settingsInput ?? DEFAULT_LANGGRAPH_SETTINGS);
  const llm = createJsonLlmClient(deps.llmProvider ?? createOpenAiJsonProvider());
  const graph = createSemanticCrmOrchestratorGraph();
  const result = await graph.invoke({
    input,
    settings,
    llm,
    workspaceId: input.workspaceId,
    normalizedText: "",
    intent: "no_action",
    risk: "review",
    actions: []
  });

  return {
    workspaceId: result.workspaceId,
    normalizedText: result.normalizedText,
    intent: result.intent,
    facts: result.facts,
    actions: result.actions,
    risk: result.risk,
    explanations: result.explanations,
    settings: result.settings
  };
}
