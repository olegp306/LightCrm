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
  LangGraphTraceEvent,
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
  }),
  trace: Annotation<LangGraphTraceEvent[]>({
    reducer: (left, right) => [...left, ...right],
    default: () => []
  })
});

type SemanticOrchestrationState = typeof SemanticOrchestrationAnnotation.State;

function displaySourceChannel(value: string | null | undefined): string {
  return value?.toLocaleLowerCase() === "telegram" ? "TG" : value ?? "TG";
}

function traceEvent(
  state: SemanticOrchestrationState,
  node: LangGraphTraceEvent["node"],
  status: LangGraphTraceEvent["status"],
  titleRu: string,
  messageRu: string,
  details?: LangGraphTraceEvent["details"]
): LangGraphTraceEvent {
  const index = state.trace.length + 1;
  return {
    id: `${String(index).padStart(2, "0")}-${node}`,
    node,
    status,
    titleRu,
    messageRu,
    details
  };
}

function collectInput(state: SemanticOrchestrationState): Partial<SemanticOrchestrationState> {
  const normalizedText = state.input.text.trim().replace(/\s+/g, " ");
  const sourceLabel = displaySourceChannel(state.input.sourceChannel);
  return {
    workspaceId: state.input.workspaceId,
    normalizedText,
    explanations: [`Received ${sourceLabel} message.`],
    trace: [
      traceEvent(
        state,
        "collectInput",
        "done",
        "Получил входящее сообщение",
        `Источник: ${sourceLabel}. Текст приведён к рабочему виду без лишних пробелов.`,
        {
          sourceChannel: state.input.sourceChannel ?? "telegram",
          messageId: state.input.messageId ?? null,
          textLength: normalizedText.length
        }
      )
    ]
  };
}

async function buildContext(state: SemanticOrchestrationState): Promise<Partial<SemanticOrchestrationState>> {
  const context = await buildOrchestrationContext({ input: state.input });
  return {
    context,
    trace: [
      traceEvent(
        state,
        "buildContext",
        "done",
        "Собрал CRM-контекст",
        `Поднял ближайшие лиды и недавние сообщения, чтобы не принимать решение только по одной фразе.`,
        {
          recentLeads: context.recentLeads.length,
          recentMessages: context.recentMessages.length,
          relationshipHints: context.relationshipHints.length
        }
      )
    ]
  };
}

function projectPeoplePrompt(settings: LangGraphRuntimeSettings): string | null {
  if (settings.projectPeople.length === 0) {
    return null;
  }
  const people = settings.projectPeople
    .map((person) => {
      const personAliases = person.aliases ?? [];
      const aliases = personAliases.length > 0 ? ` Aliases: ${personAliases.join(", ")}.` : "";
      return `- ${person.name} (${person.role}):${aliases} ${person.description || "Internal project person."}`;
    })
    .join("\n");
  return [
    "Internal project people:",
    people,
    "If these names appear in intake as authors, forwarders, operators, directors, developers, or testers, treat them as internal context only. Do not extract them as clientName, lead, offer recipient, project owner, or CRM target unless the message explicitly states that this internal person is the external client."
  ].join("\n");
}

function tgIntakePolicyPrompt(settings: LangGraphRuntimeSettings): string {
  const policy = settings.tgIntakePolicy;
  return [
    "TG intake policy:",
    `- Action strictness: ${policy.actionStrictness}.`,
    `- Analyze attachments before action: ${policy.analyzeAttachmentsBeforeAction}.`,
    `- Never create from attachment-only intake: ${policy.neverCreateFromAttachmentOnly}.`,
    `- Require meaningful attachment content before write: ${policy.requireMeaningfulAttachmentContent}.`,
    "If a TG intake contains only files without readable extracted content or a director instruction, prefer ask_clarification/no_action over create_lead.",
    "Treat file names alone as weak evidence; use extracted document/image/audio summaries as evidence when available."
  ].join("\n");
}

