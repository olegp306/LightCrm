import { describe, expect, it } from "vitest";
import { autosaveLabelForDraft, shouldSaveOutreachDraft } from "./outreach-draft-autosave";

describe("outreach draft autosave", () => {
  it("shows the visible autosave state for edited cold target drafts", () => {
    expect(autosaveLabelForDraft({ saving: false, dirty: true, error: null, message: null })).toEqual({
      label: "Auto-save",
      tone: "dirty"
    });
    expect(autosaveLabelForDraft({ saving: true, dirty: true, error: null, message: null })).toEqual({
      label: "Saving",
      tone: "saving"
    });
    expect(autosaveLabelForDraft({ saving: false, dirty: false, error: null, message: "Saved" })).toEqual({
      label: "Saved",
      tone: "saved"
    });
    expect(autosaveLabelForDraft({ saving: false, dirty: true, error: "Draft save failed.", message: null })).toEqual({
      label: "Save failed",
      tone: "error"
    });
  });

  it("saves only when subject or body changed from the last persisted draft", () => {
    expect(
      shouldSaveOutreachDraft({
        subject: "Hello",
        body: "Body",
        savedSubject: "Hello",
        savedBody: "Body"
      })
    ).toBe(false);

    expect(
      shouldSaveOutreachDraft({
        subject: "Hello again",
        body: "Body",
        savedSubject: "Hello",
        savedBody: "Body"
      })
    ).toBe(true);
  });
});
