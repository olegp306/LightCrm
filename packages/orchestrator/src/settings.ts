import type { LangGraphRuntimeSettings } from "./types";

export type LangGraphRuntimeSettingsInput = Partial<
  Omit<
    LangGraphRuntimeSettings,
    "prompts" | "taxonomy" | "thresholds" | "confirmationPolicy" | "enabledNodes"
  >
> & {
  prompts?: Partial<LangGraphRuntimeSettings["prompts"]>;
  taxonomy?: Partial<Omit<LangGraphRuntimeSettings["taxonomy"], "requiredFieldsByAction">> & {
    requiredFieldsByAction?: Record<string, string[]>;
  };
  thresholds?: Partial<LangGraphRuntimeSettings["thresholds"]>;
  confirmationPolicy?: Partial<LangGraphRuntimeSettings["confirmationPolicy"]>;
  enabledNodes?: Partial<LangGraphRuntimeSettings["enabledNodes"]>;
};

const defaultEnabledNodes: LangGraphRuntimeSettings["enabledNodes"] = {
  normalizeMessage: true,
  extractFacts: true,
  classifyIntent: true,
  resolveEntities: true,
  riskCheck: true,
  decideAction: true
};

function createEnabledNodes(): LangGraphRuntimeSettings["enabledNodes"] {
  return { ...defaultEnabledNodes };
}

function createDefaultPrompts(): LangGraphRuntimeSettings["prompts"] {
  return {
    systemRole:
      "You are an operational AI Chief of Staff for an architecture bureau. Understand the whole message before deciding CRM actions. Return only valid JSON for the requested schema.",
    intentClassifier:
      "Classify the business meaning of the message. Do not rely on isolated keywords. If the message negates an action, classify the negated meaning. If uncertain, choose ask_clarification.",
    entityExtractor:
      "Extract only data explicitly stated or directly implied by the message and context. Every field must include evidence and confidence. Do not invent missing values.",
    targetResolver:
      "Resolve whether the message refers to an existing CRM entity or a new opportunity. Use candidates and context. If ambiguous, ask a clarification question.",
    validationGuard:
      "Reject unsafe actions: duplicate creation, hallucinated fields, missing required offer fields for final offer generation, or destructive operations without confirmation. Do not reject draft lead creation only because clientName, contact details, or project details are missing; draft leads may be enriched later.",
    actionPlanner: "Plan CRM actions only after intent, target, extracted entities, and validation are available."
  };
}

function createDefaultTaxonomy(): LangGraphRuntimeSettings["taxonomy"] {
  return {
    intents: [
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
    ],
    entityFields: [
      "clientName",
      "company",
      "requestType",
      "projectAddress",
      "areaM2",
      "budgetEur",
      "phone",
      "email",
      "desiredStart",
      "desiredMoveIn",
      "meetingDateTime",
      "reminderDateTime",
      "notes"
    ],
    requiredFieldsByAction: {
      create_lead: [],
      search_leads: [],
      update_lead: [],
      create_meeting: ["meetingDateTime"],
      create_reminder: ["reminderDateTime"],
      generate_offer_task: ["clientName", "requestType"]
    }
  };
}

function thresholds(autoExecute: number, askConfirmation = 0.55): LangGraphRuntimeSettings["thresholds"] {
  return {
    autoExecute,
    askConfirmation,
    duplicateCandidate: 0.72
  };
}

function confirmationPolicy(
  allowAutoCreateLead: boolean,
  allowAutoCreateReminder: boolean,
  requireConfirmationForWrites = false
): LangGraphRuntimeSettings["confirmationPolicy"] {
  return {
    requireConfirmationForWrites,
    requireConfirmationForDuplicateCandidates: true,
    allowAutoCreateLead,
    allowAutoCreateReminder
  };
}

function cloneSettings(settings: LangGraphRuntimeSettings): LangGraphRuntimeSettings {
  return {
    ...settings,
    forceReviewIntents: [...settings.forceReviewIntents],
    prompts: { ...settings.prompts },
    taxonomy: {
      intents: [...settings.taxonomy.intents],
      entityFields: [...settings.taxonomy.entityFields],
      requiredFieldsByAction: Object.fromEntries(
        Object.entries(settings.taxonomy.requiredFieldsByAction).map(([action, fields]) => [action, [...fields]])
      )
    },
    thresholds: { ...settings.thresholds },
    confirmationPolicy: { ...settings.confirmationPolicy },
    extraNewLeadPhrases: [...settings.extraNewLeadPhrases],
    mailAnalysisPhrases: [...settings.mailAnalysisPhrases],
    reminderPhrases: [...settings.reminderPhrases],
    enabledNodes: { ...settings.enabledNodes }
  };
}

function uniqueValues<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

