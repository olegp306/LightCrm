import { summarizeLeadIntake } from "@lightcrm/orchestrator";
import type { LeadIntakeAttachmentInput } from "@lightcrm/core";
import { storeCrmFile } from "@lightcrm/storage";
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { defaultWorkspaceId, getCrm, handleRouteError } from "../../_shared";

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
          summary: summaries[index] || fallbackSummary,
          longSummary: longSummaries[index] || fallbackLongSummary
        };
      })
    );
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
