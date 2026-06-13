import type { LangGraphRuntimeSettings } from "./types";

type OfferReadinessFieldInput = Partial<LangGraphRuntimeSettings["offerReadiness"]["fields"][number]> & { key: string };

export type LangGraphRuntimeSettingsInput = Partial<
  Omit<
    LangGraphRuntimeSettings,
    | "prompts"
    | "taxonomy"
    | "thresholds"
    | "confirmationPolicy"
    | "tgIntakePolicy"
    | "offerReadiness"
    | "enabledNodes"
    | "projectPeople"
  >
> & {
  prompts?: Partial<LangGraphRuntimeSettings["prompts"]>;
  taxonomy?: Partial<Omit<LangGraphRuntimeSettings["taxonomy"], "requiredFieldsByAction">> & {
    requiredFieldsByAction?: Record<string, string[]>;
  };
  thresholds?: Partial<LangGraphRuntimeSettings["thresholds"]>;
  confirmationPolicy?: Partial<LangGraphRuntimeSettings["confirmationPolicy"]>;
  tgIntakePolicy?: Partial<LangGraphRuntimeSettings["tgIntakePolicy"]>;
  offerReadiness?: Partial<Omit<LangGraphRuntimeSettings["offerReadiness"], "fields">> & {
    fields?: OfferReadinessFieldInput[];
  };
  enabledNodes?: Partial<LangGraphRuntimeSettings["enabledNodes"]>;
  projectPeople?: Array<{
    name: string;
    aliases?: string[];
    role: string;
    description: string;
  }>;
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
      "Classify the business meaning of the message. Do not rely on isolated keywords. If the message asks what LightCrm is, what the bot can do, or how to use leads, reminders, documents, TG, mobile CRM, or commercial offers, choose system_help. If the message negates an action, classify the negated meaning. If uncertain, choose ask_clarification.",
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
      "system_help",
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
      system_help: [],
      create_meeting: ["meetingDateTime"],
      create_reminder: ["reminderDateTime"],
      generate_offer_task: ["clientName", "requestType"]
    }
  };
}

function createDefaultProjectPeople(): LangGraphRuntimeSettings["projectPeople"] {
  return [
    {
      name: "Екатерина Рыбцевих",
      aliases: ["Katya", "Ekaterina", "Katia"],
      role: "director",
      description:
        "Director of the architecture bureau. Treat her as an internal decision-maker or message forwarder, not as the client, unless the message explicitly says she is the client."
    },
    {
      name: "Олег Панюков",
      aliases: ["Oleg Panyukov", "Oleg"],
      role: "developer",
      description:
        "Developer and tester for LightCrm. Treat him as internal project staff, not as a client, lead, or offer recipient."
    }
  ];
}

function createDefaultTgIntakePolicy(): LangGraphRuntimeSettings["tgIntakePolicy"] {
  return {
    actionStrictness: "auto_create_drafts",
    alwaysShowUndoForWrites: true,
    analyzeAttachmentsBeforeAction: true,
    neverCreateFromAttachmentOnly: true,
    requireMeaningfulAttachmentContent: true,
    bundleWaitMs: 3500
  };
}

function createDefaultOfferReadinessFields(): LangGraphRuntimeSettings["offerReadiness"]["fields"] {
  return [
    {
      key: "clientName",
      label: "Client name",
      required: true,
      aliases: ["client_name", "Kunde", "Auftraggeber", "client", "customer"],
      sources: ["lead", "client", "documents", "director_instruction", "manual"],
      confidenceThreshold: 0.72,
      autoFill: true
    },
    {
      key: "projectName",
      label: "Project name",
      required: true,
      aliases: ["project_name", "Projekt", "Betreff", "project"],
      sources: ["lead", "documents", "director_instruction", "manual"],
      confidenceThreshold: 0.7,
      autoFill: true
    },
    {
      key: "projectAddress",
      label: "Project address",
      required: true,
      aliases: ["project_address", "Adresse", "Bauort", "Ort", "location", "address"],
      sources: ["lead", "documents", "director_instruction", "manual"],
      confidenceThreshold: 0.75,
      autoFill: true
    },
    {
      key: "requestType",
      label: "Project type",
      required: true,
      aliases: ["project_type", "requestType", "Einfamilienhaus", "EFH", "private house", "Neubau"],
      sources: ["lead", "documents", "director_instruction", "manual"],
      confidenceThreshold: 0.7,
      autoFill: true
    },
    {
      key: "areaM2",
      label: "BGF / area",
      required: true,
      aliases: ["bgf", "BGF", "Bruttogrundfläche", "area", "Fläche", "m2", "m²"],
      sources: ["lead", "documents", "director_instruction", "manual"],
      confidenceThreshold: 0.78,
      autoFill: true
    }
  ];
}