function offerReadinessPrompt(settings: LangGraphRuntimeSettings): string | null {
  if (!settings.offerReadiness.analyzeLeadForOfferReadiness) {
    return null;
  }
  const fields = settings.offerReadiness.fields
    .map((field) => {
      const aliases = field.aliases.length > 0 ? ` aliases: ${field.aliases.join(", ")}` : "";
      const sources = field.sources.length > 0 ? ` sources: ${field.sources.join(", ")}` : "";
      return `- ${field.key} (${field.label})${field.required ? " required" : " optional"}; confidence >= ${field.confidenceThreshold};${aliases};${sources}`;
    })
    .join("\n");
  return [
    "Commercial offer readiness:",
    "Capture these offer fields whenever the intake, documents, or lead context contain evidence for them.",
    settings.offerReadiness.requireEvidenceForOfferFields
      ? "Every offer field must include concrete evidence and source message ids; do not infer unsupported offer values."
      : "Offer fields may use directly implied values when confidence is high.",
    settings.offerReadiness.extractOfferFieldsFromAttachments
      ? "Look for offer fields inside attachment summaries and extracted document/image/audio content."
      : "Do not rely on attachments for offer fields unless the text already states the field.",
    fields
  ].join("\n");
}

function semanticSystemPrompt(state: SemanticOrchestrationState, nodeInstruction: string): string {
  return [
    state.settings.prompts.systemRole,
    projectPeoplePrompt(state.settings),
    tgIntakePolicyPrompt(state.settings),
    offerReadinessPrompt(state.settings),
    nodeInstruction
  ]
    .filter(Boolean)
    .join("\n\n");
}

