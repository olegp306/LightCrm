import type { OutreachCampaignSettings, OutreachCampaignTouchpoint } from "../settings/crm-settings-store";

export type OutreachDraftTarget = {
  name: string;
  company: string | null;
  role?: string | null;
  notesResearch: string | null;
  preferredLanguage?: string | null;
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

type OutreachLanguage = "de" | "ru" | "en";

function compactText(value: string | null | undefined) {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function hasCyrillic(value: string) {
  return /[\u0400-\u04ff]/.test(value);
}

function detectOutreachLanguage(target: OutreachDraftTarget): OutreachLanguage {
  if (target.preferredLanguage === "de" || target.preferredLanguage === "ru" || target.preferredLanguage === "en") {
    return target.preferredLanguage;
  }
  const contactText = [target.name, target.company, target.role, target.city, target.country].map(compactText).join(" ");
  const research = compactText(target.notesResearch);
  if (hasCyrillic(contactText)) {
    return "ru";
  }
  if (/\b(London|United Kingdom|UK|USA|United States|English)\b/i.test(contactText)) {
    return "en";
  }
  if (/\b(Germany|Deutschland|Deutsch|Bayern|Munich|München|Chiemgau|Bauträger|Bautraeger|GmbH)\b/i.test(contactText)) {
    return "de";
  }
  if (!contactText && hasCyrillic(research)) {
    return "ru";
  }
  if (/\b(developer|residential|planning|architecture|London|United Kingdom|UK|USA|United States)\b/i.test(research)) {
    return "en";
  }
  return "de";
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
  const normalized = value
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
  const replacements: Array<[RegExp, string | ((match: string) => string)]> = [
    [/\bfuer\b/g, "für"],
    [/\bFuer\b/g, "Für"],
    [/\bfrueh(e[nsrm]?)?\b/g, (match: string) => match.replace("frue", "frü")],
    [/\bFrueh(e[nsrm]?)?\b/g, (match: string) => match.replace("Frue", "Frü")],
    [/Bautraeger/g, "Bauträger"],
    [/\bUnterstuetzung\b/g, "Unterstützung"],
    [/\bunterstuetzung\b/g, "unterstützung"],
    [/\bunterstuetzen\b/g, "unterstützen"],
    [/\bunterstuetzt\b/g, "unterstützt"],
    [/Kapazitaet/g, "Kapazität"],
    [/kapazitaet/g, "kapazität"],
    [/\bWaere\b/g, "Wäre"],
    [/\bwaere\b/g, "wäre"],
    [/\bnaechst(e[nsrm]?)?\b/g, (match: string) => match.replace("naech", "näch")],
    [/\bNaechst(e[nsrm]?)?\b/g, (match: string) => match.replace("Naech", "Näch")],
    [/\bmoeglich(e[nsrm]?)?\b/g, (match: string) => match.replace("moeg", "mög")],
    [/\bMoeglich(e[nsrm]?)?\b/g, (match: string) => match.replace("Moeg", "Mög")],
    [/\bmoechte(n|st|t)?\b/g, (match: string) => match.replace("moech", "möch")],
    [/\bMoechte(n|st|t)?\b/g, (match: string) => match.replace("Moech", "Möch")],
    [/\bgrundsaetzlich\b/g, "grundsätzlich"],
    [/\bpruefen\b/g, "prüfen"],
    [/\bPruefen\b/g, "Prüfen"],
    [/\bFlaechen\b/g, "Flächen"],
    [/\bflaechen\b/g, "flächen"],
    [/\bkoennen\b/g, "können"],
    [/\bKoennen\b/g, "Können"],
    [/\bschliessen\b/g, "schließen"],
    [/\bSchliessen\b/g, "Schließen"],
    [/\bschliesse\b/g, "schließe"],
    [/\bSchliesse\b/g, "Schließe"],
    [/\bstoeren\b/g, "stören"],
    [/\bStoeren\b/g, "Stören"],
    [/\bspaeter\b/g, "später"],
    [/\bSpaeter\b/g, "Später"],
    [/\bkuenstlich\b/g, "künstlich"],
    [/\bRueckmeldung\b/g, "Rückmeldung"],
    [/\brueckmeldung\b/g, "rückmeldung"],
    [/\bBuer(o|os)\b/g, (match: string) => match.replace("Buer", "Bür")],
    [/\bbuer(o|os)\b/g, (match: string) => match.replace("buer", "bür")]
  ];
  return replacements.reduce(
    (current, [pattern, replacement]) =>
      typeof replacement === "function" ? current.replace(pattern, replacement) : current.replace(pattern, replacement),
    normalized
  );
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
      return "Ihre langjährige Erfahrung im Bau- und Immobilienumfeld macht eine belastbare frühe Planung besonders relevant.";
    }
  }
  const yearsMatch = research.match(/(\d{2,})\s*(?:jahre|years|Р В»Р ВµРЎвЂљ)/i);
  if (yearsMatch) {
    return "Ihre langjährige Erfahrung im Projekt- und Bauumfeld ist ein guter Anknüpfungspunkt für belastbare frühe Planung.";
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
    return "Ihre Arbeit passt zu Bauträger- und Projektentwicklungsaufgaben, bei denen frühe Varianten und Genehmigungsgrundlagen entscheidend sind.";
  }
  if (/wohn|residential|mehrfamilien|apartment|housing/i.test(research)) {
    return "Bei Wohnungsbauprojekten helfen klare Flächen, Varianten und Genehmigungsgrundlagen früh im Prozess.";
  }
  if (/office|buero|b\u00fcro|gewerbe|commercial/i.test(research)) {
    return "Bei gewerblichen Projekten kann klare frühe Planung die Abstimmung und Genehmigung strukturieren.";
  }
  if (normalized.includes("architecture") || normalized.includes("architektur")) {
    return "Ihre Arbeit hat erkennbare Berührungspunkte mit Planung und Bau; unser Ansatz bleibt deshalb konkret bei LP 1-4 und belastbaren Entscheidungsgrundlagen.";
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
    return `Ein fachlicher Anknüpfungspunkt ist für mich: ${safeSentence}`;
  }

  return "Die Angaben zum Kontakt deuten auf Planungs- und Bauaufgaben in frühen Projektphasen hin; ein kurzer fachlicher Abgleich kann klären, ob externe LP 1-4-Unterstützung sinnvoll ist.";
}

