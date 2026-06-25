import type { DocumentFile, LeadIntakeAttachmentInput } from "@lightcrm/core";
import { storeCrmFile } from "@lightcrm/storage";
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { defaultWorkspaceId, getCrm, handleRouteError } from "../../_shared";
import { extractDocxText } from "../../settings/crm-settings-store";
import { incomingCommercialOfferSummary, looksLikeCommercialOffer } from "../commercial-offer-documents";

type PdfParseConstructor = new (options: { data: Uint8Array }) => {
  destroy(): Promise<void> | void;
  getText(): Promise<{ text?: string | null }>;
};

type OpenAiTranscriptionPayload = {
  error?: { message?: string };
  text?: string;
};

type OpenAiChatPayload = {
  error?: { message?: string };
  choices?: Array<{ message?: { content?: string } }>;
};

const fileShortSummaryMax = 260;
const fileFullSummaryMax = 500;

function textField(form: FormData, name: string): string | null {
  const value = form.get(name);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function textFields(form: FormData, name: string): string[] {
  return form.getAll(name).map((value) => (typeof value === "string" ? value.trim() : ""));
}

function fileFields(form: FormData): File[] {
  const files = form.getAll("files").filter((value): value is File => value instanceof File);
  const fallbackFile = form.get("file");
  if (files.length > 0) {
    return files;
  }
  return fallbackFile instanceof File ? [fallbackFile] : [];
}

function attachmentKind(file: File): "image" | "pdf" | "audio" | "voice" | "document" | "other" {
  if (file.type.startsWith("image/")) {
    return "image";
  }
  if (file.type === "application/pdf") {
    return "pdf";
  }
  if (file.type.startsWith("audio/")) {
    return "audio";
  }
  return file.name ? "document" : "other";
}

function compactText(value: string, maxLength: number): string {
  const compacted = value.replace(/\s+/g, " ").trim();
  if (compacted.length <= maxLength) {
    return compacted;
  }
  const slice = compacted.slice(0, maxLength).trimEnd();
  const boundary = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("; "), slice.lastIndexOf(", "), slice.lastIndexOf(" "));
  const semanticCut = boundary > Math.floor(maxLength * 0.65) ? slice.slice(0, boundary) : slice;
  return semanticCut.trimEnd().replace(/[,:;.-]+$/u, "");
}

function isDocxFile(file: File): boolean {
  return (
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    /\.docx$/i.test(file.name)
  );
}

function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

function isImageFile(file: File): boolean {
  return file.type.startsWith("image/") || /\.(png|jpe?g|gif|webp|heic|heif|bmp|tiff?)$/i.test(file.name);
}

function isAudioFile(file: File): boolean {
  return file.type.startsWith("audio/") || /\.(m4a|mp3|mp4|mpeg|mpga|oga|ogg|wav|webm)$/i.test(file.name);
}

function fileKindForSummary(file: File): string {
  if (isPdfFile(file)) {
    return "PDF";
  }
  if (isDocxFile(file)) {
    return "DOCX";
  }
  if (isAudioFile(file)) {
    return "Audio";
  }
  if (isImageFile(file)) {
    return "Image";
  }
  return "File";
}

function splitSummarySentences(value: string): string[] {
  return value
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+|(?:\s+-\s+)/u)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 24);
}

function summarySentenceScore(sentence: string, index: number): number {
  const text = sentence.toLocaleLowerCase();
  const keywords = [
    "client",
    "kunde",
    "kundin",
    "projekt",
    "project",
    "adresse",
    "address",
    "bgf",
    "wohnfläche",
    "wohnflaeche",
    "fläche",
    "flaeche",
    "m²",
    "m2",
    "eur",
    "€",
    "honorar",
    "preis",
    "price",
    "offer",
    "angebot",
    "commercial",
    "telefon",
    "phone",
    "email",
    "deadline",
    "frist",
    "termin",
    "lp "
  ];
  const keywordScore = keywords.reduce((score, keyword) => score + (text.includes(keyword) ? 2 : 0), 0);
  const numberScore = /\d/.test(sentence) ? 2 : 0;
  const emailScore = /@/.test(sentence) ? 2 : 0;
  return keywordScore + numberScore + emailScore + Math.max(0, 4 - index);
}

