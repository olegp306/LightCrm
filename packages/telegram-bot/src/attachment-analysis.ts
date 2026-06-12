import type { LeadIntakeAttachmentInput } from "@lightcrm/core";
import { PDFParse } from "pdf-parse";
import type { TelegramAttachment } from "./bot-core";

export type TelegramAttachmentAnalysisInput = {
  attachment: TelegramAttachment;
  bytes: Uint8Array;
  text?: string | null;
  author?: string | null;
  apiKey?: string | null;
  model: string;
  audioModel?: string;
  fetchImpl?: typeof fetch;
  pdfTextExtractor?: (bytes: Uint8Array) => Promise<string | null>;
};

type OpenAiVisionPayload = {
  error?: { message?: string };
  choices?: Array<{ message?: { content?: string } }>;
};

type OpenAiTranscriptionPayload = {
  error?: { message?: string };
  text?: string;
};

function compactText(value: string, maxLength: number): string {
  const compacted = value.replace(/\s+/g, " ").trim();
  if (compacted.length <= maxLength) {
    return compacted;
  }
  return `${compacted.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseAnalysis(value: unknown): Pick<LeadIntakeAttachmentInput, "summary" | "longSummary"> | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  const summary = readString(record.shortSummary) ?? readString(record.summary);
  const longSummary = readString(record.longSummary) ?? readString(record.details);
  if (!summary && !longSummary) {
    return null;
  }
  return {
    summary: summary ? compactText(summary, 420) : null,
    longSummary: longSummary ? compactText(longSummary, 1800) : null
  };
}

async function readOpenAiPayload(response: Response): Promise<OpenAiVisionPayload | undefined> {
  try {
    return (await response.json()) as OpenAiVisionPayload;
  } catch {
    return undefined;
  }
}

async function readOpenAiTranscriptionPayload(response: Response): Promise<OpenAiTranscriptionPayload | undefined> {
  try {
    return (await response.json()) as OpenAiTranscriptionPayload;
  } catch {
    return undefined;
  }
}

function analysisSystemPrompt(kind: TelegramAttachment["kind"]): string {
  return `You analyze Telegram intake ${kind} files for an architecture CRM. Extract business facts, visible or spoken text, client intent, project type, location, areas, budget/prices, contacts, deadlines, and missing information for a commercial offer. Return strict JSON with shortSummary and longSummary strings.`;
}

function attachmentContext(input: TelegramAttachmentAnalysisInput): string {
  return [
    `Telegram file: ${input.attachment.fileName}`,
    `Attachment kind: ${input.attachment.kind}`,
    input.author ? `Sender/forwarder: ${input.author}` : null,
    input.text?.trim() ? `Caption/context: ${input.text.trim()}` : null,
    "Summarize in English or Russian using the source language where useful. Keep numeric values exact."
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

async function summarizeTextContent(
  input: TelegramAttachmentAnalysisInput,
  contentLabel: string,
  content: string
): Promise<Pick<LeadIntakeAttachmentInput, "summary" | "longSummary"> | null> {
  const trimmed = content.replace(/\s+/g, " ").trim();
  if (!trimmed || !input.apiKey) {
    return null;
  }
  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: input.model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: analysisSystemPrompt(input.attachment.kind)
        },
        {
          role: "user",
          content: [
            attachmentContext(input),
            "",
            `${contentLabel}:`,
            compactText(trimmed, 12000)
          ].join("\n")
        }
      ]
    })
  });

  const payload = await readOpenAiPayload(response);
  if (!response.ok) {
    throw new Error(payload?.error?.message ?? "OpenAI attachment text analysis failed.");
  }
  const responseContent = payload?.choices?.[0]?.message?.content;
  if (!responseContent) {
    return null;
  }
  try {
    return parseAnalysis(JSON.parse(responseContent));
  } catch {
    return null;
  }
}

async function extractPdfText(bytes: Uint8Array): Promise<string | null> {
  const parser = new PDFParse({ data: bytes });
  try {
    const result = await parser.getText();
    return result.text?.trim() || null;
  } finally {
    await parser.destroy();
  }
}

async function transcribeAudio(input: TelegramAttachmentAnalysisInput): Promise<string | null> {
  if (!input.apiKey) {
    return null;
  }
  const fetchImpl = input.fetchImpl ?? fetch;
  const mimeType = input.attachment.mimeType ?? "application/octet-stream";
  const fileName =
    mimeType === "audio/mp4" && input.attachment.fileName.toLowerCase().endsWith(".mp4")
      ? input.attachment.fileName.replace(/\.mp4$/i, ".m4a")
      : input.attachment.fileName;
  const form = new FormData();
  form.set("model", input.audioModel ?? "whisper-1");
  form.set("file", new File([Buffer.from(input.bytes)], fileName, { type: mimeType }));
  const response = await fetchImpl("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`
    },
    body: form
  });
  const payload = await readOpenAiTranscriptionPayload(response);
  if (!response.ok) {
    throw new Error(payload?.error?.message ?? "OpenAI audio transcription failed.");
  }
  return payload?.text?.trim() || null;
}

function isTextLikeDocument(attachment: TelegramAttachment): boolean {
  const mimeType = attachment.mimeType?.toLowerCase() ?? "";
  const fileName = attachment.fileName.toLowerCase();
  return (
    mimeType.startsWith("text/") ||
    mimeType.includes("json") ||
    mimeType.includes("csv") ||
    /\.(txt|csv|json|md)$/i.test(fileName)
  );
}

export async function analyzeTelegramAttachment(
  input: TelegramAttachmentAnalysisInput
): Promise<Pick<LeadIntakeAttachmentInput, "summary" | "longSummary"> | null> {
  if (!input.apiKey) {
    return null;
  }
  if (input.attachment.kind === "pdf") {
    const text = await (input.pdfTextExtractor ?? extractPdfText)(input.bytes);
    return summarizeTextContent(input, "Extracted PDF text", text ?? "");
  }
  if (input.attachment.kind === "audio" || input.attachment.kind === "voice") {
    const transcript = await transcribeAudio(input);
    return summarizeTextContent(input, "Audio transcript", transcript ?? "");
  }
  if (input.attachment.kind === "document" && isTextLikeDocument(input.attachment)) {
    const text = new TextDecoder("utf-8", { fatal: false }).decode(input.bytes);
    return summarizeTextContent(input, "Document text", text);
  }
  if (input.attachment.kind !== "image") {
    return null;
  }
  const mimeType = input.attachment.mimeType ?? "image/jpeg";
  const dataUrl = `data:${mimeType};base64,${Buffer.from(input.bytes).toString("base64")}`;
  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: input.model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: analysisSystemPrompt(input.attachment.kind)
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: attachmentContext(input)
            },
            { type: "image_url", image_url: { url: dataUrl, detail: "high" } }
          ]
        }
      ]
    })
  });

  const payload = await readOpenAiPayload(response);
  if (!response.ok) {
    throw new Error(payload?.error?.message ?? "OpenAI attachment analysis failed.");
  }
  const content = payload?.choices?.[0]?.message?.content;
  if (!content) {
    return null;
  }
  try {
    return parseAnalysis(JSON.parse(content));
  } catch {
    return null;
  }
}
