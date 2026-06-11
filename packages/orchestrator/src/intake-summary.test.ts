import { describe, expect, it } from "vitest";
import { summarizeLeadIntake } from "./intake-summary";

describe("summarizeLeadIntake", () => {
  it("builds a typed deterministic summary for text and multiple attachments", () => {
    const summary = summarizeLeadIntake({
      workspaceId: "default",
      leadId: "lead-1",
      sourceChannel: "telegram",
      sourceThreadId: "763604722",
      textItems: [
        {
          sourceMessageId: "51",
          author: "Katya",
          text: "Client asks for an offer for a 140 m2 private house."
        }
      ],
      attachments: [
        {
          sourceMessageId: "52",
          kind: "pdf",
          fileName: "brief.pdf",
          storageProvider: "s3",
          storageKey: "leads/lead-1/brief.pdf",
          mimeType: "application/pdf",
          sizeBytes: 2048,
          summary: "PDF brief with project requirements"
        },
        {
          sourceMessageId: "53",
          kind: "voice",
          fileName: "voice.ogg",
          storageProvider: "s3",
          storageKey: "leads/lead-1/voice.ogg",
          mimeType: "audio/ogg",
          sizeBytes: 512
        }
      ]
    });

    expect(summary.shortSummary).toContain("140 m2 private house");
    expect(summary.shortSummary).toContain("2 file(s)");
    expect(summary.longSummary).toContain("Source: telegram thread 763604722.");
    expect(summary.longSummary).toContain("[pdf, voice]");
    expect(summary.attachments[0]).toMatchObject({
      sourceMessageId: "52",
      kind: "pdf",
      fileName: "brief.pdf",
      shortSummary: "PDF brief with project requirements"
    });
    expect(summary.attachments[1]).toMatchObject({
      sourceMessageId: "53",
      kind: "voice",
      fileName: "voice.ogg",
      shortSummary: "Voice attached to lead intake"
    });
    expect(summary.originalTakes).toContain("Katya #51: Client asks for an offer for a 140 m2 private house.");
    expect(summary.originalTakes).toContain("pdf #52: brief.pdf - PDF brief with project requirements");
    expect(summary.missingSignals).not.toContain("file_semantics");
  });

  it("reports missing semantic signals for attachment-only intake without file summaries", () => {
    const summary = summarizeLeadIntake({
      workspaceId: "default",
      leadId: "lead-1",
      sourceChannel: "telegram",
      attachments: [
        {
          kind: "image",
          fileName: "site.jpg",
          storageProvider: "s3",
          storageKey: "leads/lead-1/site.jpg"
        }
      ]
    });

    expect(summary.shortSummary).toContain("No text notes yet");
    expect(summary.attachments[0]?.longSummary).toContain("No semantic file analysis is available yet.");
    expect(summary.missingSignals).toEqual(["text", "file_semantics"]);
  });

  it("lets an external analyzer provide attachment semantics", () => {
    const calls: Array<{ fileName: string; text: string }> = [];
    const summary = summarizeLeadIntake(
      {
        workspaceId: "default",
        leadId: "lead-1",
        sourceChannel: "telegram",
        textItems: [{ text: "Forwarded client request for a commercial offer." }],
        attachments: [
          {
            kind: "pdf",
            fileName: "honorar.pdf",
            storageProvider: "s3",
            storageKey: "leads/lead-1/honorar.pdf"
          }
        ]
      },
      {
        analyzer: {
          analyzeAttachment: (attachment, context) => {
            calls.push({ fileName: attachment.fileName, text: context.text });
            return {
              shortSummary: "Fee table PDF with LP1-4 pricing",
              longSummary: "The PDF appears to contain fee ranges and pricing rows for commercial offer generation."
            };
          }
        }
      }
    );

    expect(calls).toEqual([
      { fileName: "honorar.pdf", text: "Forwarded client request for a commercial offer." }
    ]);
    expect(summary.attachments[0]).toMatchObject({
      fileName: "honorar.pdf",
      shortSummary: "Fee table PDF with LP1-4 pricing",
      longSummary: "The PDF appears to contain fee ranges and pricing rows for commercial offer generation."
    });
    expect(summary.originalTakes).toContain("pdf: honorar.pdf - Fee table PDF with LP1-4 pricing");
    expect(summary.missingSignals).not.toContain("file_semantics");
  });
});
