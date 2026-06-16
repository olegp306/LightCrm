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

function compactLines(lines: Array<string | null | undefined>, maxLength: number): string {
  const cleanLines = lines
    .map((line) => line?.replace(/\s+/g, " ").trim())
    .filter((line): line is string => Boolean(line));
  const result: string[] = [];
  for (const line of cleanLines) {
    const next = [...result, line].join("\n");
    if (next.length > maxLength) {
      break;
    }
    result.push(line);
  }
  return result.length > 0 ? result.join("\n") : compactText(cleanLines.join(" "), maxLength);
}

const leadSummaryShortMax = 260;
const leadSummaryLongMax = 900;

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

function displaySourceChannel(value: string | null | undefined): string {
  return value?.toLocaleLowerCase() === "telegram" ? "TG" : value ?? "intake";
}

function cleanIntakeText(value: string): string {
  return value
    .replace(/^Source:\s*TG(?:\s+thread\s+\S+)?\.\s*/i, "")
    .replace(/^Source:\s*[^.]+\.\s*/i, "")
    .replace(/^Text:\s*/i, "")
    .replace(/\s*Files:\s*no attachments\.?$/i, "")
    .trim();
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
      `${attachmentKindLabel(attachment.kind)} file "${attachment.fileName}" received from ${displaySourceChannel(sourceChannel)}.`,
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
  const text = cleanIntakeText(textItems
    .map((item) => item.text.trim())
    .filter(Boolean)
    .join(" "));
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
  const source = displaySourceChannel(input.sourceChannel);
  const clientIntent = text || (attachments.length > 0 ? "Review incoming files and extract lead details." : "Lead intake received.");
  const documentSummary =
    attachments.length > 0
      ? `${attachments.length} document(s)${kindList.length > 0 ? ` [${kindList.join(", ")}]` : ""}: ${attachmentSummaries.map((attachment) => `${attachment.kind} - ${attachment.shortSummary}`).join("; ")}`
      : null;
  const shortSummary = compactText(
    [
      `${source}: ${compactText(clientIntent, 190)}`,
      documentSummary ? compactText(documentSummary, 80) : null
    ]
      .filter(Boolean)
      .join(" "),
    leadSummaryShortMax
  );
  const longSummary = compactLines(
    [
      `${source}: ${clientIntent}`,
      documentSummary ? `Documents: ${documentSummary}` : null,
      text ? `Copy: "${compactText(text, 260)}"` : null,
      attachmentSummaries.length > 0
        ? `Document notes: ${attachmentSummaries.map((attachment) => `"${attachment.shortSummary}"`).join("; ")}`
        : null
    ],
    leadSummaryLongMax
  );

  return {
    shortSummary,
    longSummary,
    originalTakes,
    attachments: attachmentSummaries,
    missingSignals
  };
}
