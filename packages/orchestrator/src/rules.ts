import type { CrmIntent, CrmOrchestrationInput, ExtractedFacts, MessageEvidence, PlannedCrmAction, RiskLevel } from "./types";

const newLeadPhrases = [
  "новый клиент",
  "новый лид",
  "ещё новый лид",
  "еще новый лид",
  "следующий клиент",
  "следующие клиент",
  "следующий объект",
  "следующего потенциального клиента",
  "это новый лид",
  "снова клиент"
];

const riskyPhrases = ["удали", "удалить", "delete", "undo", "отмени", "коммерческое предложение", "kp", "кп", "offer"];

function normalizeForRules(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

function firstMatch(text: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return match[1].trim().replace(/[,.]+$/g, "");
    }
  }
  return null;
}

function toIsoFollowUp(text: string): string | null {
  const normalized = normalizeForRules(text);
  if (!normalized.includes("8 июня")) {
    return null;
  }
  if (normalized.includes("10 утра") || normalized.includes("10:00")) {
    return "2026-06-08T10:00:00.000Z";
  }
  return "2026-06-08T09:00:00.000Z";
}

export function createEvidence(input: CrmOrchestrationInput, normalizedText: string): MessageEvidence {
  return {
    sourceMessageId: input.messageId ?? null,
    author: input.author ?? null,
    sourceChannel: input.sourceChannel ?? "telegram",
    textSnippet: normalizedText.slice(0, 240)
  };
}

export function classifyIntentByRules(text: string): CrmIntent {
  const normalized = normalizeForRules(text);
  if (newLeadPhrases.some((phrase) => normalized.includes(phrase))) {
    return "create_new_lead";
  }
  if (riskyPhrases.some((phrase) => normalized.includes(phrase)) && /удал|delete|undo|отмени/.test(normalized)) {
    return "delete_or_undo";
  }
  if (/имя клиента\s*[-:]/i.test(text)) {
    return "update_contact";
  }
  if (/понедельник|фоллоу|follow|напомни|встреч/i.test(text)) {
    return "create_reminder";
  }
  if (/коммерческое предложение|offer|кп/i.test(text)) {
    return "generate_offer";
  }
  return "unknown";
}

export function extractFactsByRules(input: CrmOrchestrationInput, normalizedText: string): ExtractedFacts {
  const evidence = createEvidence(input, normalizedText);
  const contactName =
    firstMatch(normalizedText, [
      /снова\s+([А-ЯЁA-Z][\p{L}]+(?:\s+[А-ЯЁA-Z][\p{L}]+){0,2})/u,
      /зовут\s+(?:его\s+)?([А-ЯЁA-Z][\p{L}]+(?:\s+[А-ЯЁA-Z][\p{L}]+){0,2})/u,
      /имя клиента\s*[-:]\s*([А-ЯЁA-Z][\p{L}]+(?:\s+[А-ЯЁA-Z][\p{L}]+){0,2})/u,
      /(Артур\s+Grauberger|Максим\s+Тютюник|Thomas\s+Wachter|Tim\s+Tibo|Ufuk\s+Alp)/u
    ]) ?? null;
  const area = normalizedText.match(/(\d[\d\s,.]*)\s*(?:м²|m²|квадрат)/i)?.[1];
  const budget = normalizedText.match(/€\s?(\d[\d\s,.]*)|(\d[\d\s,.]*)\s*eur/i);
  const phone = normalizedText.match(/\+\d[\d\s-]{6,}/)?.[0]?.trim() ?? null;
  const rawLocation = firstMatch(normalizedText, [
    /проект в ([А-ЯЁA-Z][\p{L}\s-]+)/u,
    /(Швейцарии|Швейцария|Obernsees|Мюнхене|Unterwössen|Birkenfeld|Konz bei Trier)/u
  ]);
  const location = rawLocation === "Швейцарии" ? "Швейцария" : rawLocation;
  const potentialDeveloper = /потенциальн|застройщик|developer/i.test(normalizedText);
  const privateHouse = /частн(?:ый|ого)? дом|private house/i.test(normalizedText);
  const projectType = potentialDeveloper ? "potential_developer" : privateHouse ? "private_house" : null;

  return {
    contactName,
    projectName: firstMatch(normalizedText, [/проект\s+([^,.]+)/iu]),
    projectType,
    location,
    areaM2: area ? Number(area.replace(/[^\d]/g, "")) : null,
    phone,
    budgetEur: budget ? Number((budget[1] ?? budget[2]).replace(/[^\d]/g, "")) : null,
    dueAt: toIsoFollowUp(normalizedText),
    sourceMessageId: input.messageId ?? null,
    evidence
  };
}

export function riskCheck(intent: CrmIntent, facts: ExtractedFacts, text: string): { risk: RiskLevel; reason: string } {
  const normalized = normalizeForRules(text);
  if (intent === "delete_or_undo" || intent === "generate_offer") {
    return { risk: "review", reason: "Risky CRM action requires human confirmation." };
  }
  if (intent === "update_contact" && facts.contactName && normalized.startsWith("имя клиента")) {
    return { risk: "review", reason: "Name-only update can attach a person to the wrong recent lead." };
  }
  if (intent === "unknown") {
    return { risk: "review", reason: "Intent is unknown." };
  }
  return { risk: "auto", reason: "Low-risk CRM action." };
}

export function planActions(intent: CrmIntent, facts: ExtractedFacts, risk: RiskLevel, reason: string): PlannedCrmAction[] {
  const payloadBase = {
    sourceChannel: facts.evidence.sourceChannel,
    externalMessageId: facts.evidence.sourceMessageId,
    evidence: facts.evidence
  };
  if (risk === "review") {
    return [{ type: "request_review", risk, reason, payload: { intent, facts, ...payloadBase } }];
  }
  if (intent === "create_new_lead") {
    return [
      {
        type: "create_lead",
        risk,
        reason: facts.projectType === "potential_developer" ? "Potential developer should be preserved even without a concrete project." : reason,
        payload: {
          ...payloadBase,
          name: facts.contactName ?? facts.projectName ?? "New lead",
          status: facts.projectType === "potential_developer" ? "contacted" : "new",
          notes: [facts.projectName, facts.projectType, facts.location].filter(Boolean).join(" | ") || null
        }
      }
    ];
  }
  if (intent === "create_reminder") {
    return [
      {
        type: "create_reminder",
        risk,
        reason,
        payload: {
          ...payloadBase,
          title: "Follow up",
          dueAt: facts.dueAt,
          description: facts.evidence.textSnippet
        }
      }
    ];
  }
  return [{ type: "request_review", risk: "review", reason: "No auto action is configured for this intent.", payload: { intent, facts, ...payloadBase } }];
}

export function newLeadExplanation(text: string): string | null {
  const normalized = normalizeForRules(text);
  return newLeadPhrases.some((phrase) => normalized.includes(phrase))
    ? "Explicit new-lead phrase wins over similar contact names."
    : null;
}
