export type CrmIntent =
  | "create_new_lead"
  | "update_existing_lead"
  | "create_contact"
  | "update_contact"
  | "create_reminder"
  | "create_meeting"
  | "generate_offer"
  | "delete_or_undo"
  | "clarification"
  | "unknown";

export type RiskLevel = "auto" | "review" | "blocked";

export type LangGraphPresetId =
  | "leadHunter"
  | "mailAnalyst"
  | "riskAuditor"
  | "fastOperator"
  | "relationshipKeeper";

export type LangGraphRuntimeSettings = {
  id: LangGraphPresetId | "custom";
  name: string;
  description: string;
  model: string;
  temperature: number;
  confidenceThreshold: number;
  autoCreateLead: boolean;
  autoCreateReminder: boolean;
  reviewNameOnlyUpdates: boolean;
  forceReviewIntents: CrmIntent[];
  semanticMode: boolean;
  prompts: {
    systemRole: string;
    intentClassifier: string;
    entityExtractor: string;
    targetResolver: string;
    validationGuard: string;
    actionPlanner: string;
  };
  taxonomy: {
    intents: SemanticIntent[];
    entityFields: string[];
    requiredFieldsByAction: Record<string, string[]>;
  };
  thresholds: {
    autoExecute: number;
    askConfirmation: number;
    duplicateCandidate: number;
  };
  confirmationPolicy: {
    requireConfirmationForWrites: boolean;
    requireConfirmationForDuplicateCandidates: boolean;
    allowAutoCreateLead: boolean;
    allowAutoCreateReminder: boolean;
  };
  tgIntakePolicy: {
    actionStrictness: "preview_first" | "strong_evidence" | "auto_create_drafts";
    alwaysShowUndoForWrites: boolean;
    analyzeAttachmentsBeforeAction: boolean;
    neverCreateFromAttachmentOnly: boolean;
    requireMeaningfulAttachmentContent: boolean;
    bundleWaitMs: number;
  };
  offerReadiness: {
    analyzeLeadForOfferReadiness: boolean;
    extractOfferFieldsFromAttachments: boolean;
    autoUpdateLeadWithConfidentFields: boolean;
    autoGenerateWhenPriceReady: boolean;
    requireEvidenceForOfferFields: boolean;
    fields: Array<{
      key: string;
      label: string;
      required: boolean;
      aliases: string[];
      sources: string[];
      confidenceThreshold: number;
      autoFill: boolean;
    }>;
  };
  projectPeople: Array<{
    name: string;
    aliases: string[];
    role: string;
    description: string;
  }>;
  extraNewLeadPhrases: string[];
  mailAnalysisPhrases: string[];
  reminderPhrases: string[];
  enabledNodes: {
    normalizeMessage: boolean;
    extractFacts: boolean;
    classifyIntent: boolean;
    resolveEntities: boolean;
    riskCheck: boolean;
    decideAction: boolean;
  };
};

export type MessageEvidence = {
  sourceMessageId: string | null;
  author: string | null;
  sourceChannel: "telegram" | "manual" | "import";
  textSnippet: string;
};

export type ExtractedFacts = {
  contactName: string | null;
  projectName: string | null;
  projectType: string | null;
  location: string | null;
  areaM2: number | null;
  phone: string | null;
  budgetEur: number | null;
  dueAt: string | null;
  sourceMessageId: string | null;
  evidence: MessageEvidence;
};

export type PlannedCrmAction = {
  type:
    | "create_lead"
    | "update_lead"
    | "search_leads"
    | "create_reminder"
    | "create_meeting"
    | "create_contact"
    | "request_review";
  risk: RiskLevel;
  reason: string;
  payload: Record<string, unknown>;
};

export type LangGraphTraceEvent = {
  id: string;
  node: SemanticNodeName | "legacy";
  status: "done" | "review" | "blocked" | "skipped";
  titleRu: string;
  messageRu: string;
  details?: Record<string, string | number | boolean | null>;
};

export type CrmOrchestrationInput = {
  workspaceId: string;
  messageId?: string | null;
  author?: string | null;
  text: string;
  sourceChannel?: "telegram" | "manual" | "import";
  recentLeads?: ContextLeadCandidate[];
  recentMessages?: ContextMessage[];
};

export type ContextLeadCandidate = {
  id: string;
  label: string;
  summary: string | null;
  lastTouchedAt: string | null;
};

export type ContextMessage = {
  id: string;
  text: string;
  createdAt: string;
};

export type OrchestrationContextInput = {
  input: CrmOrchestrationInput;
  recentLeads?: ContextLeadCandidate[];
  recentMessages?: ContextMessage[];
};

export type OrchestrationContext = {
  source: CrmOrchestrationInput;
  recentLeads: ContextLeadCandidate[];
  recentMessages: ContextMessage[];
  relationshipHints: string[];
};

export type CrmOrchestrationResult = {
  workspaceId: string;
  normalizedText: string;
  intent: CrmIntent | SemanticIntent;
  facts: ExtractedFacts;
  actions: PlannedCrmAction[];
  risk: RiskLevel;
  explanations: string[];
  settings: LangGraphRuntimeSettings;
  trace?: LangGraphTraceEvent[];
};

export type SemanticIntent =
  | "create_lead"
  | "search_leads"
  | "update_lead"
  | "create_task"
  | "create_reminder"
  | "create_meeting"
  | "attach_document"
  | "generate_offer_task"
  | "fill_offer_fields"
  | "add_lead_note"
  | "system_help"
  | "ask_clarification"
  | "no_action";

export type SemanticNodeName =
  | "collectInput"
  | "buildContext"
  | "classifyIntent"
  | "resolveTarget"
  | "extractEntities"
  | "validateAction"
  | "planAction"
  | "executionGate";

export type FieldEvidence<T = string | number | boolean | null> = {
  value: T;
  confidence: number;
  evidence: string;
  sourceMessageIds: string[];
};

export type SemanticExtractedEntities = {
  fields: Record<string, FieldEvidence>;
  missingData: string[];
  notes: string[];
};

export type ResolvedTargetCandidate = {
  id: string;
  label: string;
  score: number;
  reason: string;
};

export type ResolvedTarget = {
  targetType: "lead" | "client" | "project" | "task" | "none";
  targetId: string | null;
  confidence: number;
  candidates: ResolvedTargetCandidate[];
  needsClarification: boolean;
  clarificationQuestion: string | null;
};

export type SemanticValidationDecision = {
  approved: boolean;
  riskLevel: "low" | "medium" | "high";
  reason: string;
  needsHumanConfirmation: boolean;
};
