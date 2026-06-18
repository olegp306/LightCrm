import { describe, expect, it } from "vitest";
import { getCrmRuntimeSettings } from "../settings/crm-settings-store";
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
});