function semanticShortSummary(file: File, text: string): string {
  const sentences = splitSummarySentences(text);
  const selected = sentences
    .map((sentence, index) => ({ sentence, index, score: summarySentenceScore(sentence, index) }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, 3)
    .sort((left, right) => left.index - right.index)
    .map((item) => item.sentence);
  const source = selected.length > 0 ? selected.join(" ") : text;
  const summary = compactText(source, fileShortSummaryMax - fileKindForSummary(file).length - 2);
  return `${fileKindForSummary(file)}: ${summary}`;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseFileAnalysis(value: unknown): { summary: string | null; longSummary: string | null } | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  const summary = readString(record.shortSummary) ?? readString(record.summary);
  const longSummary = readString(record.longSummary) ?? readString(record.fullSummary) ?? readString(record.details);
  if (!summary && !longSummary) {
    return null;
  }
  return {
    summary: summary ? compactText(summary, fileShortSummaryMax) : null,
    longSummary: longSummary ? compactText(longSummary, fileFullSummaryMax) : null
  };
}

async function summarizeExtractedFileText(file: File, text: string): Promise<{ summary: string | null; longSummary: string | null } | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return null;
  }
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.OPENAI_ATTACHMENT_SUMMARY_MODEL ?? "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You summarize uploaded files for an architecture CRM. Return strict JSON with shortSummary and longSummary. shortSummary must be one clear semantic sentence, no ellipsis, suitable for about three Telegram mobile lines. longSummary must be at most 500 characters and include the most important extracted facts. Preserve exact numbers, names, addresses, prices, deadlines, and project facts."
        },
        {
          role: "user",
          content: [
            `File type: ${fileKindForSummary(file)}`,
            `File name: ${file.name || "uploaded file"}`,
            "",
            "Extracted or transcribed text:",
            compactText(text, 12000)
          ].join("\n")
        }
      ]
    })
  });
  let payload: OpenAiChatPayload | null = null;
  try {
    payload = (await response.json()) as OpenAiChatPayload;
  } catch {
    payload = null;
  }
  if (!response.ok) {
    throw new Error(payload?.error?.message ?? "OpenAI file summary failed.");
  }
  const content = payload?.choices?.[0]?.message?.content;
  if (!content) {
    return null;
  }
  try {
    return parseFileAnalysis(JSON.parse(content));
  } catch {
    return null;
  }
}

async function summarizeImageFile(file: File, bytes: Uint8Array): Promise<{ summary: string | null; longSummary: string | null } | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return null;
  }
  const mimeType = file.type || "image/jpeg";
  const dataUrl = `data:${mimeType};base64,${Buffer.from(bytes).toString("base64")}`;
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.OPENAI_ATTACHMENT_VISION_MODEL ?? process.env.OPENAI_ATTACHMENT_SUMMARY_MODEL ?? "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You analyze uploaded images for an architecture CRM. Return strict JSON with shortSummary and longSummary. shortSummary must be one clear semantic sentence, no ellipsis, suitable for about three Telegram mobile lines. longSummary must be at most 500 characters and include all important visible facts: project type, architecture clues, text shown in screenshots, addresses, prices, contacts, deadlines, and missing offer fields."
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `File name: ${file.name || "uploaded image"}`
            },
            { type: "image_url", image_url: { url: dataUrl, detail: "high" } }
          ]
        }
      ]
    })
  });
  let payload: OpenAiChatPayload | null = null;
  try {
    payload = (await response.json()) as OpenAiChatPayload;
  } catch {
    payload = null;
  }
  if (!response.ok) {
    throw new Error(payload?.error?.message ?? "OpenAI image summary failed.");
  }
  const content = payload?.choices?.[0]?.message?.content;
  if (!content) {
    return null;
  }
  try {
    return parseFileAnalysis(JSON.parse(content));
  } catch {
    return null;
  }
}

async function extractPdfText(bytes: Uint8Array): Promise<string | null> {
  const importPdfParse = new Function("specifier", "return import(specifier)") as (
    specifier: string
  ) => Promise<{ PDFParse: PdfParseConstructor }>;
  const { PDFParse } = await importPdfParse("pdf-parse");
  const parser = new PDFParse({ data: bytes });
  try {
    const result = await parser.getText();
    return result.text?.replace(/\s+/g, " ").trim() || null;
  } finally {
    await parser.destroy();
  }
}

