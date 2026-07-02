export type OutreachDraftAutosaveTone = "idle" | "dirty" | "saving" | "saved" | "error";

export type OutreachDraftAutosaveState = {
  saving?: boolean;
  dirty?: boolean;
  error?: string | null;
  message?: string | null;
};

export type OutreachDraftAutosaveCandidate = {
  subject: string;
  body: string;
  savedSubject?: string | null;
  savedBody?: string | null;
};

export function autosaveLabelForDraft(state: OutreachDraftAutosaveState): { label: string; tone: OutreachDraftAutosaveTone } {
  if (state.error) {
    return { label: "Save failed", tone: "error" };
  }
  if (state.saving) {
    return { label: "Saving", tone: "saving" };
  }
  if (state.dirty) {
    return { label: "Auto-save", tone: "dirty" };
  }
  if (state.message) {
    return { label: state.message, tone: "saved" };
  }
  return { label: "Auto-save", tone: "idle" };
}

export function shouldSaveOutreachDraft(candidate: OutreachDraftAutosaveCandidate) {
  return candidate.subject !== (candidate.savedSubject ?? "") || candidate.body !== (candidate.savedBody ?? "");
}
