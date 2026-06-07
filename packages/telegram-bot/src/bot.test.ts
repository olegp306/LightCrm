import { describe, expect, it, vi } from "vitest";
import { formatOrchestrationReply, handleTelegramUpdate, parseAllowedChatIds, uploadTelegramAttachmentToWeb } from "./bot-core";

describe("telegram bot core", () => {
  it("parses allowed chat ids from comma-separated env", () => {
    expect(parseAllowedChatIds("111111, 222222")).toEqual(new Set([111111, 222222]));
    expect(parseAllowedChatIds("")).toEqual(new Set());
  });

  it("formats a concise orchestration reply", () => {
    const reply = formatOrchestrationReply({
      workspaceId: "default",
      normalizedText: "Ещё новый лид: снова Максим Тютюник",
      intent: "create_new_lead",
      risk: "auto",
      explanations: ["Explicit new-lead phrase wins over similar contact names."],
      facts: {
        contactName: "Максим Тютюник",
        projectName: null,
        projectType: "private_house",
        location: "Швейцария",
        areaM2: null,
        phone: null,
        budgetEur: null,
        dueAt: null,
        sourceMessageId: "1869",
        evidence: {
          sourceMessageId: "1869",
          author: "Катя",
          sourceChannel: "telegram",
          textSnippet: "Ещё новый лид: снова Максим Тютюник"
        }
      },
      actions: [
        {
          type: "create_lead",
          risk: "auto",
          reason: "Low-risk CRM action.",
          payload: { externalMessageId: "1869" }
        }
      ]
    });

    expect(reply).toContain("Intent: create_new_lead");
    expect(reply).toContain("Risk: auto");
    expect(reply).toContain("Action: create_lead");
    expect(reply).toContain("Contact: Максим Тютюник");
  });

  it("rejects messages from chats outside the allowlist", async () => {
    const sendMessage = vi.fn();
    await handleTelegramUpdate(
      {
        update_id: 1,
        message: {
          message_id: 10,
          text: "Привет",
          chat: { id: 123 },
          from: { first_name: "Katya" }
        }
      },
      {
        allowedChatIds: new Set([111111]),
        workspaceId: "default",
        sendMessage,
        orchestrate: vi.fn()
      }
    );

    expect(sendMessage).toHaveBeenCalledWith(123, expect.stringContaining("not allowed"));
  });

  it("runs orchestration for allowed text messages", async () => {
    const sendMessage = vi.fn();
    const orchestrate = vi.fn().mockResolvedValue({
      workspaceId: "default",
      normalizedText: "Имя клиента - Максим Тютюник",
      intent: "update_contact",
      risk: "review",
      explanations: [],
      facts: {
        contactName: "Максим Тютюник",
        projectName: null,
        projectType: null,
        location: null,
        areaM2: null,
        phone: null,
        budgetEur: null,
        dueAt: null,
        sourceMessageId: "1878",
        evidence: { sourceMessageId: "1878", author: "Katya", sourceChannel: "telegram", textSnippet: "Имя клиента" }
      },
      actions: [{ type: "request_review", risk: "review", reason: "Name-only update", payload: {} }]
    });

    await handleTelegramUpdate(
      {
        update_id: 2,
        message: {
          message_id: 1878,
          text: "Имя клиента - Максим Тютюник",
          chat: { id: 111111 },
          from: { first_name: "Katya" }
        }
      },
      {
        allowedChatIds: new Set([111111]),
        workspaceId: "default",
        sendMessage,
        orchestrate
      }
    );

    expect(orchestrate).toHaveBeenCalledWith({
      workspaceId: "default",
      messageId: "1878",
      author: "Katya",
      text: "Имя клиента - Максим Тютюник",
      sourceChannel: "telegram"
    });
    expect(sendMessage).toHaveBeenCalledWith(111111, expect.stringContaining("Risk: review"));
  });

  it("creates a lead intake from captioned attachments", async () => {
    const sendMessage = vi.fn();
    const orchestrate = vi.fn().mockResolvedValue({
      workspaceId: "default",
      normalizedText: "Ещё новый лид: дом 140 м2",
      intent: "create_new_lead",
      risk: "auto",
      explanations: [],
      facts: {
        contactName: "Максим",
        projectName: "дом 140 м2",
        projectType: "private_house",
        location: null,
        areaM2: 140,
        phone: null,
        budgetEur: null,
        dueAt: null,
        sourceMessageId: "200",
        evidence: { sourceMessageId: "200", author: "Katya", sourceChannel: "telegram", textSnippet: "Ещё новый лид" }
      },
      actions: [{ type: "create_lead", risk: "auto", reason: "Low-risk CRM action.", payload: { name: "Максим" } }]
    });
    const createLead = vi.fn().mockResolvedValue({ id: "lead-1", name: "Максим" });
    const prepareAttachment = vi.fn().mockResolvedValue({
      kind: "pdf",
      fileName: "brief.pdf",
      storageProvider: "local",
      storageBucket: null,
      storageKey: "workspaces/default/leads/lead-1/brief.pdf",
      downloadUrl: "/api/crm/storage/local/workspaces%2Fdefault%2Fleads%2Flead-1%2Fbrief.pdf",
      mimeType: "application/pdf",
      sizeBytes: 123
    });
    const ingestLeadIntake = vi.fn().mockResolvedValue({ documents: [{ id: "doc-1" }], summary: "дом 140 м2" });

    await handleTelegramUpdate(
      {
        update_id: 3,
        message: {
          message_id: 200,
          caption: "Ещё новый лид: дом 140 м2",
          chat: { id: 111111 },
          from: { first_name: "Katya" },
          document: {
            file_id: "file-1",
            file_unique_id: "unique-1",
            file_name: "brief.pdf",
            mime_type: "application/pdf",
            file_size: 123
          }
        }
      },
      {
        allowedChatIds: new Set([111111]),
        workspaceId: "default",
        sendMessage,
        orchestrate,
        createLead,
        prepareAttachment,
        ingestLeadIntake
      }
    );

    expect(createLead).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "default",
        name: "Максим",
        sourceChannel: "telegram",
        externalMessageId: "200"
      })
    );
    expect(prepareAttachment).toHaveBeenCalledWith(
      expect.objectContaining({
        leadId: "lead-1",
        attachment: expect.objectContaining({ fileId: "file-1", fileName: "brief.pdf" })
      })
    );
    expect(ingestLeadIntake).not.toHaveBeenCalled();
    expect(sendMessage).toHaveBeenCalledWith(111111, expect.stringContaining("Intake: saved 1 attachment"));
  });

  it("uploads telegram attachment bytes through the web upload API", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        documents: [
          {
            fileName: "brief.pdf",
            storageProvider: "local",
            storageBucket: null,
            storageKey: "workspaces/default/leads/lead-1/brief.pdf",
            downloadUrl: "/api/crm/storage/local/workspaces%2Fdefault%2Fleads%2Flead-1%2Fbrief.pdf",
            mimeType: "application/pdf",
            sizeBytes: 3
          }
        ]
      })
    });

    const attachment = await uploadTelegramAttachmentToWeb({
      crmApiBase: "http://localhost:4900",
      workspaceId: "default",
      leadId: "lead-1",
      sourceChannel: "telegram",
      sourceThreadId: "111111",
      sourceMessageId: "200",
      text: "Ещё новый лид",
      author: "Katya",
      attachment: {
        fileId: "file-1",
        uniqueId: "unique-1",
        kind: "pdf",
        fileName: "brief.pdf",
        mimeType: "application/pdf",
        sizeBytes: 3
      },
      bytes: new Uint8Array([1, 2, 3]),
      fetchImpl
    });

    expect(fetchImpl).toHaveBeenCalledWith("http://localhost:4900/api/crm/lead-intake/upload", {
      method: "POST",
      body: expect.any(FormData)
    });
    const form = fetchImpl.mock.calls[0][1].body as FormData;
    expect(form.get("leadId")).toBe("lead-1");
    expect(form.get("sourceChannel")).toBe("telegram");
    expect(form.get("text")).toBe("Ещё новый лид");
    expect(form.get("file")).toBeInstanceOf(File);
    expect(attachment).toMatchObject({
      kind: "pdf",
      fileName: "brief.pdf",
      storageProvider: "local",
      storageKey: "workspaces/default/leads/lead-1/brief.pdf"
    });
  });
});
