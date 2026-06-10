import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { DEFAULT_LANGGRAPH_SETTINGS, mergeLangGraphSettings, type LangGraphRuntimeSettingsInput } from "./settings";
import {
  classifyIntentByRules,
  extractFactsByRules,
  newLeadExplanation,
  planActions,
  riskCheck,
  settingsExplanation
} from "./rules";
import type {
  CrmIntent,
  CrmOrchestrationInput,
  CrmOrchestrationResult,
  ExtractedFacts,
  LangGraphRuntimeSettings,
  PlannedCrmAction,
  RiskLevel
} from "./types";

const OrchestrationAnnotation = Annotation.Root({
  input: Annotation<CrmOrchestrationInput>,
  settings: Annotation<LangGraphRuntimeSettings>,
  workspaceId: Annotation<string>,
  normalizedText: Annotation<string>,
  intent: Annotation<CrmIntent>,
  facts: Annotation<ExtractedFacts>,
  risk: Annotation<RiskLevel>,
  riskReason: Annotation<string>,
  actions: Annotation<PlannedCrmAction[]>,
  explanations: Annotation<string[]>({
    reducer: (left, right) => [...left, ...right],
    default: () => []
  })
});

type OrchestrationState = typeof OrchestrationAnnotation.State;

function normalizeMessage(state: OrchestrationState): Partial<OrchestrationState> {
  return {
    workspaceId: state.input.workspaceId,
    normalizedText: state.settings.enabledNodes.normalizeMessage
      ? state.input.text.trim().replace(/\s+/g, " ")
      : state.input.text
  };
}

function emptyFacts(state: OrchestrationState): ExtractedFacts {
  return {
    contactName: null,
    projectName: null,
    projectType: null,
    location: null,
    areaM2: null,
    phone: null,
    budgetEur: null,
    dueAt: null,
    sourceMessageId: state.input.messageId ?? null,
    evidence: {
      sourceMessageId: state.input.messageId ?? null,
      author: state.input.author ?? null,
      sourceChannel: state.input.sourceChannel ?? "telegram",
      textSnippet: state.normalizedText.slice(0, 240)
    }
  };
}

function extractFacts(state: OrchestrationState): Partial<OrchestrationState> {
  return {
    facts: state.settings.enabledNodes.extractFacts ? extractFactsByRules(state.input, state.normalizedText) : emptyFacts(state)
  };
}

function classifyIntent(state: OrchestrationState): Partial<OrchestrationState> {
  const intent = state.settings.enabledNodes.classifyIntent ? classifyIntentByRules(state.normalizedText, state.settings) : "unknown";
  return {
    intent,
    explanations: [newLeadExplanation(state.normalizedText), settingsExplanation(intent, state.normalizedText, state.settings)].filter(
      (value): value is string => Boolean(value)
    )
  };
}

function resolveEntities(state: OrchestrationState): Partial<OrchestrationState> {
  if (!state.settings.enabledNodes.resolveEntities) {
    return {};
  }
  if (state.intent === "create_new_lead") {
    return {
      explanations: ["Entity resolution will not reuse the latest lead when a new-lead phrase is explicit."]
    };
  }
  return {};
}

function checkRisk(state: OrchestrationState): Partial<OrchestrationState> {
  const result = state.settings.enabledNodes.riskCheck
    ? riskCheck(state.intent, state.facts, state.normalizedText, state.settings)
    : { risk: "review" as RiskLevel, reason: "Risk node is disabled by runtime settings." };
  return {
    risk: result.risk,
    riskReason: result.reason
  };
}

function decideAction(state: OrchestrationState): Partial<OrchestrationState> {
  if (!state.settings.enabledNodes.decideAction) {
    return {
      actions: [
        {
          type: "request_review",
          risk: "review",
          reason: "Action node is disabled by runtime settings.",
          payload: { intent: state.intent, facts: state.facts }
        }
      ]
    };
  }
  return {
    actions: planActions(state.intent, state.facts, state.risk, state.riskReason)
  };
}

export function createCrmOrchestratorGraph() {
  return new StateGraph(OrchestrationAnnotation)
    .addNode("normalize_message", normalizeMessage)
    .addNode("extract_facts", extractFacts)
    .addNode("classify_intent", classifyIntent)
    .addNode("resolve_entities", resolveEntities)
    .addNode("risk_check", checkRisk)
    .addNode("decide_action", decideAction)
    .addEdge(START, "normalize_message")
    .addEdge("normalize_message", "extract_facts")
    .addEdge("extract_facts", "classify_intent")
    .addEdge("classify_intent", "resolve_entities")
    .addEdge("resolve_entities", "risk_check")
    .addEdge("risk_check", "decide_action")
    .addEdge("decide_action", END)
    .compile();
}

const graph = createCrmOrchestratorGraph();

export async function runCrmOrchestration(
  input: CrmOrchestrationInput,
  settingsInput?: LangGraphRuntimeSettingsInput | null
): Promise<CrmOrchestrationResult> {
  const settings = mergeLangGraphSettings(settingsInput ?? DEFAULT_LANGGRAPH_SETTINGS);
  const result = await graph.invoke({
    input,
    settings,
    workspaceId: input.workspaceId,
    normalizedText: "",
    intent: "unknown",
    risk: "review",
    riskReason: "",
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
