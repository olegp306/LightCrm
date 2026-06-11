import type { IngestLeadIntakeInput, LeadIntakeAttachmentInput } from "@lightcrm/core";

export type IntakeAttachmentSummary = {
  sourceMessageId: string | null;
  kind: LeadIntakeAttachmentInput["kind"];
  fileName: string;
  shortSummary: string;
  longSummary: string;
};

export type LeadIntakeSemanticSummary = {
  shortSummary: string;
  longSummary: string;
  originalTakes: string[];
  attachments: IntakeAttachmentSummary[];
  missingSignals: string[];
};

export type LeadIntakeAttachmentAnalysis = {
  shortSummary?: string | null;
  longSummary?: string | null;
};

export type LeadIntakeAnalyzer = {
  analyzeAttachment?: (
    attachment: LeadIntakeAttachmentInput,
    context: { input: IngestLeadIntakeInput; text: string }
  ) => LeadIntakeAttachmentAnalysis | null | undefined;
};

export type LeadIntakeSummaryOptions = {
  analyzer?: LeadIntakeAnalyzer;
};

function trimText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function compactText(value: string, maxLength = 240): string {
  const compacted = value.replace(/\s+/g, " ").trim();
  if (compacted.length <= maxLength) {
    return compacted;
  }
  return `${compacted.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
}

function attachmentKindLabel(kind: LeadIntakeAttachmentInput["kind"]): string {
  const labels: Record<LeadIntakeAttachmentInput["kind"], string> = {
    image: "Image",
    pdf: "PDF",
    audio: "Audio",
    voice: "Voice",
    document: "Document",
    other: "File"
  };
  return labels[kind];
}

function summarizeAttachment(
  attachment: LeadIntakeAttachmentInput,
  sourceChannel: string | null | undefined,
  analysis?: LeadIntakeAttachmentAnalysis | null
): IntakeAttachmentSummary {
  const providedSummary = trimText(analysis?.shortSummary) ?? trimText(attachment.summary);
  const shortSummary = providedSummary ?? `${attachmentKindLabel(attachment.kind)} attached to lead intake`;
  const longSummary =
    trimText(analysis?.longSummary) ??
    trimText(attachment.longSummary) ??
    [
      `${attachmentKindLabel(attachment.kind)} file "${attachment.fileName}" received from ${sourceChannel ?? "intake"}.`,
      attachment.mimeType ? `MIME type: ${attachment.mimeType}.` : null,
      attachment.sizeBytes !== null && attachment.sizeBytes !== undefined ? `Size: ${attachment.sizeBytes} bytes.` : null,
      providedSummary ? `Provided summary: ${providedSummary}.` : "No semantic file analysis is available yet."
    ]
      .filter((part): part is string => Boolean(part))
      .join(" ");

  return {
    sourceMessageId: attachment.sourceMessageId ?? null,
    kind: attachment.kind,
    fileName: attachment.fileName,
    shortSummary,
    longSummary
  };
}

export function summarizeLeadIntake(
  input: IngestLeadIntakeInput,
  options: LeadIntakeSummaryOptions = {}
): LeadIntakeSemanticSummary {
  const textItems = input.textItems ?? [];
  const attachments = input.attachments ?? [];
  const text = textItems
    .map((item) => item.text.trim())
    .filter(Boolean)
    .join(" ");
  const attachmentAnalyses = attachments.map((attachment) =>
    options.analyzer?.analyzeAttachment?.(attachment, { input, text }) ?? null
  );
  const attachmentSummaries = attachments.map((attachment, index) =>
    summarizeAttachment(attachment, input.sourceChannel, attachmentAnalyses[index])
  );
  const originalTakes = [
    ...textItems.map((item) => {
      const prefix = [item.author, item.sourceMessageId ? `#${item.sourceMessageId}` : null].filter(Boolean).join(" ");
      return prefix ? `${prefix}: ${item.text}` : item.text;
    }),
    ...attachmentSummaries.map((attachment) => {
      const source = attachment.sourceMessageId ? ` #${attachment.sourceMessageId}` : "";
      return `${attachment.kind}${source}: ${attachment.fileName} - ${attachment.shortSummary}`;
    })
  ].filter((take) => Boolean(trimText(take)));
  const missingSignals = [
    text ? null : "text",
    attachments.length > 0 ? null : "attachments",
    attachments.some((attachment, index) => {
      const analysis = attachmentAnalyses[index];
      return (
        trimText(attachment.summary) ||
        trimText(attachment.longSummary) ||
        trimText(analysis?.shortSummary) ||
        trimText(analysis?.longSummary)
      );
    })
      ? null
      : "file_semantics"
  ].filter((signal): signal is string => Boolean(signal));

  const kindList = [...new Set(attachments.map((attachment) => attachment.kind))];
  const shortSummary = [
    text ? compactText(text, 160) : "No text notes yet",
    attachments.length > 0
      ? `${attachments.length} file(s): ${attachments.map((attachment) => attachment.fileName).join(", ")}`
      : "no files"
  ].join("; ");
  const longSummary = [
    `Source: ${input.sourceChannel ?? "intake"}${input.sourceThreadId ? ` thread ${input.sourceThreadId}` : ""}.`,
    text ? `Text: ${compactText(text)}.` : "Text: no text notes yet.",
    attachments.length > 0
      ? `Files: ${attachments.length} attachment(s)${kindList.length > 0 ? ` [${kindList.join(", ")}]` : ""}: ${attachmentSummaries.map((attachment) => `${attachment.fileName} (${attachment.kind}; ${attachment.shortSummary})`).join("; ")}.`
      : "Files: no attachments."
  ].join(" ");

  return {
    shortSummary,
    longSummary,
    originalTakes,
    attachments: attachmentSummaries,
    missingSignals
  };
}
