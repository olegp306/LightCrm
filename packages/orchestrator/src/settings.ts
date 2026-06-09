import type { LangGraphRuntimeSettings } from "./types";

const enabledNodes = {
  normalizeMessage: true,
  extractFacts: true,
  classifyIntent: true,
  resolveEntities: true,
  riskCheck: true,
  decideAction: true
};

function cloneSettings(settings: LangGraphRuntimeSettings): LangGraphRuntimeSettings {
  return {
    ...settings,
    forceReviewIntents: [...settings.forceReviewIntents],
    extraNewLeadPhrases: [...settings.extraNewLeadPhrases],
    mailAnalysisPhrases: [...settings.mailAnalysisPhrases],
    reminderPhrases: [...settings.reminderPhrases],
    enabledNodes: { ...settings.enabledNodes }
  };
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
    extraNewLeadPhrases: ["заявка", "новая заявка", "запрос на проект", "хочет построить"],
    mailAnalysisPhrases: [],
    reminderPhrases: ["фоллоу", "follow", "напомни"],
    enabledNodes
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
    extraNewLeadPhrases: [],
    mailAnalysisPhrases: ["разбор почты", "письмо", "email", "mail", "inbox", "ответ по проекту"],
    reminderPhrases: ["follow up", "ответить", "напомни"],
    enabledNodes
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
    extraNewLeadPhrases: [],
    mailAnalysisPhrases: [],
    reminderPhrases: [],
    enabledNodes
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
    extraNewLeadPhrases: ["заявка", "следующий", "клиент пишет"],
    mailAnalysisPhrases: ["письмо"],
    reminderPhrases: ["позже", "созвон", "напомни"],
    enabledNodes
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
    extraNewLeadPhrases: ["знакомый привел", "клиент рекомендует"],
    mailAnalysisPhrases: ["переписка", "чат", "ответил"],
    reminderPhrases: ["договорились", "мячик", "обещала", "напомни"],
    enabledNodes
  }
];

export const DEFAULT_LANGGRAPH_SETTINGS = LANGGRAPH_PRESETS[0];

export function mergeLangGraphSettings(
  value: Partial<LangGraphRuntimeSettings> | null | undefined
): LangGraphRuntimeSettings {
  const base =
    value?.id && value.id !== "custom"
      ? LANGGRAPH_PRESETS.find((preset) => preset.id === value.id) ?? DEFAULT_LANGGRAPH_SETTINGS
      : DEFAULT_LANGGRAPH_SETTINGS;
  return {
    ...cloneSettings(base),
    ...value,
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
