import { describe, expect, it, vi } from "vitest";
import { DEFAULT_LANGGRAPH_SETTINGS } from "@lightcrm/orchestrator";
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
      settings: DEFAULT_LANGGRAPH_SETTINGS,
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

  it("formats semantic note orchestration results", () => {
    const reply = formatOrchestrationReply({
      workspaceId: "default",
      normalizedText: "No, this is not a new lead",
      intent: "add_lead_note",
      risk: "review",
      actions: [{ type: "request_review", risk: "review", reason: "Need target confirmation.", payload: { targetId: "lead-1" } }],
      explanations: ["The message negates lead creation."],
      facts: {
        contactName: null,
        projectName: null,
        projectType: null,
        location: null,
        areaM2: null,
        phone: null,
        budgetEur: null,
        dueAt: null,
        sourceMessageId: "m-1",
        evidence: {
          sourceMessageId: "m-1",
          author: "architect",
          sourceChannel: "telegram",
          textSnippet: "No, this is not a new lead"
        }
      },
      settings: DEFAULT_LANGGRAPH_SETTINGS
    });

    expect(reply).toContain("Intent: add_lead_note");
    expect(reply).toContain("Action: request_review");
    expect(reply).toContain("Target: lead-1");
    expect(reply).not.toContain("Intent: create_new_lead");
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
      settings: DEFAULT_LANGGRAPH_SETTINGS,
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
      settings: DEFAULT_LANGGRAPH_SETTINGS,
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

  it("creates and links a client when auto lead facts include a contact name", async () => {
    const sendMessage = vi.fn();
    const orchestrate = vi.fn().mockResolvedValue({
      workspaceId: "default",
      normalizedText: "New lead: Maria, private house",
      intent: "create_lead",
      risk: "auto",
      explanations: [],
      settings: DEFAULT_LANGGRAPH_SETTINGS,
      facts: {
        contactName: "Maria",
        projectName: null,
        projectType: "private_house",
        location: null,
        areaM2: null,
        phone: "+491234",
        budgetEur: null,
        dueAt: null,
        sourceMessageId: "201",
        evidence: { sourceMessageId: "201", author: "Katya", sourceChannel: "telegram", textSnippet: "New lead: Maria" }
      },
      actions: [{ type: "create_lead", risk: "auto", reason: "Low-risk CRM action.", payload: {} }]
    });
    const createClient = vi.fn().mockResolvedValue({ id: "client-1", name: "Maria" });
    const createLead = vi.fn().mockResolvedValue({ id: "lead-1", name: "Maria" });

    await handleTelegramUpdate(
      {
        update_id: 4,
        message: {
          message_id: 201,
          text: "New lead: Maria, private house",
          chat: { id: 111111 },
          from: { first_name: "Katya" }
        }
      },
      {
        allowedChatIds: new Set([111111]),
        workspaceId: "default",
        sendMessage,
        orchestrate,
        createClient,
        createLead
      }
    );

    expect(createClient).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "default",
        name: "Maria",
        phone: "+491234",
        sourceChannel: "telegram",
        externalThreadId: "111111",
        externalMessageId: "201"
      })
    );
    expect(createLead).toHaveBeenCalledWith(expect.objectContaining({ clientId: "client-1" }));
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
