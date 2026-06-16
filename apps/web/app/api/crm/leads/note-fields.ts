export const leadNoteFields = {
  project: "Lead name",
  area: "Area",
  description: "Description",
  interest: "Interest",
  urgency: "Urgency",
  todo: "Todo",
  ballSide: "Ball side",
  address: "Address",
  clientProjects: "Client projects",
  budgetEur: "Budget EUR",
  rawInput: "Raw input"
} as const;

export const tabularLeadNoteFields = {
  projectName: "Lead name",
  project: "Lead name",
  area: "Area",
  description: "Description",
  interest: "Interest",
  urgency: "Urgency",
  todo: "Todo",
  ballSide: "Ball side",
  address: "Address",
  clientProjects: "Client projects",
  budgetEur: "Budget EUR",
  rawInput: "Raw input"
} as const;

const legacyNoteFieldLabels: Record<string, string[]> = {
  "Lead name": ["Project"]
};

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function readNoteField(notes: string | null, label: string): string | null {
  if (!notes) {
    return null;
  }
  for (const candidate of [label, ...(legacyNoteFieldLabels[label] ?? [])]) {
    const escaped = escapeRegex(candidate);
    const match = notes.match(new RegExp(`(?:^|\\n+)${escaped}: ([\\s\\S]*?)(?=\\n+(?:[A-Z][A-Za-z0-9 ]+: |Updated from )|$)`));
    const value = match?.[1]?.trim();
    if (value) {
      return value;
    }
  }
  return null;
}

export function replaceNoteField(notes: string | null | undefined, label: string, value: string | null | undefined): string | null {
  const currentNotes = notes ?? "";
  const labels = [label, ...(legacyNoteFieldLabels[label] ?? [])];
  const escaped = labels.map(escapeRegex).join("|");
  const fieldPattern = new RegExp(`(^|\\n\\n+)(?:${escaped}): [\\s\\S]*?(?=\\n\\n+(?:[A-Z][A-Za-z0-9 ]+: |Updated from )|$)`);
  const normalizedValue = typeof value === "string" ? value.trim() : value;
  const nextBlock = normalizedValue ? `${label}: ${normalizedValue}` : "";
  const nextNotes = fieldPattern.test(currentNotes)
    ? currentNotes.replace(fieldPattern, nextBlock ? `$1${nextBlock}` : "")
    : [currentNotes.trim(), nextBlock].filter(Boolean).join("\n\n");
  return nextNotes
    .split(/\n\n+/)
    .map((block) => block.trim())
    .filter(Boolean)
    .join("\n\n") || null;
}

export function notesWithTabularPatch<TPatch extends Record<string, unknown>>(
  notes: string | null | undefined,
  patch: TPatch
): string | null | undefined {
  let nextNotes = patch.notes === undefined ? notes : typeof patch.notes === "string" || patch.notes === null ? patch.notes : notes;
  for (const [key, label] of Object.entries(tabularLeadNoteFields)) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) {
      const value = patch[key];
      nextNotes = replaceNoteField(nextNotes, label, typeof value === "string" || value === null ? value : undefined);
    }
  }
  return nextNotes;
}
