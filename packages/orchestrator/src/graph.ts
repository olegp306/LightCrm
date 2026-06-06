import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { classifyIntentByRules, extractFactsByRules, newLeadExplanation, planActions, riskCheck } from "./rules";
import type { CrmIntent, CrmOrchestrationInput, CrmOrchestrationResult, ExtractedFacts, PlannedCrmAction, RiskLevel } from "./types";

const OrchestrationAnnotation = Annotation.Root({
  input: Annotation<CrmOrchestrationInput>,
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
    normalizedText: state.input.text.trim().replace(/\s+/g, " ")
  };
}

function extractFacts(state: OrchestrationState): Partial<OrchestrationState> {
  return {
    facts: extractFactsByRules(state.input, state.normalizedText)
  };
}

function classifyIntent(state: OrchestrationState): Partial<OrchestrationState> {
  const intent = classifyIntentByRules(state.normalizedText);
  return {
    intent,
    explanations: [newLeadExplanation(state.normalizedText)].filter((value): value is string => Boolean(value))
  };
}

function resolveEntities(state: OrchestrationState): Partial<OrchestrationState> {
  if (state.intent === "create_new_lead") {
    return {
      explanations: ["Entity resolution will not reuse the latest lead when a new-lead phrase is explicit."]
    };
  }
  return {};
}

function checkRisk(state: OrchestrationState): Partial<OrchestrationState> {
  const result = riskCheck(state.intent, state.facts, state.normalizedText);
  return {
    risk: result.risk,
    riskReason: result.reason
  };
}

function decideAction(state: OrchestrationState): Partial<OrchestrationState> {
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

export async function runCrmOrchestration(input: CrmOrchestrationInput): Promise<CrmOrchestrationResult> {
  const result = await graph.invoke({
    input,
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
    explanations: result.explanations
  };
}
