import { storeCrmFile } from "@lightcrm/storage";
import { NextResponse } from "next/server";
import { defaultWorkspaceId, getCrm, handleRouteError } from "../../_shared";

function textField(form: FormData, name: string): string | null {
  const value = form.get(name);
  return typeof value === "string" && value.trim() ? value.trim() : null;
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
    const file = form.get("file");
    if (!leadId) {
      return NextResponse.json({ error: "leadId is required" }, { status: 400 });
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    const workspaceId = textField(form, "workspaceId") ?? defaultWorkspaceId;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const stored = await storeCrmFile({
      bytes,
      fileName: file.name || "attachment",
      workspaceId,
      leadId,
      mimeType: file.type || null
    });
    const text = textField(form, "text");
    const summary = textField(form, "summary");
    const intake = await getCrm().ingestLeadIntake({
      workspaceId,
      leadId,
      sourceChannel: textField(form, "sourceChannel") ?? "web",
      sourceThreadId: textField(form, "sourceThreadId"),
      sourceMessageId: textField(form, "sourceMessageId"),
      textItems: text ? [{ text, author: textField(form, "author") }] : [],
      attachments: [
        {
          kind: attachmentKind(file),
          fileName: stored.fileName,
          storageProvider: stored.storageProvider,
          storageBucket: stored.storageBucket,
          storageKey: stored.storageKey,
          downloadUrl: stored.downloadUrl,
          mimeType: stored.mimeType,
          sizeBytes: stored.sizeBytes,
          summary
        }
      ]
    });

    return NextResponse.json(intake);
  } catch (error) {
    return handleRouteError(error);
  }
}
