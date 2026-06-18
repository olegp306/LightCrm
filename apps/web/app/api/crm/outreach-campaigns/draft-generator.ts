import type { OutreachCampaignSettings, OutreachCampaignTouchpoint } from "../settings/crm-settings-store";

export type OutreachDraftTarget = {
  name: string;
  company: string | null;
  notesResearch: string | null;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  country?: string | null;
};

export type OutreachDraft = {
  subject: string;
  body: string;
  salutation: string;
  personaHook: string;
  promptApplied: boolean;
};

function compactText(value: string | null | undefined) {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function hasCyrillic(value: string) {
  return /[\u0400-\u04ff]/.test(value);
}

function forbidsPraise(prompt: string) {
  return /no praise|keine lob|generic flattery|flattery/i.test(prompt);
}

function splitSentences(value: string) {
  return compactText(value)
    .split(/(?<=[.!?])\s+|\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeGermanText(value: string) {
  return value
    .replace(/[\u201c\u201d]/g, "\"")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\u00a0/g, " ")
    .replace(/\u00c3\u009f/g, "\u00df")
    .replace(/\u00c3\u00a4/g, "\u00e4")
    .replace(/\u00c3\u00b6/g, "\u00f6")
    .replace(/\u00c3\u00bc/g, "\u00fc")
    .replace(/\u00c3\u0084/g, "\u00c4")
    .replace(/\u00c3\u0096/g, "\u00d6")
    .replace(/\u00c3\u009c/g, "\u00dc");
}

function companySalutation(target: OutreachDraftTarget) {
  const name = compactText(target.name);
  const company = compactText(target.company);
  if (name && company && name.toLocaleLowerCase() !== company.toLocaleLowerCase()) {
    return name;
  }
  if (name && !company) {
    return name;
  }
  return "zusammen";
}

function extractExperienceFact(research: string) {
  const plusMatch = research.match(/(\d{1,2})\s*\+\s*(\d{1,2})\s*(?:jahre|years|Р В»Р ВµРЎвЂљ)?/i);
  if (plusMatch) {
    const total = Number(plusMatch[1]) + Number(plusMatch[2]);
    if (Number.isFinite(total) && total >= 10) {
      return "Die Recherche nennt langjährige Erfahrung im Bau- und Immobilienumfeld; daran knüpfen wir mit früher, belastbarer Planung an.";
    }
  }
  const yearsMatch = research.match(/(\d{2,})\s*(?:jahre|years|Р В»Р ВµРЎвЂљ)/i);
  if (yearsMatch) {
    return "Die Recherche zeigt langjährige Erfahrung im Projekt- und Bauumfeld; daran knüpfen wir mit belastbarer früher Planung an.";
  }
  return "";
}

function extractLocationFact(research: string, target: OutreachDraftTarget) {
  const location = compactText(target.city) || compactText(target.country);
  if (location) {
    return `Für Projekte mit Bezug zu ${location} kann eine sauber vorbereitete LP 1-4 die nächsten Entscheidungen entlasten.`;
  }
  const cityMatch = research.match(/\b(München|Muenchen|Munich|Berlin|Hamburg|Frankfurt|Stuttgart|Köln|Koeln|Düsseldorf|Duesseldorf|Leipzig|Dresden|Nürnberg|Nuernberg|Augsburg)\b/i);
  if (cityMatch?.[1]) {
    return `Für Projekte mit Bezug zu ${cityMatch[1]} kann eine sauber vorbereitete LP 1-4 die nächsten Entscheidungen entlasten.`;
  }
  return "";
}

function extractProjectFact(research: string) {
  const normalized = research.toLocaleLowerCase();
  if (/bautraeger|bautr\u00e4ger|developer|development|projektentwick/i.test(research)) {
    return "Der Research-Kontext passt zu Bauträger- und Projektentwicklungsaufgaben, bei denen frühe Varianten und Genehmigungsgrundlagen entscheidend sind.";
  }
  if (/wohn|residential|mehrfamilien|apartment|housing/i.test(research)) {
    return "Der Research-Kontext verweist auf Wohnungsbau; gerade dort helfen klare Flächen, Varianten und Genehmigungsgrundlagen früh im Prozess.";
  }
  if (/office|buero|b\u00fcro|gewerbe|commercial/i.test(research)) {
    return "Der Research-Kontext verweist auf gewerbliche Projekte; dafür kann eine klare frühe Planung die Abstimmung und Genehmigung strukturieren.";
  }
  if (normalized.includes("architecture") || normalized.includes("architektur")) {
    return "Der Research-Kontext zeigt Berührungspunkte mit Planung und Bau; unser Ansatz bleibt deshalb konkret bei LP 1-4 und belastbaren Entscheidungsgrundlagen.";
  }
  return "";
}

function safeResearchSentence(research: string, noPraise: boolean) {
  const sentence = splitSentences(research).find((item) => {
    if (hasCyrillic(item)) {
      return false;
    }
    if (item.length < 24 || item.length > 190) {
      return false;
    }
    if (noPraise && /excellent|great|impressive|beeindruckend|fuehrend|renommiert/i.test(item)) {
      return false;
    }
    return true;
  });
  if (!sentence) {
    return "";
  }
  return normalizeGermanText(sentence.replace(/^[+-]\s*/, ""));
}

function personaHookFromResearch(campaign: OutreachCampaignSettings, target: OutreachDraftTarget) {
  const prompt = campaign.prompt ?? "";
  const research = compactText(target.notesResearch);
  const noPraise = forbidsPraise(prompt);
  if (!research) {
    return "Ich habe mir den Kontakt kurz angesehen und sehe möglichen Bedarf für externe Unterstützung in frühen Planungsphasen.";
  }

  const facts = [extractExperienceFact(research), extractLocationFact(research, target), extractProjectFact(research)].filter(Boolean).slice(0, 2);
  if (facts.length > 0) {
    return facts.join(" ");
  }

  const safeSentence = safeResearchSentence(research, noPraise);
  if (safeSentence) {
    return `Aus der Recherche nehme ich vor allem diesen Anknüpfungspunkt mit: ${safeSentence}`;
  }

  return "Aus den Research-Notizen ergibt sich ein möglicher Bezug zu frühen Projektphasen; deshalb halte ich einen kurzen fachlichen Abgleich für sinnvoll.";
}

function fillTemplate(value: string, replacements: Record<string, string>) {
  return value.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (match, key: string) => replacements[key] || match);
}

function normalizeEmailSignature(signature: string | null | undefined) {
  return (signature ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function bodyHasSignature(body: string, signature: string) {
  const normalizedBody = compactText(body).toLocaleLowerCase();
  const firstSignatureLine = signature.split("\n").map((line) => line.trim()).find(Boolean);
  return Boolean(firstSignatureLine && normalizedBody.includes(firstSignatureLine.toLocaleLowerCase()));
}

function appendSignature(body: string, signature: string | null | undefined) {
  const cleanedSignature = normalizeEmailSignature(signature);
  const cleanedBody = body.replace(/\s+$/g, "");
  if (!cleanedSignature || bodyHasSignature(cleanedBody, cleanedSignature)) {
    return cleanedBody;
  }
  return `${cleanedBody}\n\n${cleanedSignature}`;
}

export function draftForCampaign(
  campaign: OutreachCampaignSettings,
  coldTarget: OutreachDraftTarget,
  touch: Pick<OutreachCampaignTouchpoint, "templateId" | "action" | "channel">,
  emailSignature?: string | null
): OutreachDraft {
  const promptApplied = Boolean(compactText(campaign.prompt));
  const template = campaign.templates.find((item) => item.id === touch.templateId);
  const salutation = companySalutation(coldTarget);
  const personaHook = personaHookFromResearch(campaign, coldTarget);
  if (!template) {
    return {
      subject: "",
      body: appendSignature(`Manual action: prepare ${campaign.name} touch for ${salutation}.\n\nPersona hook: ${personaHook}`, emailSignature),
      salutation,
      personaHook,
      promptApplied
    };
  }
  const replacements = {
    salutation,
    persona_hook: normalizeGermanText(personaHook)
  };
  return {
    subject: normalizeGermanText(fillTemplate(template.subject, replacements)),
    body: appendSignature(normalizeGermanText(fillTemplate(template.body, replacements)), emailSignature),
    salutation,
    personaHook,
    promptApplied
  };
}
