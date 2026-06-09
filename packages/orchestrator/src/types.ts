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
  type: "create_lead" | "update_lead" | "create_reminder" | "create_contact" | "request_review";
  risk: RiskLevel;
  reason: string;
  payload: Record<string, unknown>;
};

export type CrmOrchestrationInput = {
  workspaceId: string;
  messageId?: string | null;
  author?: string | null;
  text: string;
  sourceChannel?: "telegram" | "manual" | "import";
};

export type CrmOrchestrationResult = {
  workspaceId: string;
  normalizedText: string;
  intent: CrmIntent;
  facts: ExtractedFacts;
  actions: PlannedCrmAction[];
  risk: RiskLevel;
  explanations: string[];
  settings: LangGraphRuntimeSettings;
};
