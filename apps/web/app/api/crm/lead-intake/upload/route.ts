import { summarizeLeadIntake } from "@lightcrm/orchestrator";
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
  return `${compacted.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
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

async function documentSummaryFromBytes(file: File, bytes: Uint8Array): Promise<{ summary: string | null; longSummary: string | null }> {
  let text: string | null = null;
  if (!isDocxFile(file)) {
    if (!isPdfFile(file)) {
      return { summary: null, longSummary: null };
    }
    try {
      text = await extractPdfText(bytes);
    } catch {
      text = null;
    }
  } else {
    try {
      text = extractDocxText(Buffer.from(bytes));
    } catch {
      text = null;
    }
  }
  if (!text) {
    return { summary: null, longSummary: null };
  }
  return {
    summary: compactText(text, 420),
    longSummary: compactText(text, 3000)
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
    const text = textField(form, "text");
    const fallbackSummary = textField(form, "summary");
    const fallbackLongSummary = textField(form, "longSummary");
    const summaries = textFields(form, "summaries");
    const longSummaries = textFields(form, "longSummaries");
    const attachments: LeadIntakeAttachmentInput[] = await Promise.all(
      files.map(async (file, index) => {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const extractedDocument = await documentSummaryFromBytes(file, bytes);
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
    const intakeInput = {
      workspaceId,
      leadId,
      sourceChannel: textField(form, "sourceChannel") ?? "web",
      sourceThreadId: textField(form, "sourceThreadId"),
      sourceMessageId: textField(form, "sourceMessageId"),
      textItems: text ? [{ text, author: textField(form, "author") }] : [],
      attachments
    };
    const summary = summarizeLeadIntake(intakeInput);
    const intake = await getCrm().ingestLeadIntake({
      ...intakeInput,
      attachments: intakeInput.attachments.map((attachment, index) => ({
        ...attachment,
        summary: attachment.summary ?? summary.attachments[index]?.shortSummary ?? null,
        longSummary: attachment.longSummary ?? summary.attachments[index]?.longSummary ?? null
      }))
    });

    return NextResponse.json(intake);
  } catch (error) {
    return handleRouteError(error);
  }
}