export const LANGGRAPH_PRESETS: LangGraphRuntimeSettings[] = [
  {
    id: "leadHunter",
    name: "Lead Hunter",
    description: "Aggressively captures new lead requests from Telegram-style intake messages.",
    model: "gpt-4.1-mini",
    temperature: 0.2,
    confidenceThreshold: 0.58,
    autoCreateLead: true,
    autoCreateReminder: true,
    reviewNameOnlyUpdates: true,
    forceReviewIntents: ["delete_or_undo", "generate_offer"],
    semanticMode: true,
    prompts: createDefaultPrompts(),
    taxonomy: createDefaultTaxonomy(),
    thresholds: thresholds(0.58),
    confirmationPolicy: confirmationPolicy(true, true),
    extraNewLeadPhrases: [],
    mailAnalysisPhrases: [],
    reminderPhrases: [],
    enabledNodes: createEnabledNodes()
  },
  {
    id: "mailAnalyst",
    name: "Mail Analyst",
    description: "Treats forwarded email and inbox summaries as evidence for existing lead updates.",
    model: "gpt-4.1-mini",
    temperature: 0.1,
    confidenceThreshold: 0.72,
    autoCreateLead: false,
    autoCreateReminder: true,
    reviewNameOnlyUpdates: true,
    forceReviewIntents: ["create_new_lead", "delete_or_undo", "generate_offer", "update_existing_lead"],
    semanticMode: true,
    prompts: createDefaultPrompts(),
    taxonomy: createDefaultTaxonomy(),
    thresholds: thresholds(0.72),
    confirmationPolicy: confirmationPolicy(false, true),
    extraNewLeadPhrases: [],
    mailAnalysisPhrases: [],
    reminderPhrases: [],
    enabledNodes: createEnabledNodes()
  },
  {
    id: "riskAuditor",
    name: "Risk Auditor",
    description: "Conservative mode for testing: keeps most writes in human review.",
    model: "gpt-4.1-mini",
    temperature: 0,
    confidenceThreshold: 0.86,
    autoCreateLead: false,
    autoCreateReminder: false,
    reviewNameOnlyUpdates: true,
    forceReviewIntents: ["create_new_lead", "create_reminder", "delete_or_undo", "generate_offer", "update_existing_lead"],
    semanticMode: true,
    prompts: createDefaultPrompts(),
    taxonomy: createDefaultTaxonomy(),
    thresholds: thresholds(0.86, 0.75),
    confirmationPolicy: confirmationPolicy(false, false, true),
    extraNewLeadPhrases: [],
    mailAnalysisPhrases: [],
    reminderPhrases: [],
    enabledNodes: createEnabledNodes()
  },
  {
    id: "fastOperator",
    name: "Fast Operator",
    description: "Low-friction mode for speed testing with fewer review gates.",
    model: "gpt-4.1-mini",
    temperature: 0.35,
    confidenceThreshold: 0.48,
    autoCreateLead: true,
    autoCreateReminder: true,
    reviewNameOnlyUpdates: false,
    forceReviewIntents: ["delete_or_undo"],
    semanticMode: true,
    prompts: createDefaultPrompts(),
    taxonomy: createDefaultTaxonomy(),
    thresholds: thresholds(0.48),
    confirmationPolicy: confirmationPolicy(true, true),
    extraNewLeadPhrases: [],
    mailAnalysisPhrases: [],
    reminderPhrases: [],
    enabledNodes: createEnabledNodes()
  },
  {
    id: "relationshipKeeper",
    name: "Relationship Keeper",
    description: "Balances client relationship updates, reminders, and careful lead linking.",
    model: "gpt-4.1-mini",
    temperature: 0.18,
    confidenceThreshold: 0.68,
    autoCreateLead: true,
    autoCreateReminder: true,
    reviewNameOnlyUpdates: true,
    forceReviewIntents: ["delete_or_undo", "generate_offer", "update_existing_lead"],
    semanticMode: true,
    prompts: createDefaultPrompts(),
    taxonomy: createDefaultTaxonomy(),
    thresholds: thresholds(0.68),
    confirmationPolicy: confirmationPolicy(true, true),
    extraNewLeadPhrases: [],
    mailAnalysisPhrases: [],
    reminderPhrases: [],
    enabledNodes: createEnabledNodes()
  }
];

export const DEFAULT_LANGGRAPH_SETTINGS = cloneSettings(LANGGRAPH_PRESETS[0]);

export function mergeLangGraphSettings(
  value: LangGraphRuntimeSettingsInput | null | undefined
): LangGraphRuntimeSettings {
  const base =
    value?.id && value.id !== "custom"
      ? LANGGRAPH_PRESETS.find((preset) => preset.id === value.id) ?? DEFAULT_LANGGRAPH_SETTINGS
      : DEFAULT_LANGGRAPH_SETTINGS;
  const mergedTaxonomy = {
    ...base.taxonomy,
    ...(value?.taxonomy ?? {})
  };

  return {
    ...cloneSettings(base),
    ...value,
    prompts: {
      ...base.prompts,
      ...(value?.prompts ?? {})
    },
    taxonomy: {
      intents: uniqueValues([...base.taxonomy.intents, ...mergedTaxonomy.intents]),
      entityFields: uniqueValues([...base.taxonomy.entityFields, ...mergedTaxonomy.entityFields]),
      requiredFieldsByAction: Object.fromEntries(
        Object.entries({
          ...base.taxonomy.requiredFieldsByAction,
          ...(value?.taxonomy?.requiredFieldsByAction ?? {})
        }).map(([action, fields]) => [action, [...fields]])
      )
    },
    thresholds: {
      ...base.thresholds,
      ...(value?.thresholds ?? {})
    },
    confirmationPolicy: {
      ...base.confirmationPolicy,
      ...(value?.confirmationPolicy ?? {})
    },
    enabledNodes: {
      ...base.enabledNodes,
      ...(value?.enabledNodes ?? {})
    },
    forceReviewIntents: [...(value?.forceReviewIntents ?? base.forceReviewIntents)],
    extraNewLeadPhrases: [...(value?.extraNewLeadPhrases ?? base.extraNewLeadPhrases)],
    mailAnalysisPhrases: [...(value?.mailAnalysisPhrases ?? base.mailAnalysisPhrases)],
    reminderPhrases: [...(value?.reminderPhrases ?? base.reminderPhrases)]
  };
}