const intentJsonContract = [
  "Return exactly this JSON shape:",
  "{",
  '  "primaryIntent": "create_lead | search_leads | update_lead | create_task | create_reminder | create_meeting | attach_document | generate_offer_task | add_lead_note | ask_clarification | no_action",',
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
    explanations: [`Classified intent as ${result.primaryIntent} (${result.confidence}). ${result.reason}`],
    trace: [
      traceEvent(
        state,
        "classifyIntent",
        "done",
        "Определил намерение",
        `Основное намерение: ${result.primaryIntent}. Дополнительные намерения: ${
          result.secondaryIntents.length > 0 ? result.secondaryIntents.join(", ") : "не найдены"
        }.`,
        {
          confidence: result.confidence,
          reason: result.reason
        }
      )
    ]
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
    explanations: [`Resolved target as ${result.targetType}:${result.targetId ?? "none"} (${result.confidence}).`],
    trace: [
      traceEvent(
        state,
        "resolveTarget",
        result.needsClarification ? "review" : "done",
        "Проверил, к какой записи это относится",
        result.targetId
          ? `Нашёл целевую запись: ${result.targetType}:${result.targetId}.`
          : "Не нашёл точную существующую запись; это может быть новая заявка или нужен выбор цели.",
        {
          targetType: result.targetType,
          targetId: result.targetId,
          confidence: result.confidence,
          candidates: result.candidates.length
        }
      )
    ]
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
    explanations: [`Extracted ${Object.keys(result.fields).length} semantic field(s).`],
    trace: [
      traceEvent(
        state,
        "extractEntities",
        "done",
        "Вытащил факты из сообщения",
        `Нашёл ${Object.keys(result.fields).length} полей. Недостающие данные: ${
          result.missingData.length > 0 ? result.missingData.join(", ") : "критичных пробелов нет"
        }.`,
        {
          fields: Object.keys(result.fields).length,
          missingData: result.missingData.length,
          notes: result.notes.length
        }
      )
    ]
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
    explanations: [`Validated action as ${risk}. ${validation.reason}`],
    trace: [
      traceEvent(
        state,
        "validateAction",
        risk === "blocked" ? "blocked" : risk === "review" ? "review" : "done",
        "Проверил безопасность действия",
        `Риск: ${risk}. Причина: ${validation.reason}`,
        {
          approved: validation.approved,
          riskLevel: validation.riskLevel,
          needsHumanConfirmation: validation.needsHumanConfirmation
        }
      )
    ]
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

const actionTypeByIntent: Partial<Record<SemanticIntent, PlannedCrmAction["type"]>> = {
  create_lead: "create_lead",
  search_leads: "search_leads",
  create_reminder: "create_reminder",
  create_meeting: "create_meeting",
  add_lead_note: "update_lead",
  update_lead: "update_lead"
};

function plannedActionTypes(state: SemanticOrchestrationState): PlannedCrmAction["type"][] {
  const intents = [state.intent, ...state.intentClassification.secondaryIntents];
  const actionTypes: PlannedCrmAction["type"][] = [];

  for (const intent of intents) {
    const actionType =
      intent === "generate_offer_task" && shouldCreateLeadFromOfferIntake(state) ? "create_lead" : actionTypeByIntent[intent];
    if (actionType && !actionTypes.includes(actionType)) {
      actionTypes.push(actionType);
    }
  }

  return actionTypes;
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

function hasEntityValue(state: SemanticOrchestrationState, fieldName: string): boolean {
  const value = state.entities.fields[fieldName]?.value;
  return value !== null && value !== undefined && value !== "";
}

function hasEvidencedEntityValue(state: SemanticOrchestrationState, fieldName: string): boolean {
  const field = state.entities.fields[fieldName];
  const evidence = field?.evidence.trim();
  return (
    hasEntityValue(state, fieldName) &&
    Boolean(evidence) &&
    evidence !== "No evidence provided." &&
    field.sourceMessageIds.length > 0
  );
}

function shouldCreateLeadFromOfferIntake(state: SemanticOrchestrationState): boolean {
  const hasLikelyDuplicate = state.target.candidates.some(
    (candidate) => candidate.score >= state.settings.thresholds.duplicateCandidate
  );

  return (
    state.intent === "generate_offer_task" &&
    state.target.targetId === null &&
    !hasLikelyDuplicate &&
    (state.target.targetType === "none" || state.target.targetType === "project" || state.target.targetType === "lead") &&
    (hasEvidencedEntityValue(state, "requestType") || hasEvidencedEntityValue(state, "projectAddress"))
  );
}

function shouldCreateLeadFromLeadIntake(state: SemanticOrchestrationState): boolean {
  const hasLikelyDuplicate = state.target.candidates.some(
    (candidate) => candidate.score >= state.settings.thresholds.duplicateCandidate
  );

  const requiredOfferFields = state.settings.offerReadiness.fields.filter((field) => field.required).map((field) => field.key);
  const hasEvidencedLeadOrOfferField = [
    "clientName",
    "projectName",
    "requestType",
    "projectAddress",
    "location",
    "phone",
    "email",
    ...requiredOfferFields
  ].some((field) => hasEvidencedEntityValue(state, field));
  const hasMeaningfulLeadInstruction =
    state.intentClassification.evidence.some((evidence) => evidence.trim().length > 0) &&
    state.intentClassification.confidence >= state.settings.thresholds.autoExecute;

  if (state.settings.tgIntakePolicy.actionStrictness === "preview_first") {
    return false;
  }

  if (state.settings.tgIntakePolicy.actionStrictness === "strong_evidence" && !hasEvidencedLeadOrOfferField) {
    return false;
  }

  return (
    state.intent === "create_lead" &&
    state.target.targetId === null &&
    !hasLikelyDuplicate &&
    (state.target.targetType === "none" || state.target.targetType === "project" || state.target.targetType === "lead") &&
    (hasEvidencedLeadOrOfferField ||
      (state.settings.tgIntakePolicy.actionStrictness === "auto_create_drafts" && hasMeaningfulLeadInstruction))
  );
}

function planAction(state: SemanticOrchestrationState): Partial<SemanticOrchestrationState> {
  const reviewReason =
    state.target.clarificationQuestion ??
    state.validation.reason ??
    "Semantic orchestration requires human review before execution.";

  if (
    state.validation.riskLevel !== "high" &&
    (shouldCreateLeadFromOfferIntake(state) || shouldCreateLeadFromLeadIntake(state))
  ) {
    if (!state.settings.confirmationPolicy.allowAutoCreateLead) {
      return {
        risk: "review",
        facts: compatibilityFacts(state),
        actions: [createReviewAction(state, "Runtime settings do not allow automatic lead creation.")],
        trace: [
          traceEvent(
            state,
            "planAction",
            "review",
            "Подготовил действие",
            "Автоматическое создание лида отключено в настройках, поэтому нужен review."
          )
        ]
      };
    }

    const actions: PlannedCrmAction[] = [
      {
        type: "create_lead",
        risk: "auto",
        reason:
          "The final project workflow is not ready yet, but the message is a lead intake and can be saved as a needs-data draft lead.",
        payload: semanticPayload(state)
      }
    ];
    if (
      state.intentClassification.secondaryIntents.includes("create_reminder") &&
      state.settings.confirmationPolicy.allowAutoCreateReminder
    ) {
      actions.push({
        type: "create_reminder",
        risk: "auto",
        reason: "The same message also asks to create a reminder.",
        payload: semanticPayload(state)
      });
    }

    return {
      risk: "auto",
      facts: compatibilityFacts(state),
      actions,
      explanations: ["Converted project-only offer intake into a needs-data lead."],
      trace: [
        traceEvent(
          state,
          "planAction",
          "done",
          "Подготовил действие",
          "Это похоже на новую заявку/КП без полной карточки клиента, поэтому готовлю черновик лида."
        )
      ]
    };
  }

  if (state.risk !== "auto" || state.intent === "ask_clarification" || state.target.needsClarification) {
    return {
      risk: "review",
      facts: compatibilityFacts(state),
      actions: [createReviewAction(state, reviewReason)],
      trace: [
        traceEvent(
          state,
          "planAction",
          "review",
          "Подготовил действие",
          `Автоматическое действие не выполняю: ${reviewReason}`
        )
      ]
    };
  }

  const actionTypes = plannedActionTypes(state);
  const actionType = actionTypes[0];

  if (!actionType) {
    return {
      risk: "review",
      facts: compatibilityFacts(state),
      actions: [createReviewAction(state, `No executable CRM action is mapped for semantic intent ${state.intent}.`)],
      trace: [
        traceEvent(
          state,
          "planAction",
          "review",
          "Не нашёл безопасного действия",
          `Для намерения ${state.intent} пока нет подключенного CRM-действия.`
        )
      ]
    };
  }

  if (actionTypes.includes("create_lead") && !state.settings.confirmationPolicy.allowAutoCreateLead) {
    return {
      risk: "review",
      facts: compatibilityFacts(state),
      actions: [createReviewAction(state, "Runtime settings do not allow automatic lead creation.")],
      trace: [
        traceEvent(
          state,
          "planAction",
          "review",
          "Остановил автоматическое создание лида",
          "Настройки требуют review перед созданием лида."
        )
      ]
    };
  }

  if (actionTypes.includes("create_reminder") && !state.settings.confirmationPolicy.allowAutoCreateReminder) {
    return {
      risk: "review",
      facts: compatibilityFacts(state),
      actions: [createReviewAction(state, "Runtime settings do not allow automatic reminder creation.")],
      trace: [
        traceEvent(
          state,
          "planAction",
          "review",
          "Остановил автоматическое напоминание",
          "Настройки требуют review перед созданием reminder."
        )
      ]
    };
  }

  return {
    facts: compatibilityFacts(state),
    actions: actionTypes.map((type) => ({
      type,
      risk: state.risk,
      reason: type === actionType ? state.validation.reason : `Secondary intent action: ${type}.`,
      payload: semanticPayload(state)
    })),
    trace: [
      traceEvent(
        state,
        "planAction",
        "done",
        "Подготовил CRM-действие",
        `Планирую действие ${actionType} с уровнем риска ${state.risk}.`,
        {
          actionType,
          risk: state.risk
        }
      )
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
    explanations: ["Runtime settings require confirmation for write operations."],
    trace: [
      traceEvent(
        state,
        "executionGate",
        "review",
        "Проверил финальный gate",
        "Настройки требуют подтверждение для write-действий, поэтому перевожу результат в review."
      )
    ]
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
    settings: result.settings,
    trace: result.trace
  };
}
