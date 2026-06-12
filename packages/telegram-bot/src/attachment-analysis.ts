import type { LeadIntakeAttachmentInput } from "@lightcrm/core";
import type { TelegramAttachment } from "./bot-core";

export type TelegramAttachmentAnalysisInput = {
  attachment: TelegramAttachment;
  bytes: Uint8Array;
  text?: string | null;
  author?: string | null;
  apiKey?: string | null;
  model: string;
  fetchImpl?: typeof fetch;
};

type OpenAiVisionPayload = {
  error?: { message?: string };
  choices?: Array<{ message?: { content?: string } }>;
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

export async function analyzeTelegramAttachment(
  input: TelegramAttachmentAnalysisInput
): Promise<Pick<LeadIntakeAttachmentInput, "summary" | "longSummary"> | null> {
  if (input.attachment.kind !== "image" || !input.apiKey) {
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
          content:
            "You analyze Telegram intake images for an architecture CRM. Extract business facts, visible text, client intent, project type, location, areas, budget/prices, contacts, and missing information for a commercial offer. Return strict JSON with shortSummary and longSummary strings."
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: [
                `Telegram file: ${input.attachment.fileName}`,
                input.author ? `Sender/forwarder: ${input.author}` : null,
                input.text?.trim() ? `Caption/context: ${input.text.trim()}` : null,
                "Summarize in English or Russian using the image language where useful. Keep numeric values exact."
              ]
                .filter((line): line is string => Boolean(line))
                .join("\n")
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
