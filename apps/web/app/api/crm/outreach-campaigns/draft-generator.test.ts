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
    expect(emailDrafts[0]?.draft.body).toContain("langjaehrige Erfahrung");
  });
});