async function transcribeAudio(file: File, bytes: Uint8Array): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return null;
  }
  const mimeType = file.type || "application/octet-stream";
  const fileName =
    mimeType === "audio/mp4" && file.name.toLowerCase().endsWith(".mp4")
      ? file.name.replace(/\.mp4$/i, ".m4a")
      : file.name || "audio.m4a";
  const form = new FormData();
  form.set("model", process.env.OPENAI_AUDIO_TRANSCRIPTION_MODEL ?? "whisper-1");
  form.set("file", new File([Buffer.from(bytes)], fileName, { type: mimeType }));
  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`
    },
    body: form
  });
  let payload: OpenAiTranscriptionPayload | null = null;
  try {
    payload = (await response.json()) as OpenAiTranscriptionPayload;
  } catch {
    payload = null;
  }
  if (!response.ok) {
    throw new Error(payload?.error?.message ?? "OpenAI audio transcription failed.");
  }
  return payload?.text?.trim() || null;
}

async function documentSummaryFromBytes(file: File, bytes: Uint8Array): Promise<{ summary: string | null; longSummary: string | null }> {
  let text: string | null = null;
  if (isPdfFile(file)) {
    try {
      text = await extractPdfText(bytes);
    } catch {
      text = null;
    }
  } else if (isDocxFile(file)) {
    try {
      text = extractDocxText(Buffer.from(bytes));
    } catch {
      text = null;
    }
  } else if (isAudioFile(file)) {
    try {
      text = await transcribeAudio(file, bytes);
    } catch {
      text = null;
    }
  } else if (isImageFile(file)) {
    try {
      const imageSummary = await summarizeImageFile(file, bytes);
      if (imageSummary?.summary || imageSummary?.longSummary) {
        return imageSummary;
      }
    } catch {
      return { summary: null, longSummary: null };
    }
    return { summary: null, longSummary: null };
  } else {
    return { summary: null, longSummary: null };
  }
  if (!text) {
    return { summary: null, longSummary: null };
  }
  try {
    const semanticSummary = await summarizeExtractedFileText(file, text);
    if (semanticSummary?.summary || semanticSummary?.longSummary) {
      return {
        summary: semanticSummary.summary ?? semanticShortSummary(file, text),
        longSummary: semanticSummary.longSummary ?? compactText(text, fileFullSummaryMax)
      };
    }
  } catch {
    // Keep uploads reliable even when semantic analysis is temporarily unavailable.
  }
  return {
    summary: semanticShortSummary(file, text),
    longSummary: compactText(text, fileFullSummaryMax)
  };
}

function documentKindLabel(file: File): "DOCX" | "PDF" | "document" {
  if (isDocxFile(file)) {
    return "DOCX";
  }
  if (isPdfFile(file)) {
    return "PDF";
  }
  return "document";
}

function incomingOfferLabel(file: File): string {
  const kind = documentKindLabel(file);
  return kind === "document" ? "uploaded returned offer" : `uploaded returned offer (${kind})`;
}

function canBeCommercialOfferAttachment(attachment: LeadIntakeAttachmentInput): boolean {
  const fileName = attachment.fileName.toLocaleLowerCase();
  const mimeType = attachment.mimeType?.toLocaleLowerCase() ?? "";
  return (
    attachment.kind === "pdf" ||
    (attachment.kind === "document" &&
      (mimeType.includes("word") ||
        mimeType === "application/pdf" ||
        /\.(docx?|pdf)$/i.test(fileName)))
  );
}

function defaultDocumentSummary(attachment: LeadIntakeAttachmentInput): string {
  const labels: Record<LeadIntakeAttachmentInput["kind"], string> = {
    image: "Image",
    pdf: "PDF",
    audio: "Audio",
    voice: "Voice",
    document: "Document",
    other: "File"
  };
  return `${labels[attachment.kind]} attached to lead documents.`;
}

function nextCommercialOfferVersion(documents: DocumentFile[], leadId: string): number {
  const versions = documents
    .filter((document) => document.leadId === leadId && !document.archivedAt && looksLikeCommercialOffer(document))
    .map((document) => {
      const match = [document.shortSummary, document.fileName].join(" ").match(/\bV(\d+)/i);
      return match ? Number(match[1]) : null;
    })
    .filter((value): value is number => value !== null && Number.isFinite(value));
  return versions.length > 0 ? Math.max(...versions) + 1 : 1;
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const leadId = textField(form, "leadId");
    const files = fileFields(form);
    if (!leadId) {
      return NextResponse.json({ error: "leadId is required" }, { status: 400 });
    }
    if (files.length === 0) {
      return NextResponse.json({ error: "at least one file is required" }, { status: 400 });
    }

    const workspaceId = textField(form, "workspaceId") ?? defaultWorkspaceId;
    const fallbackSummary = textField(form, "summary");
    const fallbackLongSummary = textField(form, "longSummary");
    const summaries = textFields(form, "summaries");
    const longSummaries = textFields(form, "longSummaries");
    const attachments: LeadIntakeAttachmentInput[] = await Promise.all(
      files.map(async (file, index) => {
        const bytes = Buffer.from(await file.arrayBuffer());
        const extractedDocument = await documentSummaryFromBytes(file, Uint8Array.from(bytes));
        const stored = await storeCrmFile({
          bytes,
          fileName: file.name || "attachment",
          workspaceId,
          leadId,
          mimeType: file.type || null,
          storageKeySuffix: `${Date.now().toString(36)}-${index + 1}-${randomUUID().slice(0, 8)}`
        });
        return {
          kind: attachmentKind(file),
          fileName: stored.fileName,
          storageProvider: stored.storageProvider,
          storageBucket: stored.storageBucket,
          storageKey: stored.storageKey,
          downloadUrl: stored.downloadUrl,
          mimeType: stored.mimeType,
          sizeBytes: stored.sizeBytes,
          summary: summaries[index] || fallbackSummary || extractedDocument.summary,
          longSummary: longSummaries[index] || fallbackLongSummary || extractedDocument.longSummary
        };
      })
    );
    const allCommercialOffers =
      attachments.length > 0 &&
      attachments.every((attachment) =>
        canBeCommercialOfferAttachment(attachment) &&
        looksLikeCommercialOffer({
          fileName: attachment.fileName,
          summary: attachment.summary,
          longSummary: attachment.longSummary
        })
      );
    if (allCommercialOffers) {
      const crm = getCrm();
      const [leads, existingDocuments] = await Promise.all([
        crm.listRecords({ entity: "lead", workspaceId, includeArchived: true }),
        crm.listRecords({ entity: "documentFile", workspaceId, includeArchived: true })
      ]);
      const lead = leads.find((item) => item.id === leadId);
      if (!lead) {
        return NextResponse.json({ error: "Lead not found" }, { status: 404 });
      }
      let version = nextCommercialOfferVersion(existingDocuments, lead.id);
      const documents = [];
      for (const [attachmentIndex, attachment] of attachments.entries()) {
        const originalFile = files[attachmentIndex];
        const summary = incomingCommercialOfferSummary({
          version,
          fileName: attachment.fileName,
          label: originalFile ? incomingOfferLabel(originalFile) : "uploaded returned offer",
          summary: attachment.summary,
          longSummary: attachment.longSummary
        });
        documents.push(
          await crm.upsertDocumentFile({
            workspaceId,
            leadId: lead.id,
            clientId: lead.clientId,
            fileName: attachment.fileName,
            shortSummary: summary.shortSummary,
            longSummary: summary.longSummary,
            downloadUrl: attachment.downloadUrl,
            storageProvider: attachment.storageProvider,
            storageBucket: attachment.storageBucket,
            storageKey: attachment.storageKey,
            mimeType: attachment.mimeType,
            sizeBytes: attachment.sizeBytes
          })
        );
        version += 1;
      }
      return NextResponse.json({
        lead,
        documents,
        leadSummary: null,
        summary: documents.map((document) => document.shortSummary).join("\n"),
        originalTakes: []
      });
    }
    const crm = getCrm();
    const leads = await crm.listRecords({ entity: "lead", workspaceId, includeArchived: true });
    const lead = leads.find((item) => item.id === leadId);
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }
    const documents = await Promise.all(
      attachments.map((attachment) =>
        crm.upsertDocumentFile({
          workspaceId,
          leadId: lead.id,
          clientId: lead.clientId,
          fileName: attachment.fileName,
          shortSummary: attachment.summary ?? defaultDocumentSummary(attachment),
          longSummary:
            attachment.longSummary ??
            attachment.summary ??
            `${defaultDocumentSummary(attachment)} Added from ${textField(form, "sourceChannel") ?? "web"} upload.`,
          downloadUrl: attachment.downloadUrl,
          storageProvider: attachment.storageProvider,
          storageBucket: attachment.storageBucket,
          storageKey: attachment.storageKey,
          mimeType: attachment.mimeType,
          sizeBytes: attachment.sizeBytes
        })
      )
    );

    return NextResponse.json({
      lead,
      documents,
      leadSummary: null,
      summary: documents.map((document) => document.shortSummary).join("\n"),
      originalTakes: []
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