function createDefaultOfferReadiness(): LangGraphRuntimeSettings["offerReadiness"] {
  return {
    analyzeLeadForOfferReadiness: true,
    extractOfferFieldsFromAttachments: true,
    autoUpdateLeadWithConfidentFields: true,
    autoGenerateWhenPriceReady: false,
    requireEvidenceForOfferFields: true,
    fields: createDefaultOfferReadinessFields()
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
    tgIntakePolicy: { ...settings.tgIntakePolicy },
    offerReadiness: {
      ...settings.offerReadiness,
      fields: settings.offerReadiness.fields.map((field) => ({
        ...field,
        aliases: [...field.aliases],
        sources: [...field.sources]
      }))
    },
    extraNewLeadPhrases: [...settings.extraNewLeadPhrases],
    mailAnalysisPhrases: [...settings.mailAnalysisPhrases],
    reminderPhrases: [...settings.reminderPhrases],
    projectPeople: settings.projectPeople.map((person) => ({ ...person, aliases: [...person.aliases] })),
    enabledNodes: { ...settings.enabledNodes }
  };
}

function uniqueValues<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function mergeOfferReadinessFields(
  baseFields: LangGraphRuntimeSettings["offerReadiness"]["fields"],
  inputFields: OfferReadinessFieldInput[] | undefined
): LangGraphRuntimeSettings["offerReadiness"]["fields"] {
  const byKey = new Map(baseFields.map((field) => [field.key, field]));
  return (inputFields ?? baseFields)
    .map((field) => {
      const base = byKey.get(field.key) ?? baseFields[0];
      return {
        key: field.key,
        label: field.label ?? base?.label ?? field.key,
        required: field.required ?? base?.required ?? false,
        aliases: uniqueValues([...(field.aliases ?? base?.aliases ?? [])].map((alias) => alias.trim()).filter(Boolean)),
        sources: uniqueValues([...(field.sources ?? base?.sources ?? [])].map((source) => source.trim()).filter(Boolean)),
        confidenceThreshold: field.confidenceThreshold ?? base?.confidenceThreshold ?? 0.7,
        autoFill: field.autoFill ?? base?.autoFill ?? true
      };
    })
    .filter((field) => field.key.trim());
}

export const LANGGRAPH_PRESETS: LangGraphRuntimeSettings[] = [
  {
    id: "leadHunter",
    name: "Lead Hunter",
    description: "Aggressively captures new lead requests from TG-style intake messages.",
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
    tgIntakePolicy: createDefaultTgIntakePolicy(),
    offerReadiness: createDefaultOfferReadiness(),
    projectPeople: createDefaultProjectPeople(),
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
    tgIntakePolicy: { ...createDefaultTgIntakePolicy(), actionStrictness: "strong_evidence" },
    offerReadiness: createDefaultOfferReadiness(),
    projectPeople: createDefaultProjectPeople(),
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
    tgIntakePolicy: { ...createDefaultTgIntakePolicy(), actionStrictness: "preview_first" },
    offerReadiness: createDefaultOfferReadiness(),
    projectPeople: createDefaultProjectPeople(),
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
    tgIntakePolicy: { ...createDefaultTgIntakePolicy(), neverCreateFromAttachmentOnly: false },
    offerReadiness: createDefaultOfferReadiness(),
    projectPeople: createDefaultProjectPeople(),
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
    tgIntakePolicy: createDefaultTgIntakePolicy(),
    offerReadiness: createDefaultOfferReadiness(),
    projectPeople: createDefaultProjectPeople(),
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
    tgIntakePolicy: {
      ...base.tgIntakePolicy,
      ...(value?.tgIntakePolicy ?? {})
    },
    offerReadiness: {
      ...base.offerReadiness,
      ...(value?.offerReadiness ?? {}),
      fields: mergeOfferReadinessFields(base.offerReadiness.fields, value?.offerReadiness?.fields)
    },
    enabledNodes: {
      ...base.enabledNodes,
      ...(value?.enabledNodes ?? {})
    },
    projectPeople: (value?.projectPeople ?? base.projectPeople)
      .map((person) => ({
        name: person.name.trim(),
        aliases: uniqueValues((person.aliases ?? []).map((alias) => alias.trim()).filter(Boolean)),
        role: person.role.trim(),
        description: person.description.trim()
      }))
      .filter((person) => person.name && person.role),
    forceReviewIntents: [...(value?.forceReviewIntents ?? base.forceReviewIntents)],
    extraNewLeadPhrases: [...(value?.extraNewLeadPhrases ?? base.extraNewLeadPhrases)],
    mailAnalysisPhrases: [...(value?.mailAnalysisPhrases ?? base.mailAnalysisPhrases)],
    reminderPhrases: [...(value?.reminderPhrases ?? base.reminderPhrases)]
  };
}
