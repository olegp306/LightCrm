import { describe, expect, it } from "vitest";
import { getCrmRuntimeSettings, updateCrmRuntimeSettings } from "../settings/crm-settings-store";
import { draftForCampaign } from "./draft-generator";

describe("draftForCampaign", () => {
  it("uses the campaign prompt across the full cadence and does not copy Russian research notes into German email drafts", async () => {
    const settings = await getCrmRuntimeSettings();
    const campaign = settings.outreachCampaigns.campaigns[0]!;
    const target = {
      name: "Mobiler Schambau",
      company: "Mobiler Schambau",
      notesResearch: "30+5 лет опыта. Заметка на русском, не вставлять как есть."
    };

    const drafts = campaign.touchpoints.map((touch) => ({ touch, draft: draftForCampaign(campaign, target, touch) }));
    const emailDrafts = drafts.filter(({ touch }) => touch.channel === "email");

    expect(drafts).toHaveLength(8);
    expect(emailDrafts.length).toBeGreaterThan(1);
    for (const { draft } of emailDrafts) {
      expect(draft.promptApplied).toBe(true);
      expect(draft.body).toContain("Guten Tag zusammen");
      expect(draft.body).not.toMatch(/[А-Яа-я]/);
      expect(draft.body).not.toContain("30+5");
      expect(draft.body).not.toContain("Guten Tag Mobiler Schambau");
    }
    expect(emailDrafts[0]?.draft.body).toContain("langjährige Erfahrung");
  });

  it("preserves German UTF-8 characters from metaprompt templates and configured signatures", () => {
    const campaign = {
      id: "utf8-campaign",
      name: "UTF-8 campaign",
      status: "active" as const,
      goal: "Preserve German text.",
      summary: "One touch.",
      prompt: "Deutsch, German business Sie tone.",
      touchpoints: [
        {
          id: "touch-1",
          touchNumber: 1,
          dayOffset: 0,
          channel: "email" as const,
          title: "Intro",
          action: "Send intro.",
          templateId: "t1"
        }
      ],
      templates: [
        {
          id: "t1",
          subject: "Architektenplanung für frühe Projektphasen",
          body:
            "Guten Tag {{salutation}},\n\n{{persona_hook}}\n\nWir prüfen Flächen, Gebäudegröße und mögliche Unterstützung."
        }
      ]
    };
    const target = {
      name: "Müller Bau",
      company: "Müller Bau",
      notesResearch: "Wohnungsbau in München mit früher Projektphase.",
      city: "München"
    };

    const draft = draftForCampaign(campaign, target, campaign.touchpoints[0]!, "Mit freundlichen Grüßen\nEkaterina Reyzbikh");

    expect(draft.subject).toContain("für frühe");
    expect(draft.body).toContain("Guten Tag zusammen");
    expect(draft.body).toContain("Für Projekte mit Bezug zu München");
    expect(draft.body).toContain("Flächen");
    expect(draft.body).toContain("Grüßen");
    expect(draft.body).not.toContain("fuer");
    expect(draft.body).not.toContain("Flaechen");
  });

  it("normalizes German ASCII transliteration before returning the final email", () => {
    const campaign = {
      id: "ascii-campaign",
      name: "ASCII campaign",
      status: "active" as const,
      goal: "Use German orthography.",
      summary: "One touch.",
      prompt: "Deutsch, German business Sie tone. No praise.",
      touchpoints: [
        {
          id: "touch-1",
          touchNumber: 1,
          dayOffset: 0,
          channel: "email" as const,
          title: "Intro",
          action: "Send intro.",
          templateId: "t1"
        }
      ],
      templates: [
        {
          id: "t1",
          subject: "Architektenplanung fuer Bautraegerprojekte",
          body:
            "Guten Tag {{salutation}},\n\n{{persona_hook}}\n\nWir unterstuetzen Bautraeger fuer fruehe Projektphasen. Waere ein kurzer Austausch in den naechsten Tagen moeglich?"
        }
      ]
    };
    const target = {
      name: "Hausbauhaus GmbH",
      company: "Hausbauhaus GmbH",
      notesResearch: "Bauträger mit Fokus auf Wohnbau und frühe Projektentwicklung."
    };

    const draft = draftForCampaign(campaign, target, campaign.touchpoints[0]!, "Mit freundlichen Grüßen\nEkaterina Reyzbikh");

    expect(draft.subject).toBe("Architektenplanung für Bauträgerprojekte");
    expect(draft.body).toContain("Wir unterstützen Bauträger für frühe Projektphasen.");
    expect(draft.body).toContain("Wäre ein kurzer Austausch in den nächsten Tagen möglich?");
    expect(draft.body).toContain("Mit freundlichen Grüßen");
    expect(draft.body).not.toMatch(/\b(fuer|Bautraeger|unterstuetzen|fruehe|Waere|naechsten|moeglich)\b/);
  });

  it("keeps persona hooks client-facing and avoids internal research wording", async () => {
    const settings = await getCrmRuntimeSettings();
    const campaign = settings.outreachCampaigns.campaigns[0]!;
    const target = {
      name: "Philipp Bürstlinger",
      company: "Projektbau Chiemgau GmbH",
      notesResearch:
        "Инженерно-строительный партнёр. Полный цикл: проектирование, управление, экспертиза, оценка. Делают и новое, и реставрацию исторических объектов. Идеальный профиль: им нужен архитектор-партнёр."
    };

    const draft = draftForCampaign(campaign, target, campaign.touchpoints[0]!);

    expect(draft.personaHook).not.toMatch(/Research|Notizen|Kontext/i);
    expect(draft.body).not.toMatch(/Research|Notizen|Kontext/i);
    expect(draft.body).not.toMatch(/[А-Яа-я]/);
    expect(draft.personaHook).toMatch(/Projekt|Planung|Bau|Architekt/i);
  });

  it("keeps the configured default email signature available when stored settings predate signatures", async () => {
    const settings = await getCrmRuntimeSettings();

    expect(settings.outreachCampaigns.emailSignature).toContain("Mit freundlichen Grüßen");
    expect(settings.outreachCampaigns.emailSignature).toContain("Ekaterina Reyzbikh");
  });

  it("restores the default email signature from stale in-memory outreach settings", async () => {
    const original = await getCrmRuntimeSettings();
    try {
      await updateCrmRuntimeSettings({
        ...original,
        outreachCampaigns: {
          campaigns: original.outreachCampaigns.campaigns
        } as typeof original.outreachCampaigns
      });

      const settings = await getCrmRuntimeSettings();

      expect(settings.outreachCampaigns.emailSignature).toContain("Mit freundlichen Grüßen");
      expect(settings.outreachCampaigns.emailSignature).toContain("Ekaterina Reyzbikh");
    } finally {
      await updateCrmRuntimeSettings(original);
    }
  });

  it("detects Russian and English outreach languages from the cold target and supports explicit overrides", () => {
    const campaign = {
      id: "language-campaign",
      name: "Language campaign",
      status: "active" as const,
      goal: "Choose language.",
      summary: "One touch.",
      prompt: "Choose the target language from the cold target unless a preferred language is set.",
      touchpoints: [
        {
          id: "touch-1",
          touchNumber: 1,
          dayOffset: 0,
          channel: "email" as const,
          title: "Intro",
          action: "Send intro.",
          templateId: "t1"
        }
      ],
      templates: [
        {
          id: "t1",
          subject: "Architektenplanung fuer Bautraegerprojekte",
          body:
            "Guten Tag {{salutation}},\n\n{{persona_hook}}\n\nWir unterstuetzen Bautraeger fuer fruehe Projektphasen."
        }
      ]
    };

    const russianDraft = draftForCampaign(
      campaign,
      {
        name: "Иван Петров",
        company: "Петров Девелопмент",
        notesResearch: "Русский девелопер жилых проектов. Нужна архитектурная поддержка на ранних стадиях."
      },
      campaign.touchpoints[0]!
    );
    const englishDraft = draftForCampaign(
      campaign,
      {
        name: "John Smith",
        company: "Northwind Development",
        notesResearch: "Residential developer in London with early-stage planning needs."
      },
      campaign.touchpoints[0]!
    );
    const overrideDraft = draftForCampaign(
      campaign,
      {
        name: "Иван Петров",
        company: "Петров Девелопмент",
        preferredLanguage: "de",
        notesResearch: "Русский девелопер жилых проектов."
      },
      campaign.touchpoints[0]!
    );

    expect(russianDraft.subject).toContain("Архитектурное планирование");
    expect(russianDraft.body).toContain("Здравствуйте");
    expect(russianDraft.body).toContain("ранних стадиях");
    expect(englishDraft.subject).toContain("Architectural planning");
    expect(englishDraft.body).toContain("Hello");
    expect(englishDraft.body).toContain("early project phases");
    expect(overrideDraft.subject).toContain("Architektenplanung");
    expect(overrideDraft.body).toContain("Guten Tag");
  });
});
