import { describe, expect, it, vi } from "vitest";
import { DEFAULT_LANGGRAPH_SETTINGS } from "@lightcrm/orchestrator";
import {
  formatOrchestrationReply,
  handleTelegramUpdate,
  parseAllowedChatIds,
  type PendingClarification,
  uploadTelegramAttachmentToWeb
} from "./bot-core";
import {
  collectReadyChatIntakeUpdates,
  collectReadyMediaGroupUpdates,
  type ChatIntakeBuffer,
  type MediaGroupBuffer
} from "./media-groups";

describe("telegram bot core", () => {
  it("parses allowed chat ids from comma-separated env", () => {
    expect(parseAllowedChatIds("111111, 222222")).toEqual(new Set([111111, 222222]));
    expect(parseAllowedChatIds("")).toEqual(new Set());
  });

  it("buffers media group updates across polling responses before combining them", () => {
    const buffer = new Map<string, MediaGroupBuffer>();
    const firstReady = collectReadyMediaGroupUpdates(
      [
        {
          update_id: 10,
          message: {
            message_id: 210,
            media_group_id: "album-1",
            chat: { id: 111111 },
            document: {
              file_id: "file-1",
              file_unique_id: "unique-1",
              file_name: "brief.pdf",
              mime_type: "application/pdf",
              file_size: 123
            }
          }
        }
      ],
      buffer,
      1400,
      1000
    );
    const secondReady = collectReadyMediaGroupUpdates(
      [
        {
          update_id: 11,
          message: {
            message_id: 211,
            media_group_id: "album-1",
            chat: { id: 111111 },
            photo: [{ file_id: "file-2", file_unique_id: "unique-2", width: 800, height: 600, file_size: 456 }]
          }
        }
      ],
      buffer,
      1400,
      1500
    );
    const flushed = collectReadyMediaGroupUpdates([], buffer, 1400, 3000);

    expect(firstReady).toEqual([]);
    expect(secondReady).toEqual([]);
    expect(flushed).toHaveLength(1);
    expect(flushed[0]?.message?.groupedAttachments).toEqual([
      expect.objectContaining({ kind: "pdf", fileName: "brief.pdf" }),
      expect.objectContaining({ kind: "image", fileName: "TG-photo-211.jpg" })
    ]);
    expect(buffer.size).toBe(0);
  });

  it("combines close text and standalone attachments into one chat intake", () => {
    const buffer = new Map<string, ChatIntakeBuffer>();
    const firstReady = collectReadyChatIntakeUpdates(
      [
        {
          update_id: 20,
          message: {
            message_id: 51,
            text: "New lead: offer for architecture planning",
            chat: { id: 111111 }
          }
        }
      ],
      buffer,
      3500,
      1000
    );
    const secondReady = collectReadyChatIntakeUpdates(
      [
        {
          update_id: 21,
          message: {
            message_id: 52,
            chat: { id: 111111 },
            document: {
              file_id: "file-pdf",
              file_unique_id: "unique-pdf",
              file_name: "offer.pdf",
              mime_type: "application/pdf",
              file_size: 123
            }
          }
        },
        {
          update_id: 22,
          message: {
            message_id: 53,
            chat: { id: 111111 },
            audio: {
              file_id: "file-audio",
              file_unique_id: "unique-audio",
              file_name: "voice.mp3",
              mime_type: "audio/mpeg",
              file_size: 456
            }
          }
        }
      ],
      buffer,
      3500,
      2500
    );
    const flushed = collectReadyChatIntakeUpdates([], buffer, 3500, 6100);

    expect(firstReady).toEqual([]);
    expect(secondReady).toEqual([]);
    expect(flushed).toHaveLength(1);
    expect(flushed[0]?.message?.message_id).toBe(51);
    expect(flushed[0]?.message?.text).toBe("New lead: offer for architecture planning");
    expect(flushed[0]?.message?.groupedAttachments).toEqual([
      expect.objectContaining({ kind: "pdf", fileName: "offer.pdf" }),
      expect.objectContaining({ kind: "audio", fileName: "voice.mp3" })
    ]);
  });

  it("answers simple greeting and capability questions through graph help intent", async () => {
    const sendMessage = vi.fn();
    const orchestrate = vi.fn().mockResolvedValue({
      workspaceId: "default",
      normalizedText: "Привет! Кто ты? Что ты умеешь?",
      intent: "system_help",
      risk: "auto",
      explanations: ["The user asks what the system does."],
      settings: DEFAULT_LANGGRAPH_SETTINGS,
      facts: {
        contactName: null,
        projectName: null,
        projectType: null,
        location: null,
        areaM2: null,
        phone: null,
        budgetEur: null,
        dueAt: null,
        sourceMessageId: "301",
        evidence: { sourceMessageId: "301", author: "Katya", sourceChannel: "telegram", textSnippet: "Привет! Кто ты?" }
      },
      actions: []
    });

    await handleTelegramUpdate(
      {
        update_id: 30,
        message: {
          message_id: 301,
          text: "Привет! Кто ты? Что ты умеешь?",
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

    expect(orchestrate).toHaveBeenCalledWith(expect.objectContaining({ text: "Привет! Кто ты? Что ты умеешь?" }));
    expect(sendMessage).toHaveBeenCalledWith(111111, expect.stringContaining("LightCrm help"));
    expect(sendMessage).toHaveBeenCalledWith(111111, expect.stringContaining("New lead"));
  });

  it("answers lead tutorial questions through graph help intent without creating a lead", async () => {
    const sendMessage = vi.fn();
    const orchestrate = vi.fn().mockResolvedValue({
      workspaceId: "default",
      normalizedText: "Как завести лида?",
      intent: "system_help",
      risk: "auto",
      explanations: ["The user asks how to use leads."],
      settings: DEFAULT_LANGGRAPH_SETTINGS,
      facts: {
        contactName: null,
        projectName: null,
        projectType: null,
        location: null,
        areaM2: null,
        phone: null,
        budgetEur: null,
        dueAt: null,
        sourceMessageId: "302",
        evidence: { sourceMessageId: "302", author: "Katya", sourceChannel: "telegram", textSnippet: "Как завести лида?" }
      },
      actions: []
    });
    const createLead = vi.fn();

    await handleTelegramUpdate(
      {
        update_id: 31,
        message: {
          message_id: 302,
          text: "Как завести лида?",
          chat: { id: 111111 },
          from: { first_name: "Katya" }
        }
      },
      {
        allowedChatIds: new Set([111111]),
        workspaceId: "default",
        sendMessage,
        orchestrate,
        createLead
      }
    );

    expect(orchestrate).toHaveBeenCalledWith(expect.objectContaining({ text: "Как завести лида?" }));
    expect(createLead).not.toHaveBeenCalled();
    expect(sendMessage).toHaveBeenCalledWith(111111, expect.stringContaining("LightCrm help"));
    expect(sendMessage).toHaveBeenCalledWith(111111, expect.stringContaining("create a draft lead"));
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

    expect(reply).toContain("[+] lead ready");
    expect(reply).toContain("intent: create_new_lead");
    expect(reply).toContain("risk: auto");
    expect(reply).toContain("action: create_lead");
    expect(reply).toContain("contact: Максим Тютюник");
  });

  it("formats executed orchestration replies as results", () => {
    const reply = formatOrchestrationReply(
      {
        workspaceId: "default",
        normalizedText: "New lead: Maria",
        intent: "create_lead",
        risk: "auto",
        explanations: ["Lead was created."],
        settings: DEFAULT_LANGGRAPH_SETTINGS,
        facts: {
          contactName: "Maria",
          projectName: null,
          projectType: null,
          location: null,
          areaM2: null,
          phone: null,
          budgetEur: null,
          dueAt: null,
          sourceMessageId: "m-2",
          evidence: {
            sourceMessageId: "m-2",
            author: "Katya",
            sourceChannel: "telegram",
            textSnippet: "New lead: Maria"
          }
        },
        actions: [{ type: "create_lead", risk: "auto", reason: "Safe creation.", payload: {} }]
      },
      { status: "executed" }
    );

    expect(reply).toContain("[+] done");
    expect(reply).toContain("intent: create_lead");
    expect(reply).toContain("action: create_lead");
  });

  it("formats multi-action orchestration replies as a chain", () => {
    const reply = formatOrchestrationReply({
      workspaceId: "default",
      normalizedText: "New lead and remind me to email them in two weeks",
      intent: "create_lead",
      risk: "auto",
      explanations: ["The message asks for a lead and a reminder."],
      settings: DEFAULT_LANGGRAPH_SETTINGS,
      facts: {
        contactName: null,
        projectName: null,
        projectType: "country house",
        location: null,
        areaM2: null,
        phone: null,
        budgetEur: null,
        dueAt: "2026-06-25T09:00:00.000Z",
        sourceMessageId: "m-multi",
        evidence: {
          sourceMessageId: "m-multi",
          author: "director",
          sourceChannel: "telegram",
          textSnippet: "New lead and remind me to email them in two weeks"
        }
      },
      actions: [
        { type: "create_lead", risk: "auto", reason: "Safe lead creation.", payload: {} },
        { type: "create_reminder", risk: "auto", reason: "Secondary reminder action.", payload: {} }
      ]
    });

    expect(reply).toContain("action: create_lead + create_reminder");
    expect(reply).toContain("due: 2026-06-25T09:00:00.000Z");
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

    expect(reply).toContain("[!] needs review");
    expect(reply).toContain("intent: add_lead_note");
    expect(reply).toContain("action: request_review");
    expect(reply).toContain("Target: lead-1");
    expect(reply).not.toContain("Intent: create_new_lead");
  });

  it("marks unclear orchestration replies as not sure", () => {
    const reply = formatOrchestrationReply({
      workspaceId: "default",
      normalizedText: "random forwarded note",
      intent: "no_action",
      risk: "review",
      actions: [],
      explanations: ["No actionable CRM instruction was found."],
      facts: {
        contactName: null,
        projectName: null,
        projectType: null,
        location: null,
        areaM2: null,
        phone: null,
        budgetEur: null,
        dueAt: null,
        sourceMessageId: "m-empty",
        evidence: {
          sourceMessageId: "m-empty",
          author: "operator",
          sourceChannel: "telegram",
          textSnippet: "random forwarded note"
        }
      },
      settings: DEFAULT_LANGGRAPH_SETTINGS
    });

    expect(reply).toContain("[?] not sure");
    expect(reply).toContain("intent: no_action");
    expect(reply).toContain("note: No actionable CRM instruction was found.");
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
    expect(sendMessage).toHaveBeenCalledWith(111111, expect.stringContaining("[!] needs review"));
    expect(sendMessage).toHaveBeenCalledWith(111111, expect.stringContaining("risk: review"));
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
          forward_origin: {
            type: "user",
            sender_user_name: "WhatsApp client"
          },
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

    expect(orchestrate).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining("Director instruction: Ещё новый лид: дом 140 м2")
      })
    );
    expect(orchestrate).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining("Forwarded context source: WhatsApp client.")
      })
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
    expect(sendMessage).toHaveBeenCalledWith(
      111111,
      expect.stringContaining("<blockquote expandable><b>Missing for offer</b>"),
      {
        replyMarkup: {
          inline_keyboard: [
            [{ text: "undo", callback_data: "undo_lead:lead-1" }, { text: "offer", callback_data: "offer_lead:lead-1" }]
          ]
        }
      }
    );
  });

  it("creates a draft lead and saves attachments from attachment-only intake", async () => {
    const sendMessage = vi.fn();
    const orchestrate = vi.fn();
    const createLead = vi.fn().mockResolvedValue({ id: "lead-draft", name: "Draft lead - pdf from TG #210", code: "L-210" });
    const prepareAttachment = vi.fn().mockResolvedValue({
      kind: "pdf",
      fileName: "brief.pdf",
      storageProvider: "local",
      storageBucket: null,
      storageKey: "workspaces/default/leads/lead-draft/brief.pdf",
      downloadUrl: "/api/crm/storage/local/workspaces%2Fdefault%2Fleads%2Flead-draft%2Fbrief.pdf",
      mimeType: "application/pdf",
      sizeBytes: 123
    });

    await handleTelegramUpdate(
      {
        update_id: 5,
        message: {
          message_id: 210,
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
        prepareAttachment
      }
    );

    expect(orchestrate).not.toHaveBeenCalled();
    expect(createLead).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "default",
        name: "Draft lead - pdf from TG #210",
        sourceChannel: "telegram",
        externalMessageId: "210"
      })
    );
    expect(prepareAttachment).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "default",
        leadId: "lead-draft",
        text: "pdf: brief.pdf"
      })
    );
    expect(sendMessage).toHaveBeenCalledWith(
      111111,
      expect.stringContaining("<blockquote expandable><b>Missing for offer</b>"),
      {
        replyMarkup: {
          inline_keyboard: [
            [{ text: "undo", callback_data: "undo_lead:lead-draft" }, { text: "offer", callback_data: "offer_lead:lead-draft" }]
          ]
        }
      }
    );
  });

  it("creates a draft lead from image-only intake", async () => {
    const sendMessage = vi.fn();
    const createLead = vi.fn().mockResolvedValue({ id: "lead-image", name: "Draft lead - image from TG #211" });
    const prepareAttachment = vi.fn().mockResolvedValue({
      kind: "image",
      fileName: "TG-photo-211.jpg",
      storageProvider: "local",
      storageBucket: null,
      storageKey: "workspaces/default/leads/lead-image/TG-photo-211.jpg",
      downloadUrl: "/api/crm/storage/local/workspaces%2Fdefault%2Fleads%2Flead-image%2FTG-photo-211.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 456
    });

    await handleTelegramUpdate(
      {
        update_id: 6,
        message: {
          message_id: 211,
          chat: { id: 111111 },
          from: { first_name: "Katya" },
          photo: [
            {
              file_id: "small-photo",
              file_unique_id: "small-unique",
              width: 90,
              height: 90,
              file_size: 111
            },
            {
              file_id: "large-photo",
              file_unique_id: "large-unique",
              width: 1280,
              height: 720,
              file_size: 456
            }
          ]
        }
      },
      {
        allowedChatIds: new Set([111111]),
        workspaceId: "default",
        sendMessage,
        createLead,
        prepareAttachment
      }
    );

    expect(createLead).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "default",
        name: "Draft lead - image from TG #211",
        sourceChannel: "telegram",
        externalMessageId: "211"
      })
    );
    expect(prepareAttachment).toHaveBeenCalledWith(
      expect.objectContaining({
        leadId: "lead-image",
        attachment: expect.objectContaining({
          fileId: "large-photo",
          kind: "image",
          fileName: "TG-photo-211.jpg"
        }),
        text: "image: TG-photo-211.jpg"
      })
    );
    expect(sendMessage).toHaveBeenCalledWith(
      111111,
      expect.stringContaining("<blockquote expandable><b>Missing for offer</b>"),
      {
        replyMarkup: {
          inline_keyboard: [
            [{ text: "undo", callback_data: "undo_lead:lead-image" }, { text: "offer", callback_data: "offer_lead:lead-image" }]
          ]
        }
      }
    );
  });

  it("enriches an attachment-only draft lead from semantic image summaries", async () => {
    const sendMessage = vi.fn();
    const createLead = vi.fn().mockResolvedValue({ id: "lead-draft", name: "Draft lead - image from TG #213", code: "L-213" });
    const updateLead = vi.fn().mockResolvedValue({ id: "lead-draft", name: "Obernsees development property", code: "L-213" });
    const orchestrate = vi.fn().mockResolvedValue({
      workspaceId: "default",
      normalizedText: "Image analysis: Obernsees development property, 92,500 m2, purchase price EUR 9,275,000.",
      intent: "update_lead",
      risk: "auto",
      explanations: [],
      settings: DEFAULT_LANGGRAPH_SETTINGS,
      facts: {
        contactName: null,
        projectName: "Obernsees development property",
        projectType: "tourist development / holiday park",
        location: "Obernsees near Bayreuth",
        areaM2: 92500,
        phone: null,
        budgetEur: 9275000,
        dueAt: null,
        sourceMessageId: "213",
        evidence: {
          sourceMessageId: "213",
          author: "Katya",
          sourceChannel: "telegram",
          textSnippet: "Obernsees development property"
        }
      },
      actions: [{ type: "request_review", risk: "review", reason: "Attachment summary identifies the project.", payload: {} }]
    });
    const prepareAttachment = vi.fn().mockResolvedValue({
      kind: "image",
      fileName: "TG-photo-213.jpg",
      storageProvider: "local",
      storageBucket: null,
      storageKey: "workspaces/default/leads/lead-draft/TG-photo-213.jpg",
      downloadUrl: null,
      mimeType: "image/jpeg",
      sizeBytes: 456,
      summary: "Obernsees development property, land plot 92,500 m2, purchase price EUR 9,275,000.",
      longSummary:
        "The image describes a development property in Obernsees near Bayreuth for a holiday park, hotel, clinic or mixed-use tourist center. It lists 92,500 m2 land and a EUR 9,275,000 purchase price."
    });

    await handleTelegramUpdate(
      {
        update_id: 8,
        message: {
          message_id: 213,
          chat: { id: 111111 },
          from: { first_name: "Katya" },
          photo: [
            {
              file_id: "large-photo",
              file_unique_id: "large-unique",
              width: 1280,
              height: 720,
              file_size: 456
            }
          ]
        }
      },
      {
        allowedChatIds: new Set([111111]),
        workspaceId: "default",
        sendMessage,
        createLead,
        updateLead,
        orchestrate,
        prepareAttachment
      }
    );

    expect(orchestrate).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "default",
        messageId: "213",
        sourceChannel: "telegram",
        recentLeads: [{ id: "lead-draft", label: "Draft lead - image from TG #213", summary: null, lastTouchedAt: null }],
        text: expect.stringContaining("Obernsees development property")
      })
    );
    expect(updateLead).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "default",
        leadId: "lead-draft",
        patch: expect.objectContaining({
          name: "Obernsees development property",
          company: "Obernsees development property",
          projectName: "Obernsees development property",
          project: "tourist development / holiday park",
          area: "92500",
          address: "Obernsees near Bayreuth",
          budgetEur: "9275000",
          rawInput: expect.stringContaining("Obernsees development property")
        })
      })
    );
    expect(sendMessage).toHaveBeenCalledWith(
      111111,
      expect.stringContaining("<b>Obernsees development property</b>"),
      expect.anything()
    );
    expect(sendMessage).toHaveBeenCalledWith(111111, expect.stringContaining("<i>Area</i>: 92.500 m²"), expect.anything());
    expect(sendMessage).toHaveBeenCalledWith(111111, expect.stringContaining("<blockquote expandable><b>Missing for offer</b>"), expect.anything());
  });

  it("uses attachment summary for draft lead upload when caption is whitespace-only", async () => {
    const sendMessage = vi.fn();
    const createLead = vi.fn().mockResolvedValue({ id: "lead-whitespace", name: "Draft lead - pdf from TG #212" });
    const prepareAttachment = vi.fn().mockResolvedValue({
      kind: "pdf",
      fileName: "brief.pdf",
      storageProvider: "local",
      storageBucket: null,
      storageKey: "workspaces/default/leads/lead-whitespace/brief.pdf",
      downloadUrl: null,
      mimeType: "application/pdf",
      sizeBytes: 123
    });

    await handleTelegramUpdate(
      {
        update_id: 7,
        message: {
          message_id: 212,
          caption: "   ",
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
        createLead,
        prepareAttachment
      }
    );

    expect(prepareAttachment).toHaveBeenCalledWith(
      expect.objectContaining({
        leadId: "lead-whitespace",
        text: "pdf: brief.pdf"
      })
    );
  });

  it("sends one short processing message for grouped multi-file intake", async () => {
    const sendMessage = vi.fn();
    const createLead = vi.fn();
    const prepareAttachment = vi
      .fn()
      .mockResolvedValueOnce({
        kind: "pdf",
        fileName: "brief.pdf",
        storageProvider: "local",
        storageBucket: null,
        storageKey: "workspaces/default/leads/lead-active/brief.pdf",
        downloadUrl: null,
        mimeType: "application/pdf",
        sizeBytes: 123
      })
      .mockResolvedValueOnce({
        kind: "image",
        fileName: "site.jpg",
        storageProvider: "local",
        storageBucket: null,
        storageKey: "workspaces/default/leads/lead-active/site.jpg",
        downloadUrl: null,
        mimeType: "image/jpeg",
        sizeBytes: 456
      });
    const createPendingAttachmentDecision = vi.fn().mockReturnValue("pending-group");

    await handleTelegramUpdate(
      {
        update_id: 6,
        message: {
          message_id: 211,
          chat: { id: 111111 },
          from: { first_name: "Katya" },
          groupedAttachments: [
            {
              fileId: "file-1",
              uniqueId: "unique-1",
              kind: "pdf",
              fileName: "brief.pdf",
              mimeType: "application/pdf",
              sizeBytes: 123
            },
            {
              fileId: "file-2",
              uniqueId: "unique-2",
              kind: "image",
              fileName: "site.jpg",
              mimeType: "image/jpeg",
              sizeBytes: 456
            }
          ]
        }
      },
      {
        allowedChatIds: new Set([111111]),
        workspaceId: "default",
        activeLead: { id: "lead-active", name: "Active lead" },
        sendMessage,
        createLead,
        prepareAttachment,
        createPendingAttachmentDecision
      }
    );

    expect(sendMessage).toHaveBeenNthCalledWith(1, 111111, "reviewing the files, back shortly");
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(createLead).not.toHaveBeenCalled();
    expect(prepareAttachment).not.toHaveBeenCalled();
    expect(createPendingAttachmentDecision).toHaveBeenCalledWith({
      message: expect.objectContaining({ message_id: 211 }),
      activeLead: { id: "lead-active", name: "Active lead" }
    });
    expect(sendMessage).toHaveBeenLastCalledWith(
      111111,
      expect.stringContaining("Should I add these files to the active lead or create a new lead?"),
      {
        replyMarkup: {
          inline_keyboard: [
            [
              { text: "new lead", callback_data: "attachment_new:pending-group" },
              { text: "add to active", callback_data: "attachment_active:pending-group" }
            ],
            [{ text: "cancel", callback_data: "attachment_cancel:pending-group" }]
          ]
        }
      }
    );
  });

  it("adds a CRM button when a public CRM URL is configured", async () => {
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
        phone: null,
        budgetEur: null,
        dueAt: null,
        sourceMessageId: "301",
        evidence: { sourceMessageId: "301", author: "Katya", sourceChannel: "telegram", textSnippet: "New lead: Maria" }
      },
      actions: [{ type: "create_lead", risk: "auto", reason: "Low-risk CRM action.", payload: {} }]
    });
    const createLead = vi.fn().mockResolvedValue({ id: "lead-301", code: "L-2026-301", name: "Maria" });

    await handleTelegramUpdate(
      {
        update_id: 7,
        message: {
          message_id: 301,
          text: "New lead: Maria, private house",
          chat: { id: 111111 },
          from: { first_name: "Katya" }
        }
      },
      {
        allowedChatIds: new Set([111111]),
        workspaceId: "default",
        crmAppBaseUrl: "https://crm.example.com",
        sendMessage,
        orchestrate,
        createLead
      }
    );

    expect(sendMessage).toHaveBeenCalledWith(
      111111,
      expect.stringContaining("<blockquote expandable><b>Missing for offer</b>"),
      {
        replyMarkup: {
          inline_keyboard: [
            [
              { text: "undo", callback_data: "undo_lead:lead-301" },
              { text: "offer", callback_data: "offer_lead:lead-301" },
              { text: "CRM", web_app: { url: "https://crm.example.com/leads?leadId=L-2026-301" } }
            ]
          ]
        }
      }
    );
    expect(sendMessage).toHaveBeenCalledWith(111111, expect.stringContaining("<b>L-2026-301</b>"), expect.anything());
    expect(sendMessage).toHaveBeenCalledWith(111111, expect.stringContaining("<b>Maria  private_house</b>"), expect.anything());
    expect(sendMessage).toHaveBeenCalledWith(111111, expect.stringContaining("<blockquote expandable><b>Missing for offer</b>"), expect.anything());
  });

  it("keeps newly created lead names untruncated", async () => {
    const sendMessage = vi.fn();
    const longProjectType =
      "Architecture planning for a family house with garage, terrace, landscape concept, LP 3-4 commercial offer preparation, and later project supervision";
    const location = "Munich Obermenzing, Bavaria, with full client context from forwarded intake";
    const expectedName = `${longProjectType} - ${location}`;
    const orchestrate = vi.fn().mockResolvedValue({
      workspaceId: "default",
      normalizedText: "Create the lead from this forwarded request.",
      intent: "create_lead",
      risk: "auto",
      explanations: [],
      settings: DEFAULT_LANGGRAPH_SETTINGS,
      facts: {
        contactName: null,
        projectName: null,
        projectType: longProjectType,
        location,
        areaM2: null,
        phone: null,
        budgetEur: null,
        dueAt: null,
        sourceMessageId: "331",
        evidence: {
          sourceMessageId: "331",
          author: "Katya",
          sourceChannel: "telegram",
          textSnippet: "Create the lead from this forwarded request."
        }
      },
      actions: [{ type: "create_lead", risk: "auto", reason: "Low-risk CRM action.", payload: {} }]
    });
    const createLead = vi.fn().mockResolvedValue({ id: "lead-331", code: "L-2026-331", name: expectedName });

    await handleTelegramUpdate(
      {
        update_id: 71,
        message: {
          message_id: 331,
          text: "Create the lead from this forwarded request.",
          chat: { id: 111111 },
          from: { first_name: "Katya" }
        }
      },
      {
        allowedChatIds: new Set([111111]),
        workspaceId: "default",
        sendMessage,
        orchestrate,
        createLead
      }
    );

    expect(createLead).toHaveBeenCalledWith(expect.objectContaining({ name: expectedName }));
  });

  it("uses a callback CRM button for localhost CRM URLs", async () => {
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
        phone: null,
        budgetEur: null,
        dueAt: null,
        sourceMessageId: "303",
        evidence: { sourceMessageId: "303", author: "Katya", sourceChannel: "telegram", textSnippet: "New lead: Maria" }
      },
      actions: [{ type: "create_lead", risk: "auto", reason: "Low-risk CRM action.", payload: {} }]
    });
    const createLead = vi.fn().mockResolvedValue({ id: "lead-303", code: "L-2026-303", name: "Maria" });
    const listLeadDocuments = vi.fn().mockResolvedValue({ leadId: "lead-303", documents: [] });

    await handleTelegramUpdate(
      {
        update_id: 9,
        message: {
          message_id: 303,
          text: "New lead: Maria, private house",
          chat: { id: 111111 },
          from: { first_name: "Katya" }
        }
      },
      {
        allowedChatIds: new Set([111111]),
        workspaceId: "default",
        crmAppBaseUrl: "http://localhost:4900",
        sendMessage,
        orchestrate,
        createLead,
        listLeadDocuments
      }
    );

    expect(sendMessage).toHaveBeenCalledWith(
      111111,
      expect.stringContaining("<blockquote expandable><b>Missing for offer</b>"),
      {
        replyMarkup: {
          inline_keyboard: [
            [
              { text: "undo", callback_data: "undo_lead:lead-303" },
              { text: "offer", callback_data: "offer_lead:lead-303" },
              { text: "CRM", callback_data: "crm_lead:lead-303:L-2026-303" }
            ]
          ]
        }
      }
    );
  });

  it("uses a URL CRM button for public HTTP CRM URLs", async () => {
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
        phone: null,
        budgetEur: null,
        dueAt: null,
        sourceMessageId: "304",
        evidence: { sourceMessageId: "304", author: "Katya", sourceChannel: "telegram", textSnippet: "New lead: Maria" }
      },
      actions: [{ type: "create_lead", risk: "auto", reason: "Low-risk CRM action.", payload: {} }]
    });
    const createLead = vi.fn().mockResolvedValue({ id: "lead-304", code: "L-2026-304", name: "Maria" });

    await handleTelegramUpdate(
      {
        update_id: 10,
        message: {
          message_id: 304,
          text: "New lead: Maria, private house",
          chat: { id: 111111 },
          from: { first_name: "Katya" }
        }
      },
      {
        allowedChatIds: new Set([111111]),
        workspaceId: "default",
        crmAppBaseUrl: "http://204.168.163.99:3004",
        sendMessage,
        orchestrate,
        createLead
      }
    );

    expect(sendMessage).toHaveBeenCalledWith(
      111111,
      expect.stringContaining("<blockquote expandable><b>Missing for offer</b>"),
      {
        replyMarkup: {
          inline_keyboard: [
            [
              { text: "undo", callback_data: "undo_lead:lead-304" },
              { text: "offer", callback_data: "offer_lead:lead-304" },
              { text: "CRM", url: "http://204.168.163.99:3004/leads?leadId=L-2026-304" }
            ]
          ]
        }
      }
    );
    expect(sendMessage).not.toHaveBeenCalledWith(
      111111,
      "http://204.168.163.99:3004/leads?leadId=L-2026-304"
    );
  });

  it("answers localhost CRM callback buttons with a local lead URL", async () => {
    const sendMessage = vi.fn();

    await handleTelegramUpdate(
      {
        update_id: 10,
        callback_query: {
          id: "callback-1",
          data: "crm_lead:lead-303:L-2026-303",
          message: { chat: { id: 111111 }, message_id: 900 }
        }
      },
      {
        allowedChatIds: new Set([111111]),
        workspaceId: "default",
        crmAppBaseUrl: "http://localhost:4900",
        sendMessage
      }
    );

    expect(sendMessage).toHaveBeenCalledWith(
      111111,
      "http://localhost:4900/leads?leadId=L-2026-303"
    );
  });

  it("shows a clean compact intake summary without TG source boilerplate", async () => {
    const sendMessage = vi.fn();
    const createLead = vi.fn().mockResolvedValue({ id: "lead-clean", name: "Thomas Wachter" });
    const ingestLeadIntake = vi.fn().mockResolvedValue({
      documents: [],
      summary:
        "Lead intake summary\nSource: TG thread 410849134. Text: Thomas Wachter wants an interior apartment proposal and a Zoom follow-up. Files: no attachments.\nOriginal takes\n- Katya #77: raw message"
    });
    const orchestrate = vi.fn().mockResolvedValue({
      workspaceId: "default",
      normalizedText: "New lead Thomas Wachter interior apartment",
      intent: "create_lead",
      risk: "auto",
      explanations: [],
      settings: DEFAULT_LANGGRAPH_SETTINGS,
      facts: {
        contactName: "Thomas Wachter",
        projectName: null,
        projectType: "interior apartment",
        location: null,
        areaM2: null,
        phone: null,
        budgetEur: null,
        dueAt: null,
        sourceMessageId: "77",
        evidence: { sourceMessageId: "77", author: "Katya", sourceChannel: "telegram", textSnippet: "New lead Thomas" }
      },
      actions: [{ type: "create_lead", risk: "auto", reason: "Draft lead can be created.", payload: {} }]
    });

    await handleTelegramUpdate(
      {
        update_id: 77,
        message: {
          message_id: 77,
          text: "New lead Thomas Wachter interior apartment",
          chat: { id: 111111 },
          from: { first_name: "Katya" }
        }
      },
      {
        allowedChatIds: new Set([111111]),
        workspaceId: "default",
        sendMessage,
        orchestrate,
        createLead,
        ingestLeadIntake
      }
    );

    expect(sendMessage).toHaveBeenCalledWith(
      111111,
      expect.stringContaining("<blockquote><b>Summary</b> Thomas Wachter wants an interior apartment proposal and a Zoom follow-up.</blockquote>"),
      expect.anything()
    );
    expect(sendMessage).not.toHaveBeenCalledWith(111111, expect.stringContaining("Source: TG thread"), expect.anything());
  });

  it("shows one download inline and multiple downloads in an expandable drawer", async () => {
    const orchestrationResult = {
      workspaceId: "default",
      normalizedText: "New lead Maria private house",
      intent: "create_lead",
      risk: "auto",
      explanations: [],
      settings: DEFAULT_LANGGRAPH_SETTINGS,
      facts: {
        contactName: "Maria",
        projectName: null,
        projectType: "private house",
        location: null,
        areaM2: null,
        phone: null,
        budgetEur: null,
        dueAt: null,
        sourceMessageId: "78",
        evidence: { sourceMessageId: "78", author: "Katya", sourceChannel: "telegram", textSnippet: "New lead Maria" }
      },
      actions: [{ type: "create_lead", risk: "auto", reason: "Draft lead can be created.", payload: {} }]
    };
    const runWithDocuments = async (documents: unknown[]) => {
      const sendMessage = vi.fn();
      await handleTelegramUpdate(
        {
          update_id: 78,
          message: {
            message_id: 78,
            text: "New lead Maria private house",
            chat: { id: 111111 },
            from: { first_name: "Katya" }
          }
        },
        {
          allowedChatIds: new Set([111111]),
          workspaceId: "default",
          sendMessage,
          orchestrate: vi.fn().mockResolvedValue(orchestrationResult),
          createLead: vi.fn().mockResolvedValue({ id: "lead-docs", name: "Maria" }),
          listLeadDocuments: vi.fn().mockResolvedValue({ leadId: "lead-docs", documents })
        }
      );
      return sendMessage;
    };

    const oneDownload = await runWithDocuments([
      {
        id: "doc-1",
        fileName: "brief.pdf",
        shortSummary: "Permit package and project facts.",
        downloadUrl: null,
        mimeType: "application/pdf",
        createdAt: "2026-06-13T08:00:00.000Z"
      }
    ]);
    expect(oneDownload).toHaveBeenCalledWith(111111, expect.stringContaining("<b>Downloads</b>: PDF - Permit package and project facts."), expect.anything());
    expect(oneDownload).not.toHaveBeenCalledWith(111111, expect.stringContaining("<blockquote expandable><b>Downloads"), expect.anything());

    const twoDownloads = await runWithDocuments([
      { id: "doc-1", fileName: "brief.pdf", shortSummary: "Permit package.", downloadUrl: null, mimeType: "application/pdf" },
      { id: "doc-2", fileName: "plan.pdf", shortSummary: "Floor plans.", downloadUrl: null, mimeType: "application/pdf" }
    ]);
    expect(twoDownloads).toHaveBeenCalledWith(111111, expect.stringContaining("<blockquote expandable><b>Downloads: 2 items</b>"), expect.anything());
    expect(twoDownloads).toHaveBeenCalledWith(111111, expect.stringContaining("PDF 1 - Permit package.; PDF 2 - Floor plans."), expect.anything());

    const offerDownloads = await runWithDocuments([
      {
        id: "offer-2",
        fileName: "L-2026-003-commercial-offer-v2.docx",
        shortSummary: "Commercial offer v2 59.500 EUR gross",
        downloadUrl: "https://crm.example.com/offer-v2.docx",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      },
      {
        id: "offer-1",
        fileName: "L-2026-003-commercial-offer-v1.docx",
        shortSummary: "Commercial offer v1 58.000 EUR gross",
        downloadUrl: "https://crm.example.com/offer-v1.docx",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      }
    ]);
    expect(offerDownloads).toHaveBeenCalledWith(111111, expect.stringContaining('<a href="https://crm.example.com/offer-v2.docx">V2</a>'), expect.anything());
    expect(offerDownloads).toHaveBeenCalledWith(111111, expect.stringContaining('<a href="https://crm.example.com/offer-v1.docx">V1</a>'), expect.anything());
  });

  it("archives a created lead from the undo callback button", async () => {
    const sendMessage = vi.fn();
    const archiveLead = vi.fn().mockResolvedValue({});

    await handleTelegramUpdate(
      {
        update_id: 100,
        callback_query: {
          id: "callback-undo",
          data: "undo_lead:lead-303",
          message: { chat: { id: 111111 }, message_id: 902 }
        }
      },
      {
        allowedChatIds: new Set([111111]),
        workspaceId: "default",
        sendMessage,
        archiveLead
      }
    );

    expect(archiveLead).toHaveBeenCalledWith({ workspaceId: "default", leadId: "lead-303" });
    expect(sendMessage).toHaveBeenCalledWith(111111, "undone: lead-303");
  });

  it("answers full summary callback buttons with the long lead summary", async () => {
    const sendMessage = vi.fn();
    const searchLeads = vi.fn().mockResolvedValue({
      matches: [
        {
          id: "lead-404",
          code: "L-2026-404",
          name: "Thomas House",
          status: "new",
          score: 0.91,
          clientName: "Thomas Wachter",
          project: "Haus für Mutter in Bayern",
          area: "142",
          description: "Private house proposal.",
          interest: "hot",
          urgency: "warm",
          todo: "Prepare offer",
          address: "Bayern",
          messenger: "WhatsApp",
          summaryShort: "Client wants a compact private house proposal.",
          summaryLong: "Client wants a compact private house proposal with follow-up next week.",
          summaryUpdatedAt: "2026-06-11T09:00:00.000Z"
        }
      ]
    });

    await handleTelegramUpdate(
      {
        update_id: 101,
        callback_query: {
          id: "callback-summary",
          data: "summary_lead:lead-404",
          message: { chat: { id: 111111 }, message_id: 904 }
        }
      },
      {
        allowedChatIds: new Set([111111]),
        workspaceId: "default",
        crmAppBaseUrl: "http://localhost:4900",
        sendMessage,
        searchLeads
      }
    );

    expect(searchLeads).toHaveBeenCalledWith({ workspaceId: "default", query: "lead-404", limit: 1 });
    expect(sendMessage).toHaveBeenCalledWith(
      111111,
      expect.stringContaining("Client wants a compact private house proposal with follow-up next week."),
      expect.objectContaining({
        replyMarkup: {
          inline_keyboard: [
            [
              { text: "offer", callback_data: "offer_lead:lead-404" },
              { text: "CRM", callback_data: "crm_lead:lead-404:L-2026-404" }
            ]
          ]
        }
      })
    );
  });

  it("opens a Telegram downloads drawer for lead document files", async () => {
    const sendMessage = vi.fn();
    const listLeadDocuments = vi.fn().mockResolvedValue({
      leadId: "lead-404",
      documents: [
        {
          id: "doc-3",
          fileName: "L-2026-404-commercial-offer-v2.docx",
          shortSummary: "Commercial offer v2 59.500 EUR gross",
          longSummary: "Generated commercial offer v2.",
          downloadUrl: "https://crm.example.com/api/crm/storage/local/doc-3",
          mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          createdAt: "2026-06-12T06:10:00.000Z"
        },
        {
          id: "doc-2",
          fileName: "site-photo.jpg",
          shortSummary: "Site photo from TG.",
          downloadUrl: "https://crm.example.com/api/crm/storage/local/doc-2",
          mimeType: "image/jpeg",
          createdAt: "2026-06-12T06:05:00.000Z"
        },
        {
          id: "doc-1",
          fileName: "northwind-intake-card.pdf",
          shortSummary: "Client intake card with first project details.",
          longSummary: "Longer client intake summary.",
          downloadUrl: "https://crm.example.com/api/crm/storage/local/doc-1",
          mimeType: "application/pdf",
          createdAt: "2026-06-12T06:00:00.000Z"
        }
      ]
    });

    await handleTelegramUpdate(
      {
        update_id: 102,
        callback_query: {
          id: "callback-downloads",
          data: "downloads_lead:lead-404",
          message: { chat: { id: 111111 }, message_id: 905 }
        }
      },
      {
        allowedChatIds: new Set([111111]),
        workspaceId: "default",
        sendMessage,
        listLeadDocuments
      }
    );

    expect(listLeadDocuments).toHaveBeenCalledWith({ workspaceId: "default", leadId: "lead-404", limit: 8 });
    expect(sendMessage).toHaveBeenCalledWith(
      111111,
      expect.stringContaining('<b><a href="https://crm.example.com/api/crm/storage/local/doc-3">V2</a></b>'),
      {
        replyMarkup: {
          inline_keyboard: [
            [{ text: "V2", url: "https://crm.example.com/api/crm/storage/local/doc-3" }],
            [{ text: "picture", url: "https://crm.example.com/api/crm/storage/local/doc-2" }],
            [{ text: "PDF", url: "https://crm.example.com/api/crm/storage/local/doc-1" }],
          ]
        }
      }
    );
    expect(sendMessage).toHaveBeenCalledWith(
      111111,
      expect.stringContaining("description: Client intake card with first project details."),
      expect.anything()
    );
  });

  it("generates and sends a commercial offer from an offer callback button", async () => {
    const sendMessage = vi.fn();
    const sendDocument = vi.fn();
    const generateOffer = vi.fn().mockResolvedValue({
      fileName: "L-2026-003-commercial-offer.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      bytes: new Uint8Array([1, 2, 3]),
      caption: "commercial offer ready"
    });

    await handleTelegramUpdate(
      {
        update_id: 11,
        callback_query: {
          id: "callback-offer",
          data: "offer_lead:lead-303",
          message: { chat: { id: 111111 }, message_id: 901 }
        }
      },
      {
        allowedChatIds: new Set([111111]),
        workspaceId: "default",
        sendMessage,
        sendDocument,
        generateOffer
      }
    );

    expect(sendMessage).toHaveBeenCalledWith(111111, "generating offer, back shortly");
    expect(generateOffer).toHaveBeenCalledWith("lead-303");
    expect(sendDocument).toHaveBeenCalledWith(
      111111,
      expect.objectContaining({ fileName: "L-2026-003-commercial-offer.docx" })
    );
  });

  it("returns a clear offer template error from an offer callback button", async () => {
    const sendMessage = vi.fn();
    const sendDocument = vi.fn();
    const generateOffer = vi.fn().mockRejectedValue(new Error("Commercial offer template is not uploaded"));

    await handleTelegramUpdate(
      {
        update_id: 111,
        callback_query: {
          id: "callback-offer-template-error",
          data: "offer_lead:lead-303",
          message: { chat: { id: 111111 }, message_id: 901 }
        }
      },
      {
        allowedChatIds: new Set([111111]),
        workspaceId: "default",
        sendMessage,
        sendDocument,
        generateOffer
      }
    );

    expect(sendMessage).toHaveBeenCalledWith(111111, "generating offer, back shortly");
    expect(generateOffer).toHaveBeenCalledWith("lead-303");
    expect(sendMessage).toHaveBeenCalledWith(111111, "offer template is missing. add an offer template in CRM settings.");
    expect(sendDocument).not.toHaveBeenCalled();
  });

  it("uses replied lead cards as the target for Telegram lead updates", async () => {
    const sendMessage = vi.fn();
    const updateLead = vi.fn().mockResolvedValue({ id: "lead-303", name: "Maria" });
    const orchestrate = vi.fn().mockResolvedValue({
      workspaceId: "default",
      normalizedText: "phone is +491234567",
      intent: "update_lead",
      risk: "auto",
      explanations: ["Reply points to the lead card."],
      settings: DEFAULT_LANGGRAPH_SETTINGS,
      facts: {
        contactName: null,
        projectName: null,
        projectType: null,
        location: null,
        areaM2: null,
        phone: "+491234567",
        budgetEur: null,
        dueAt: null,
        sourceMessageId: "304",
        evidence: { sourceMessageId: "304", author: "Katya", sourceChannel: "telegram", textSnippet: "phone is +491234567" }
      },
      actions: [{ type: "update_lead", risk: "auto", reason: "Safe update to replied lead.", payload: {} }]
    });

    await handleTelegramUpdate(
      {
        update_id: 12,
        message: {
          message_id: 304,
          text: "phone is +491234567",
          chat: { id: 111111 },
          from: { first_name: "Katya" },
          reply_to_message: {
            message_id: 903,
            text: "LightCrm dry-run\nLead ID: lead-303\nIntake: saved 0 attachment(s) to Maria.",
            reply_markup: {
              inline_keyboard: [[{ text: "CRM", url: "http://204.168.163.99:3004/leads?leadId=lead-303" }]]
            }
          }
        }
      },
      {
        allowedChatIds: new Set([111111]),
        workspaceId: "default",
        crmAppBaseUrl: "http://localhost:4900",
        sendMessage,
        orchestrate,
        updateLead
      }
    );

    expect(orchestrate).toHaveBeenCalledWith(
      expect.objectContaining({
        recentLeads: [expect.objectContaining({ id: "lead-303" })]
      })
    );
    expect(updateLead).toHaveBeenCalledWith(
      expect.objectContaining({
        leadId: "lead-303",
        patch: expect.objectContaining({ phone: "+491234567" }),
        source: { channel: "telegram", messageId: "304" }
      })
    );
    expect(sendMessage).toHaveBeenCalledWith(
      111111,
      expect.stringContaining("<b>lead-303</b>"),
      expect.objectContaining({
        replyMarkup: expect.objectContaining({
          inline_keyboard: [
            [
              { text: "undo", callback_data: "undo_write:lead-303" },
              { text: "offer", callback_data: "offer_lead:lead-303" },
              { text: "CRM", callback_data: "crm_lead:lead-303" }
            ]
          ]
        })
      })
    );
  });

  it("executes semantic lead search and returns replyable lead cards", async () => {
    const sendMessage = vi.fn();
    const searchLeads = vi.fn().mockResolvedValue({
      matches: [
        {
          id: "lead-404",
          code: "L-2026-404",
          name: "Thomas House",
          status: "new",
          score: 0.91,
          clientName: "Thomas Wachter",
          project: "House for mother in Bayern",
          area: "142",
          description: "Private house proposal.",
          interest: "hot",
          urgency: "warm",
          todo: "Prepare offer",
          address: "Bayern",
          messenger: "WhatsApp",
          summaryShort: "Client wants a compact private house proposal.",
          summaryLong: "Client wants a compact private house proposal with follow-up next week.",
          summaryUpdatedAt: "2026-06-11T09:00:00.000Z"
        }
      ]
    });
    const orchestrate = vi.fn().mockResolvedValue({
      workspaceId: "default",
      normalizedText: "find Thomas House",
      intent: "search_leads",
      risk: "auto",
      explanations: ["The user wants to find a lead."],
      settings: DEFAULT_LANGGRAPH_SETTINGS,
      facts: {
        contactName: "Thomas",
        projectName: "Thomas House",
        projectType: null,
        location: null,
        areaM2: null,
        phone: null,
        budgetEur: null,
        dueAt: null,
        sourceMessageId: "404",
        evidence: { sourceMessageId: "404", author: "Katya", sourceChannel: "telegram", textSnippet: "find Thomas House" }
      },
      actions: [{ type: "search_leads", risk: "auto", reason: "Search requested.", payload: {} }]
    });

    await handleTelegramUpdate(
      {
        update_id: 13,
        message: {
          message_id: 404,
          text: "find Thomas House",
          chat: { id: 111111 },
          from: { first_name: "Katya" }
        }
      },
      {
        allowedChatIds: new Set([111111]),
        workspaceId: "default",
        crmAppBaseUrl: "http://localhost:4900",
        sendMessage,
        orchestrate,
        searchLeads
      }
    );

    expect(searchLeads).toHaveBeenCalledWith({ workspaceId: "default", query: "Thomas", limit: 5 });
    expect(sendMessage).toHaveBeenCalledWith(111111, "Found 1 lead(s) for: Thomas");
    expect(sendMessage).toHaveBeenCalledWith(
      111111,
      expect.stringContaining("<blockquote><b>Summary</b>"),
      {
        replyMarkup: {
          inline_keyboard: [
            [
              { text: "offer", callback_data: "offer_lead:lead-404" },
              { text: "CRM", callback_data: "crm_lead:lead-404:L-2026-404" }
            ]
          ]
        }
      }
    );
    expect(sendMessage).toHaveBeenCalledWith(111111, expect.stringContaining("Client wants a compact private house proposal.</blockquote>"), expect.anything());
    expect(sendMessage).toHaveBeenCalledWith(111111, expect.stringContaining("<b>Thomas Wachter  House for mother in Bayern</b>"), expect.anything());
    expect(sendMessage).toHaveBeenCalledWith(111111, expect.stringContaining("<i>Area</i>: 142 m²"), expect.anything());
    expect(sendMessage).toHaveBeenCalledWith(111111, expect.stringContaining("<i>Todo</i>: Prepare offer"), expect.anything());
    expect(sendMessage).not.toHaveBeenCalledWith(
      111111,
      expect.stringContaining("Full: Client wants a compact private house proposal"),
      expect.anything()
    );
    expect(sendMessage).toHaveBeenCalledWith(111111, expect.stringContaining("<b>L-2026-404</b>"), expect.anything());
  });

  it("creates a Telegram reminder and links it to a replied lead card", async () => {
    const sendMessage = vi.fn();
    const createReminder = vi.fn().mockResolvedValue({
      id: "reminder-1",
      title: "Call Thomas",
      dueAt: "2026-06-12T09:00:00.000Z"
    });
    const orchestrate = vi.fn().mockResolvedValue({
      workspaceId: "default",
      normalizedText: "remind me tomorrow to call Thomas",
      intent: "create_reminder",
      risk: "auto",
      explanations: ["The user asks to create a reminder."],
      settings: DEFAULT_LANGGRAPH_SETTINGS,
      facts: {
        contactName: "Thomas",
        projectName: null,
        projectType: null,
        location: null,
        areaM2: null,
        phone: null,
        budgetEur: null,
        dueAt: "2026-06-12T09:00:00.000Z",
        sourceMessageId: "405",
        evidence: {
          sourceMessageId: "405",
          author: "Katya",
          sourceChannel: "telegram",
          textSnippet: "remind me tomorrow to call Thomas"
        }
      },
      actions: [{ type: "create_reminder", risk: "auto", reason: "Reminder can be created.", payload: {} }]
    });

    const lead = await handleTelegramUpdate(
      {
        update_id: 14,
        message: {
          message_id: 405,
          text: "remind me tomorrow to call Thomas",
          chat: { id: 111111 },
          from: { first_name: "Katya" },
          reply_to_message: {
            message_id: 904,
            text: "Lead ID: lead-404\nName: Thomas House",
            reply_markup: {
              inline_keyboard: [[{ text: "CRM", callback_data: "crm_lead:lead-404" }]]
            }
          }
        }
      },
      {
        allowedChatIds: new Set([111111]),
        workspaceId: "default",
        sendMessage,
        orchestrate,
        createReminder
      }
    );

    expect(lead).toEqual({ id: "lead-404", name: "replied lead" });
    expect(createReminder).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "default",
        leadId: "lead-404",
        title: "Thomas",
        dueAt: "2026-06-12T09:00:00.000Z",
        sourceChannel: "telegram"
      })
    );
    expect(sendMessage).toHaveBeenCalledWith(
      111111,
      expect.stringContaining("Reminder created")
    );
  });

  it("normalizes local reminder datetimes before sending them to CRM", async () => {
    const sendMessage = vi.fn();
    const createReminder = vi.fn().mockResolvedValue({
      id: "reminder-local",
      title: "Bayern plot",
      dueAt: "2026-08-25T08:00:00.000Z"
    });
    const orchestrate = vi.fn().mockResolvedValue({
      workspaceId: "default",
      normalizedText: "remind me 25 August 2026 at 10:00 to collect Bayern plot info",
      intent: "create_reminder",
      risk: "auto",
      explanations: ["The user asks to create a reminder."],
      settings: DEFAULT_LANGGRAPH_SETTINGS,
      facts: {
        contactName: "Thomas Vater",
        projectName: null,
        projectType: null,
        location: "Bayern",
        areaM2: null,
        phone: null,
        budgetEur: null,
        dueAt: "2026-08-25T10:00:00",
        sourceMessageId: "406",
        evidence: {
          sourceMessageId: "406",
          author: "Katya",
          sourceChannel: "telegram",
          textSnippet: "remind me 25 August 2026 at 10:00 to collect Bayern plot info"
        }
      },
      actions: [{ type: "create_reminder", risk: "auto", reason: "Reminder can be created.", payload: {} }]
    });

    await handleTelegramUpdate(
      {
        update_id: 141,
        message: {
          message_id: 406,
          text: "remind me 25 August 2026 at 10:00 to collect Bayern plot info",
          chat: { id: 111111 },
          from: { first_name: "Katya" }
        }
      },
      {
        allowedChatIds: new Set([111111]),
        workspaceId: "default",
        sendMessage,
        orchestrate,
        createReminder
      }
    );

    expect(createReminder).toHaveBeenCalledWith(
      expect.objectContaining({
        dueAt: "2026-08-25T08:00:00.000Z"
      })
    );
    expect(sendMessage).toHaveBeenCalledWith(111111, expect.stringContaining("Reminder created"));
  });

  it("creates a lead and links a secondary reminder to that new lead", async () => {
    const sendMessage = vi.fn();
    const createLead = vi.fn().mockResolvedValue({ id: "lead-500", name: "Country house" });
    const createReminder = vi.fn().mockResolvedValue({
      id: "reminder-500",
      title: "Country house",
      dueAt: "2026-06-25T09:00:00.000Z"
    });
    const orchestrate = vi.fn().mockResolvedValue({
      workspaceId: "default",
      normalizedText: "new lead for a country house and remind me in two weeks",
      intent: "create_lead",
      risk: "auto",
      explanations: ["The message contains lead intake and a reminder request."],
      settings: DEFAULT_LANGGRAPH_SETTINGS,
      facts: {
        contactName: null,
        projectName: null,
        projectType: "Country house",
        location: null,
        areaM2: null,
        phone: null,
        budgetEur: null,
        dueAt: "2026-06-25T09:00:00.000Z",
        sourceMessageId: "500",
        evidence: {
          sourceMessageId: "500",
          author: "Katya",
          sourceChannel: "telegram",
          textSnippet: "new lead for a country house and remind me in two weeks"
        }
      },
      actions: [
        { type: "create_lead", risk: "auto", reason: "Draft lead can be created.", payload: {} },
        { type: "create_reminder", risk: "auto", reason: "Reminder can be created.", payload: {} }
      ]
    });

    const lead = await handleTelegramUpdate(
      {
        update_id: 15,
        message: {
          message_id: 500,
          text: "new lead for a country house and remind me in two weeks",
          chat: { id: 111111 },
          from: { first_name: "Katya" }
        }
      },
      {
        allowedChatIds: new Set([111111]),
        workspaceId: "default",
        crmAppBaseUrl: "http://localhost:4900",
        sendMessage,
        orchestrate,
        createLead,
        createReminder
      }
    );

    expect(lead).toEqual({ id: "lead-500", name: "Country house" });
    expect(createReminder).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "default",
        leadId: "lead-500",
        dueAt: "2026-06-25T09:00:00.000Z",
        sourceChannel: "telegram"
      })
    );
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith(
      111111,
      expect.stringContaining("Reminder: reminder-500 at 2026-06-25T09:00:00.000Z"),
      expect.objectContaining({
        replyMarkup: {
          inline_keyboard: [
            [
              { text: "undo", callback_data: "undo_lead:lead-500" },
              { text: "offer", callback_data: "offer_lead:lead-500" },
              { text: "CRM", callback_data: "crm_lead:lead-500" }
            ]
          ]
        }
      })
    );
    expect(sendMessage).toHaveBeenCalledWith(111111, expect.stringContaining("<b>Country house</b>"), expect.anything());
  });

  it("creates a calendar event from a meeting action", async () => {
    const sendMessage = vi.fn();
    const createCalendarEvent = vi.fn().mockResolvedValue({
      id: "event-1",
      title: "Zoom with Thomas Wachter",
      startsAt: "2026-06-18T14:00:00.000Z",
      endsAt: "2026-06-18T15:00:00.000Z"
    });
    const orchestrate = vi.fn().mockResolvedValue({
      workspaceId: "default",
      normalizedText: "Add Zoom with Thomas Wachter on 18 June 2026 at 16:00",
      intent: "create_meeting",
      risk: "auto",
      explanations: ["The user asks to create a calendar event."],
      settings: DEFAULT_LANGGRAPH_SETTINGS,
      facts: {
        contactName: "Thomas Wachter",
        projectName: null,
        projectType: null,
        location: "Zoom",
        areaM2: null,
        phone: null,
        budgetEur: null,
        dueAt: "2026-06-18T16:00:00",
        sourceMessageId: "501",
        evidence: {
          sourceMessageId: "501",
          author: "Katya",
          sourceChannel: "telegram",
          textSnippet: "Add Zoom with Thomas Wachter on 18 June 2026 at 16:00"
        }
      },
      actions: [{ type: "create_meeting", risk: "auto", reason: "Calendar event can be created.", payload: {} }]
    });

    await handleTelegramUpdate(
      {
        update_id: 151,
        message: {
          message_id: 501,
          text: "Add Zoom with Thomas Wachter on 18 June 2026 at 16:00",
          chat: { id: 111111 },
          from: { first_name: "Katya" }
        }
      },
      {
        allowedChatIds: new Set([111111]),
        workspaceId: "default",
        sendMessage,
        orchestrate,
        createCalendarEvent
      }
    );

    expect(createCalendarEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "default",
        title: "Thomas Wachter",
        startsAt: "2026-06-18T14:00:00.000Z",
        endsAt: "2026-06-18T15:00:00.000Z"
      })
    );
    expect(sendMessage).toHaveBeenCalledWith(111111, expect.stringContaining("Calendar event created"));
  });

  it("resumes a pending meeting clarification when the next message names the lead", async () => {
    const sendMessage = vi.fn().mockResolvedValue({ message_id: 585 });
    const createCalendarEvent = vi.fn().mockResolvedValue({
      id: "event-584",
      title: "Thomas Wachter",
      startsAt: "2026-06-19T12:00:00.000Z",
      endsAt: "2026-06-19T13:00:00.000Z"
    });
    const searchLeads = vi.fn().mockResolvedValue({
      matches: [{ id: "lead-wachter", code: "L-2026-008", name: "Thomas Wachter", score: 0.93 }]
    });
    const pendingClarifications = new Map<string, PendingClarification>();
    const createPendingClarification = vi.fn((input) => {
      pendingClarifications.set("111111", input);
      return "pending-meeting";
    });
    const takePendingClarification = vi.fn(() => pendingClarifications.get("111111") ?? null);
    const orchestrate = vi.fn().mockResolvedValueOnce({
      workspaceId: "default",
      normalizedText: "We can meet around 2pm on friday.",
      intent: "create_meeting",
      risk: "review",
      explanations: ["For which client or lead should I schedule the meeting mentioned in the message?"],
      settings: DEFAULT_LANGGRAPH_SETTINGS,
      facts: {
        contactName: null,
        projectName: null,
        projectType: null,
        location: null,
        areaM2: null,
        phone: null,
        budgetEur: null,
        dueAt: "Friday 14:00",
        sourceMessageId: "584",
        evidence: { sourceMessageId: "584", author: "Oleg", sourceChannel: "telegram", textSnippet: "We can meet" }
      },
      actions: [
        {
          type: "request_review",
          risk: "review",
          reason: "For which client or lead should I schedule the meeting mentioned in the message?",
          payload: {}
        }
      ]
    });

    await handleTelegramUpdate(
      {
        update_id: 584,
        message: {
          message_id: 584,
          date: 1781344560,
          text: "We can meet around 2pm on friday. Write me in Telegram, share there the details",
          chat: { id: 111111 },
          from: { first_name: "Oleg" }
        }
      },
      {
        allowedChatIds: new Set([111111]),
        workspaceId: "default",
        sendMessage,
        orchestrate,
        searchLeads,
        createCalendarEvent,
        createPendingClarification,
        takePendingClarification
      }
    );

    const lead = await handleTelegramUpdate(
      {
        update_id: 586,
        message: {
          message_id: 586,
          date: 1781344620,
          text: "This is for Thomas watcher",
          chat: { id: 111111 },
          from: { first_name: "Oleg" }
        }
      },
      {
        allowedChatIds: new Set([111111]),
        workspaceId: "default",
        sendMessage,
        orchestrate,
        searchLeads,
        createCalendarEvent,
        createPendingClarification,
        takePendingClarification
      }
    );

    expect(lead).toEqual({ id: "lead-wachter", name: "Thomas Wachter" });
    expect(orchestrate).toHaveBeenCalledTimes(1);
    expect(searchLeads).toHaveBeenCalledWith({ workspaceId: "default", query: "Thomas watcher", limit: 5 });
    expect(createCalendarEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "default",
        leadId: "lead-wachter",
        title: "Thomas Wachter",
        startsAt: "2026-06-19T12:00:00.000Z",
        endsAt: "2026-06-19T13:00:00.000Z"
      })
    );
  });

  it("uses a reply to the original WhatsApp message as meeting context when the reply names the lead", async () => {
    const sendMessage = vi.fn();
    const createCalendarEvent = vi.fn().mockResolvedValue({
      id: "event-reply",
      title: "Thomas Wachter",
      startsAt: "2026-06-19T12:00:00.000Z",
      endsAt: "2026-06-19T13:00:00.000Z"
    });
    const searchLeads = vi.fn().mockResolvedValue({
      matches: [{ id: "lead-wachter", code: "L-2026-008", name: "Thomas Wachter", score: 0.93 }]
    });
    const orchestrate = vi.fn().mockResolvedValue({
      workspaceId: "default",
      normalizedText: "This is for Thomas watcher\n\nReplied message: We can meet around 2pm on friday.",
      intent: "create_meeting",
      risk: "auto",
      explanations: ["The reply supplies the lead target for the meeting request."],
      settings: DEFAULT_LANGGRAPH_SETTINGS,
      facts: {
        contactName: "Thomas Wachter",
        projectName: null,
        projectType: null,
        location: null,
        areaM2: null,
        phone: null,
        budgetEur: null,
        dueAt: "Friday 14:00",
        sourceMessageId: "590",
        evidence: { sourceMessageId: "590", author: "Oleg", sourceChannel: "telegram", textSnippet: "This is for Thomas watcher" }
      },
      actions: [{ type: "create_meeting", risk: "auto", reason: "Meeting can be created.", payload: {} }]
    });

    const lead = await handleTelegramUpdate(
      {
        update_id: 590,
        message: {
          message_id: 590,
          date: 1781344920,
          text: "This is for Thomas watcher",
          chat: { id: 111111 },
          from: { first_name: "Oleg" },
          reply_to_message: {
            message_id: 584,
            text: "We can meet around 2pm on friday. Write me in Telegram, share there the details"
          }
        }
      },
      {
        allowedChatIds: new Set([111111]),
        workspaceId: "default",
        sendMessage,
        orchestrate,
        searchLeads,
        createCalendarEvent
      }
    );

    expect(lead).toEqual({ id: "lead-wachter", name: "Thomas Wachter" });
    expect(orchestrate).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining("Replied message: We can meet around 2pm on friday") })
    );
    expect(searchLeads).toHaveBeenCalledWith({ workspaceId: "default", query: "Thomas watcher", limit: 5 });
    expect(createCalendarEvent).toHaveBeenCalledWith(
      expect.objectContaining({ leadId: "lead-wachter", startsAt: "2026-06-19T12:00:00.000Z" })
    );
  });

  it("links a secondary calendar event to a newly created lead", async () => {
    const sendMessage = vi.fn();
    const createLead = vi.fn().mockResolvedValue({ id: "lead-501", name: "Thomas Wachter" });
    const createCalendarEvent = vi.fn().mockResolvedValue({
      id: "event-501",
      title: "Thomas Wachter",
      startsAt: "2026-06-18T14:00:00.000Z",
      endsAt: "2026-06-18T15:00:00.000Z"
    });
    const orchestrate = vi.fn().mockResolvedValue({
      workspaceId: "default",
      normalizedText: "New client Thomas Wachter and add Zoom on 18 June 2026 at 16:00",
      intent: "create_lead",
      risk: "auto",
      explanations: ["The message contains lead intake and a calendar request."],
      settings: DEFAULT_LANGGRAPH_SETTINGS,
      facts: {
        contactName: "Thomas Wachter",
        projectName: null,
        projectType: "interior apartment",
        location: "Munich",
        areaM2: 100,
        phone: null,
        budgetEur: null,
        dueAt: "2026-06-18T16:00:00",
        sourceMessageId: "502",
        evidence: {
          sourceMessageId: "502",
          author: "Katya",
          sourceChannel: "telegram",
          textSnippet: "New client Thomas Wachter and add Zoom on 18 June 2026 at 16:00"
        }
      },
      actions: [
        { type: "create_lead", risk: "auto", reason: "Draft lead can be created.", payload: {} },
        { type: "create_meeting", risk: "auto", reason: "Calendar event can be created.", payload: {} }
      ]
    });

    const lead = await handleTelegramUpdate(
      {
        update_id: 152,
        message: {
          message_id: 502,
          text: "New client Thomas Wachter and add Zoom on 18 June 2026 at 16:00",
          chat: { id: 111111 },
          from: { first_name: "Katya" }
        }
      },
      {
        allowedChatIds: new Set([111111]),
        workspaceId: "default",
        crmAppBaseUrl: "http://localhost:4900",
        sendMessage,
        orchestrate,
        createLead,
        createCalendarEvent
      }
    );

    expect(lead).toEqual({ id: "lead-501", name: "Thomas Wachter" });
    expect(createCalendarEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "default",
        leadId: "lead-501",
        startsAt: "2026-06-18T14:00:00.000Z"
      })
    );
    expect(sendMessage).toHaveBeenCalledWith(111111, expect.stringContaining("<i>Calendar</i>: Thomas Wachter - <b>18.06.2026, 16:00</b>"), expect.anything());
  });

  it("asks before attaching attachment-only intake to the active lead", async () => {
    const sendMessage = vi.fn();
    const createLead = vi.fn();
    const prepareAttachment = vi.fn();
    const createPendingAttachmentDecision = vi.fn().mockReturnValue("pending-1");

    const lead = await handleTelegramUpdate(
      {
        update_id: 8,
        message: {
          message_id: 302,
          chat: { id: 111111 },
          from: { first_name: "Katya" },
          document: {
            file_id: "file-extra",
            file_unique_id: "unique-extra",
            file_name: "extra.pdf",
            mime_type: "application/pdf",
            file_size: 123
          }
        }
      },
      {
        allowedChatIds: new Set([111111]),
        workspaceId: "default",
        crmAppBaseUrl: "http://localhost:4900",
        activeLead: { id: "lead-active", name: "Active lead" },
        sendMessage,
        createLead,
        prepareAttachment,
        createPendingAttachmentDecision
      }
    );

    expect(lead).toBeNull();
    expect(createLead).not.toHaveBeenCalled();
    expect(prepareAttachment).not.toHaveBeenCalled();
    expect(createPendingAttachmentDecision).toHaveBeenCalledWith({
      message: expect.objectContaining({ message_id: 302 }),
      activeLead: { id: "lead-active", name: "Active lead" }
    });
    expect(sendMessage).toHaveBeenCalledWith(
      111111,
      expect.stringContaining("Should I add these files to the active lead or create a new lead?"),
      {
        replyMarkup: {
          inline_keyboard: [
            [
              { text: "new lead", callback_data: "attachment_new:pending-1" },
              { text: "add to active", callback_data: "attachment_active:pending-1" }
            ],
            [{ text: "cancel", callback_data: "attachment_cancel:pending-1" }]
          ]
        }
      }
    );
  });

  it("attaches pending attachment-only intake to the active lead after explicit callback choice", async () => {
    const sendMessage = vi.fn();
    const createLead = vi.fn();
    const prepareAttachment = vi.fn().mockResolvedValue({
      kind: "pdf",
      fileName: "extra.pdf",
      storageProvider: "local",
      storageBucket: null,
      storageKey: "workspaces/default/leads/lead-active/extra.pdf",
      downloadUrl: null,
      mimeType: "application/pdf",
      sizeBytes: 123
    });
    const pendingMessage = {
      message_id: 302,
      chat: { id: 111111 },
      from: { first_name: "Katya" },
      document: {
        file_id: "file-extra",
        file_unique_id: "unique-extra",
        file_name: "extra.pdf",
        mime_type: "application/pdf",
        file_size: 123
      }
    };
    const takePendingAttachmentDecision = vi.fn().mockReturnValue({
      message: pendingMessage,
      activeLead: { id: "lead-active", name: "Active lead" }
    });

    const lead = await handleTelegramUpdate(
      {
        update_id: 9,
        callback_query: {
          id: "callback-attach-active",
          data: "attachment_active:pending-1",
          message: { chat: { id: 111111 }, message_id: 901 }
        }
      },
      {
        allowedChatIds: new Set([111111]),
        workspaceId: "default",
        crmAppBaseUrl: "http://localhost:4900",
        sendMessage,
        createLead,
        prepareAttachment,
        takePendingAttachmentDecision
      }
    );

    expect(lead).toEqual({ id: "lead-active", name: "Active lead" });
    expect(takePendingAttachmentDecision).toHaveBeenCalledWith("pending-1");
    expect(createLead).not.toHaveBeenCalled();
    expect(prepareAttachment).toHaveBeenCalledWith(expect.objectContaining({ leadId: "lead-active" }));
  });

  it("creates a new lead from pending attachment-only intake after explicit callback choice", async () => {
    const sendMessage = vi.fn();
    const createLead = vi.fn().mockResolvedValue({ id: "lead-new", name: "Draft lead" });
    const prepareAttachment = vi.fn().mockResolvedValue({
      kind: "pdf",
      fileName: "new-project.pdf",
      storageProvider: "local",
      storageBucket: null,
      storageKey: "workspaces/default/leads/lead-new/new-project.pdf",
      downloadUrl: null,
      mimeType: "application/pdf",
      sizeBytes: 123
    });
    const pendingMessage = {
      message_id: 303,
      chat: { id: 111111 },
      from: { first_name: "Katya" },
      document: {
        file_id: "file-new-project",
        file_unique_id: "unique-new-project",
        file_name: "new-project.pdf",
        mime_type: "application/pdf",
        file_size: 123
      }
    };
    const takePendingAttachmentDecision = vi.fn().mockReturnValue({
      message: pendingMessage,
      activeLead: { id: "lead-active", name: "Active lead" }
    });

    const lead = await handleTelegramUpdate(
      {
        update_id: 10,
        callback_query: {
          id: "callback-new-lead",
          data: "attachment_new:pending-2",
          message: { chat: { id: 111111 }, message_id: 902 }
        }
      },
      {
        allowedChatIds: new Set([111111]),
        workspaceId: "default",
        crmAppBaseUrl: "http://localhost:4900",
        sendMessage,
        createLead,
        prepareAttachment,
        takePendingAttachmentDecision
      }
    );

    expect(lead).toEqual({ id: "lead-new", name: "Draft lead" });
    expect(takePendingAttachmentDecision).toHaveBeenCalledWith("pending-2");
    expect(createLead).toHaveBeenCalled();
    expect(prepareAttachment).toHaveBeenCalledWith(expect.objectContaining({ leadId: "lead-new" }));
    expect(prepareAttachment).not.toHaveBeenCalledWith(expect.objectContaining({ leadId: "lead-active" }));
  });

  it("uses the active lead as context for text plus attachment follow-ups", async () => {
    const sendMessage = vi.fn();
    const createLead = vi.fn();
    const prepareAttachment = vi.fn().mockResolvedValue({
      kind: "pdf",
      fileName: "follow-up.pdf",
      storageProvider: "local",
      storageBucket: null,
      storageKey: "workspaces/default/leads/lead-active/follow-up.pdf",
      downloadUrl: null,
      mimeType: "application/pdf",
      sizeBytes: 123
    });
    const orchestrate = vi.fn().mockResolvedValue({
      workspaceId: "default",
      normalizedText: "this is also for the same project",
      intent: "add_lead_note",
      risk: "review",
      explanations: ["The user is adding context to the active lead."],
      settings: DEFAULT_LANGGRAPH_SETTINGS,
      facts: {
        contactName: null,
        projectName: null,
        projectType: null,
        location: null,
        areaM2: null,
        phone: null,
        budgetEur: null,
        dueAt: null,
        sourceMessageId: "406",
        evidence: {
          sourceMessageId: "406",
          author: "Katya",
          sourceChannel: "telegram",
          textSnippet: "this is also for the same project"
        }
      },
      actions: [{ type: "request_review", risk: "review", reason: "Needs review, but files can stay with active lead.", payload: {} }]
    });

    const lead = await handleTelegramUpdate(
      {
        update_id: 15,
        message: {
          message_id: 406,
          text: "this is also for the same project",
          chat: { id: 111111 },
          from: { first_name: "Katya" },
          document: {
            file_id: "file-follow-up",
            file_unique_id: "unique-follow-up",
            file_name: "follow-up.pdf",
            mime_type: "application/pdf",
            file_size: 123
          }
        }
      },
      {
        allowedChatIds: new Set([111111]),
        workspaceId: "default",
        crmAppBaseUrl: "http://localhost:4900",
        activeLead: { id: "lead-active", name: "Active lead" },
        sendMessage,
        orchestrate,
        createLead,
        prepareAttachment
      }
    );

    expect(lead).toEqual({ id: "lead-active", name: "Active lead" });
    expect(orchestrate).toHaveBeenCalledWith(
      expect.objectContaining({
        recentLeads: [expect.objectContaining({ id: "lead-active", label: "Active lead" })]
      })
    );
    expect(createLead).not.toHaveBeenCalled();
    expect(prepareAttachment).toHaveBeenCalledWith(expect.objectContaining({ leadId: "lead-active" }));
    expect(sendMessage).toHaveBeenCalledWith(
      111111,
      expect.stringContaining("<blockquote expandable><b>Missing for offer</b>"),
      {
        replyMarkup: {
          inline_keyboard: [
            [
              { text: "offer", callback_data: "offer_lead:lead-active" },
              { text: "CRM", callback_data: "crm_lead:lead-active" }
            ]
          ]
        }
      }
    );
  });

  it("saves text-only follow-ups to the active lead intake without creating a new lead", async () => {
    const sendMessage = vi.fn();
    const createLead = vi.fn();
    const ingestLeadIntake = vi.fn().mockResolvedValue({ documents: [], summary: "Client prefers the smaller house." });
    const orchestrate = vi.fn().mockResolvedValue({
      workspaceId: "default",
      normalizedText: "client prefers the smaller house",
      intent: "add_lead_note",
      risk: "review",
      explanations: ["The message adds context to the active lead."],
      settings: DEFAULT_LANGGRAPH_SETTINGS,
      facts: {
        contactName: null,
        projectName: null,
        projectType: null,
        location: null,
        areaM2: null,
        phone: null,
        budgetEur: null,
        dueAt: null,
        sourceMessageId: "408",
        evidence: {
          sourceMessageId: "408",
          author: "Katya",
          sourceChannel: "telegram",
          textSnippet: "client prefers the smaller house"
        }
      },
      actions: [{ type: "request_review", risk: "review", reason: "A note can be reviewed later.", payload: {} }]
    });

    const lead = await handleTelegramUpdate(
      {
        update_id: 17,
        message: {
          message_id: 408,
          text: "client prefers the smaller house",
          chat: { id: 111111 },
          from: { first_name: "Katya" }
        }
      },
      {
        allowedChatIds: new Set([111111]),
        workspaceId: "default",
        crmAppBaseUrl: "http://localhost:4900",
        activeLead: { id: "lead-active", name: "Active lead" },
        sendMessage,
        orchestrate,
        createLead,
        ingestLeadIntake
      }
    );

    expect(lead).toEqual({ id: "lead-active", name: "Active lead" });
    expect(createLead).not.toHaveBeenCalled();
    expect(ingestLeadIntake).toHaveBeenCalledWith({
      workspaceId: "default",
      leadId: "lead-active",
      sourceChannel: "telegram",
      sourceThreadId: "111111",
      sourceMessageId: "408",
      textItems: [{ sourceMessageId: "408", author: "Katya", text: "client prefers the smaller house" }],
      attachments: []
    });
    expect(sendMessage).toHaveBeenCalledWith(
      111111,
      expect.stringContaining("<blockquote expandable><b>Missing for offer</b>"),
      {
        replyMarkup: {
          inline_keyboard: [
            [
              { text: "offer", callback_data: "offer_lead:lead-active" },
              { text: "CRM", callback_data: "crm_lead:lead-active" }
            ]
          ]
        }
      }
    );
  });

  it("still creates a new lead when semantic orchestration says text plus attachments are a new lead", async () => {
    const sendMessage = vi.fn();
    const createLead = vi.fn().mockResolvedValue({ id: "lead-new", name: "New project" });
    const prepareAttachment = vi.fn().mockResolvedValue({
      kind: "pdf",
      fileName: "new-project.pdf",
      storageProvider: "local",
      storageBucket: null,
      storageKey: "workspaces/default/leads/lead-new/new-project.pdf",
      downloadUrl: null,
      mimeType: "application/pdf",
      sizeBytes: 123
    });
    const orchestrate = vi.fn().mockResolvedValue({
      workspaceId: "default",
      normalizedText: "new lead with another project",
      intent: "create_lead",
      risk: "auto",
      explanations: ["The user explicitly starts a new lead."],
      settings: DEFAULT_LANGGRAPH_SETTINGS,
      facts: {
        contactName: null,
        projectName: "New project",
        projectType: null,
        location: null,
        areaM2: null,
        phone: null,
        budgetEur: null,
        dueAt: null,
        sourceMessageId: "407",
        evidence: {
          sourceMessageId: "407",
          author: "Katya",
          sourceChannel: "telegram",
          textSnippet: "new lead with another project"
        }
      },
      actions: [{ type: "create_lead", risk: "auto", reason: "New lead requested.", payload: {} }]
    });

    const lead = await handleTelegramUpdate(
      {
        update_id: 16,
        message: {
          message_id: 407,
          text: "new lead with another project",
          chat: { id: 111111 },
          from: { first_name: "Katya" },
          document: {
            file_id: "file-new",
            file_unique_id: "unique-new",
            file_name: "new-project.pdf",
            mime_type: "application/pdf",
            file_size: 123
          }
        }
      },
      {
        allowedChatIds: new Set([111111]),
        workspaceId: "default",
        activeLead: { id: "lead-active", name: "Active lead" },
        sendMessage,
        orchestrate,
        createLead,
        prepareAttachment
      }
    );

    expect(lead).toEqual({ id: "lead-new", name: "New project" });
    expect(createLead).toHaveBeenCalledWith(expect.objectContaining({ name: "New project" }));
    expect(prepareAttachment).toHaveBeenCalledWith(expect.objectContaining({ leadId: "lead-new" }));
    expect(prepareAttachment).not.toHaveBeenCalledWith(expect.objectContaining({ leadId: "lead-active" }));
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
      summary: "Obernsees development property",
      longSummary: "The file contains a visible development-property brief.",
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
    expect(form.get("summary")).toBe("Obernsees development property");
    expect(form.get("longSummary")).toBe("The file contains a visible development-property brief.");
    expect(form.get("file")).toBeInstanceOf(File);
    expect(attachment).toMatchObject({
      kind: "pdf",
      fileName: "brief.pdf",
      storageProvider: "local",
      storageKey: "workspaces/default/leads/lead-1/brief.pdf",
      summary: "Obernsees development property",
      longSummary: "The file contains a visible development-property brief."
    });
  });
});
