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

function hasGermanBusinessTone(prompt: string) {
  return /german|deutsch|sie|architectural|business/i.test(prompt);
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

function normalizeAsciiGerman(value: string) {
  return value
    .replace(/[вЂњвЂќ]/g, "\"")
    .replace(/[вЂвЂ™]/g, "'")
    .replace(/\u00a0/g, " ")
    .replace(/Гџ/g, "ss")
    .replace(/Г¤/g, "ae")
    .replace(/Г¶/g, "oe")
    .replace(/Гј/g, "ue")
    .replace(/Г„/g, "Ae")
    .replace(/Г–/g, "Oe")
    .replace(/Гњ/g, "Ue");
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
  const plusMatch = research.match(/(\d{1,2})\s*\+\s*(\d{1,2})\s*(?:jahre|years|Р»РµС‚)?/i);
  if (plusMatch) {
    const total = Number(plusMatch[1]) + Number(plusMatch[2]);
    if (Number.isFinite(total) && total >= 10) {
      return "Die Recherche nennt langjaehrige Erfahrung im Bau- und Immobilienumfeld; daran knuepfen wir mit frueher, belastbarer Planung an.";
    }
  }
  const yearsMatch = research.match(/(\d{2,})\s*(?:jahre|years|Р»РµС‚)/i);
  if (yearsMatch) {
    return "Die Recherche zeigt langjaehrige Erfahrung im Projekt- und Bauumfeld; daran knuepfen wir mit belastbarer frueher Planung an.";
  }
  return "";
}

function extractLocationFact(research: string, target: OutreachDraftTarget) {
  const location = compactText(target.city) || compactText(target.country);
  if (location) {
    return `Fuer Projekte mit Bezug zu ${location} kann eine sauber vorbereitete LP 1-4 die naechsten Entscheidungen entlasten.`;
  }
  const cityMatch = research.match(/\b(Muenchen|Munich|Berlin|Hamburg|Frankfurt|Stuttgart|Koeln|Duesseldorf|Leipzig|Dresden|Nuernberg|Augsburg)\b/i);
  if (cityMatch?.[1]) {
    return `Fuer Projekte mit Bezug zu ${cityMatch[1]} kann eine sauber vorbereitete LP 1-4 die naechsten Entscheidungen entlasten.`;
  }
  return "";
}

function extractProjectFact(research: string) {
  const normalized = research.toLocaleLowerCase();
  if (/bautraeger|developer|development|projektentwick/i.test(research)) {
    return "Der Research-Kontext passt zu Bautraeger- und Projektentwicklungsaufgaben, bei denen fruehe Varianten und Genehmigungsgrundlagen entscheidend sind.";
  }
  if (/wohn|residential|mehrfamilien|apartment|housing/i.test(research)) {
    return "Der Research-Kontext verweist auf Wohnungsbau; gerade dort helfen klare Flaechen, Varianten und Genehmigungsgrundlagen frueh im Prozess.";
  }
  if (/office|buero|gewerbe|commercial/i.test(research)) {
    return "Der Research-Kontext verweist auf gewerbliche Projekte; dafuer kann eine klare fruehe Planung die Abstimmung und Genehmigung strukturieren.";
  }
  if (normalized.includes("architecture") || normalized.includes("architektur")) {
    return "Der Research-Kontext zeigt Beruehrungspunkte mit Planung und Bau; unser Ansatz bleibt deshalb konkret bei LP 1-4 und belastbaren Entscheidungsgrundlagen.";
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
  return normalizeAsciiGerman(sentence.replace(/^[+-]\s*/, ""));
}

function personaHookFromResearch(campaign: OutreachCampaignSettings, target: OutreachDraftTarget) {
  const prompt = campaign.prompt ?? "";
  const research = compactText(target.notesResearch);
  const noPraise = forbidsPraise(prompt);
  if (!research) {
    return "Ich habe mir den Kontakt kurz angesehen und sehe moeglichen Bedarf fuer externe Unterstuetzung in fruehen Planungsphasen.";
  }

  const facts = [extractExperienceFact(research), extractLocationFact(research, target), extractProjectFact(research)].filter(Boolean).slice(0, 2);
  if (facts.length > 0) {
    return facts.join(" ");
  }

  const safeSentence = safeResearchSentence(research, noPraise);
  if (safeSentence) {
    return `Aus der Recherche nehme ich vor allem diesen Anknuepfungspunkt mit: ${safeSentence}`;
  }

  return "Aus den Research-Notizen ergibt sich ein moeglicher Bezug zu fruehen Projektphasen; deshalb halte ich einen kurzen fachlichen Abgleich fuer sinnvoll.";
}

function fillTemplate(value: string, replacements: Record<string, string>) {
  return value.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (match, key: string) => replacements[key] || match);
}

export function draftForCampaign(
  campaign: OutreachCampaignSettings,
  coldTarget: OutreachDraftTarget,
  touch: Pick<OutreachCampaignTouchpoint, "templateId" | "action" | "channel">
): OutreachDraft {
  const promptApplied = Boolean(compactText(campaign.prompt));
  const template = campaign.templates.find((item) => item.id === touch.templateId);
  const salutation = companySalutation(coldTarget);
  const personaHook = personaHookFromResearch(campaign, coldTarget);
  if (!template) {
    return {
      subject: "",
      body: `Manual action: prepare ${campaign.name} touch for ${salutation}.\n\nPersona hook: ${personaHook}`,
      salutation,
      personaHook,
      promptApplied
    };
  }
  const replacements = {
    salutation,
    persona_hook: hasGermanBusinessTone(campaign.prompt) ? personaHook : normalizeAsciiGerman(personaHook)
  };
  return {
    subject: normalizeAsciiGerman(fillTemplate(template.subject, replacements)),
    body: normalizeAsciiGerman(fillTemplate(template.body, replacements)),
    salutation,
    personaHook,
    promptApplied
  };
}