function personaHookForLanguage(campaign: OutreachCampaignSettings, target: OutreachDraftTarget, language: OutreachLanguage) {
  if (language === "de") {
    return normalizeGermanText(personaHookFromResearch(campaign, target));
  }
  const research = compactText(target.notesResearch);
  const company = compactText(target.company) || compactText(target.name);
  if (language === "ru") {
    if (/девелоп|застрой|жил|проект|архитект/i.test(research)) {
      return `${company ? `${company} работает с девелопментом, жилыми проектами или ранними стадиями планирования. ` : ""}На таких стадиях обычно особенно важны понятные варианты, площади и подготовка к согласованию.`;
    }
    return "По данным контакта видна возможная связь с проектированием и ранними стадиями проекта; короткий профессиональный разговор поможет понять, нужна ли внешняя поддержка по LP 1-4.";
  }
  if (/developer|residential|planning|architecture|project/i.test(research)) {
    return `${company ? `${company} appears to work in development, residential projects, or early-stage planning. ` : ""}At that stage, clear options, areas, and approval-ready documentation can make decisions easier.`;
  }
  return "The contact data suggests a possible link to planning or early project phases; a short professional check-in could clarify whether external LP 1-4 support is useful.";
}

function translatedDraft(
  campaign: OutreachCampaignSettings,
  coldTarget: OutreachDraftTarget,
  language: Exclude<OutreachLanguage, "de">,
  emailSignature?: string | null
): OutreachDraft {
  const promptApplied = Boolean(compactText(campaign.prompt));
  const salutation = companySalutation(coldTarget);
  const personaHook = personaHookForLanguage(campaign, coldTarget, language);
  if (language === "ru") {
    return {
      subject: "Архитектурное планирование для ранних стадий проекта",
      body: appendSignature(
        [
          `Здравствуйте${salutation === "zusammen" ? "" : `, ${salutation}`},`,
          "",
          personaHook,
          "",
          "Мы можем поддержать девелоперские и строительные проекты как внешний архитектурный партнер на ранних стадиях: варианты, площади, концепция и подготовка к согласованию.",
          "",
          "Будет ли вам удобно коротко обсудить, может ли такая поддержка быть полезна для текущих или будущих проектов?"
        ].join("\n"),
        emailSignature
      ),
      salutation,
      personaHook,
      promptApplied
    };
  }
  return {
    subject: "Architectural planning for early project phases",
    body: appendSignature(
      [
        `Hello${salutation === "zusammen" ? "" : ` ${salutation}`},`,
        "",
        personaHook,
        "",
        "We support developers and construction teams as an external architectural planning partner for early project phases: options, areas, concept work, and approval-ready documentation.",
        "",
        "Would a short conversation in the next few days be useful to see whether this could fit current or upcoming projects?"
      ].join("\n"),
      emailSignature
    ),
    salutation,
    personaHook,
    promptApplied
  };
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
  const language = detectOutreachLanguage(coldTarget);
  if (language !== "de") {
    return translatedDraft(campaign, coldTarget, language, emailSignature);
  }
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
