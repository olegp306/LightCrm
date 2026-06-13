import { describe, expect, it } from "vitest";
import { createCrmService, MemoryCrmRepository } from "./index";

describe("createCrmService", () => {
  const currentYear = new Date().getFullYear();

  it("upserts a client and records an audit log", async () => {
    const repository = new MemoryCrmRepository();
    const crm = createCrmService(repository);

    const client = await crm.upsertClient({
      workspaceId: "workspace-1",
      name: "Ada Lovelace",
      email: "ada@example.com"
    });

    expect(client.id).toMatch(/^client_/);
    expect(client.code).toBe(`C-${currentYear}-001`);
    expect(client.status).toBe("active");
    expect(client.email).toBe("ada@example.com");

    const auditLogs = await repository.listAuditLogs("workspace-1");
    expect(auditLogs).toHaveLength(1);
    expect(auditLogs[0]).toMatchObject({
      action: "client.upsert",
      entity: "client",
      entityId: client.id
    });
  });

  it("assigns yearly business codes to new clients and leads", async () => {
    const repository = new MemoryCrmRepository();
    const crm = createCrmService(repository);

    const firstClient = await crm.upsertClient({ workspaceId: "workspace-1", name: "First Client" });
    const secondClient = await crm.upsertClient({ workspaceId: "workspace-1", name: "Second Client" });
    const firstLead = await crm.upsertLead({ workspaceId: "workspace-1", name: "First Lead" });

    expect(firstClient.code).toBe(`C-${currentYear}-001`);
    expect(secondClient.code).toBe(`C-${currentYear}-002`);
    expect(firstLead.code).toBe(`L-${currentYear}-001`);
  });

  it("keeps a lead business code when updating the record", async () => {
    const repository = new MemoryCrmRepository();
    const crm = createCrmService(repository);
    const lead = await crm.upsertLead({ workspaceId: "workspace-1", name: "Lead One" });

    const updated = await crm.upsertLead({
      id: lead.id,
      workspaceId: "workspace-1",
      name: "Lead One Updated",
      status: "qualified"
    });

    expect(updated.code).toBe(lead.code);
    expect(updated.name).toBe("Lead One Updated");
  });

  it("updates an existing lead without losing existing client linkage", async () => {
    const repository = new MemoryCrmRepository();
    const crm = createCrmService(repository);
    const client = await crm.upsertClient({ workspaceId: "workspace-1", name: "Client One" });
    const lead = await crm.upsertLead({
      workspaceId: "workspace-1",
      clientId: client.id,
      name: "Lead One",
      email: "lead@example.com"
    });

    const updated = await crm.upsertLead({
      id: lead.id,
      workspaceId: "workspace-1",
      name: "Lead One Updated",
      status: "qualified"
    });

    expect(updated.clientId).toBe(client.id);
    expect(updated.name).toBe("Lead One Updated");
    expect(updated.status).toBe("qualified");
  });

  it("creates and links a client when saving a lead with unique contact details", async () => {
    const repository = new MemoryCrmRepository();
    const crm = createCrmService(repository);

    const lead = await crm.upsertLeadWithClientResolution({
      workspaceId: "workspace-1",
      name: "Maria House",
      email: "Maria@Example.COM ",
      phone: "+49 123 456",
      company: "Private house"
    });

    expect(lead.clientId).toBeTruthy();
    const clients = await crm.listRecords({ workspaceId: "workspace-1", entity: "client" });
    expect(clients).toHaveLength(1);
    expect(clients[0]).toMatchObject({
      id: lead.clientId,
      name: "Maria House",
      email: "Maria@Example.COM ",
      phone: "+49 123 456",
      company: "Private house"
    });
  });

  it("links a lead to an existing client by normalized email without overwriting filled client fields", async () => {
    const repository = new MemoryCrmRepository();
    const crm = createCrmService(repository);
    const client = await crm.upsertClient({
      workspaceId: "workspace-1",
      name: "Existing Maria",
      email: "maria@example.com",
      phone: "+49 111",
      company: "Existing company"
    });

    const lead = await crm.upsertLeadWithClientResolution({
      workspaceId: "workspace-1",
      name: "New Maria Request",
      email: " MARIA@example.com ",
      phone: "+49 222",
      company: "New project"
    });

    expect(lead.clientId).toBe(client.id);
    const storedClient = await repository.get("client", client.id);
    expect(storedClient).toMatchObject({
      name: "Existing Maria",
      email: "maria@example.com",
      phone: "+49 111",
      company: "Existing company"
    });
  });

  it("fills empty fields on a matched client without replacing existing values", async () => {
    const repository = new MemoryCrmRepository();
    const crm = createCrmService(repository);
    const client = await crm.upsertClient({
      workspaceId: "workspace-1",
      name: "Phone Client",
      phone: "+49 123456"
    });

    const lead = await crm.upsertLeadWithClientResolution({
      workspaceId: "workspace-1",
      name: "Phone request",
      email: "phone@example.com",
      phone: "+49 (123) 456",
      company: "Phone company"
    });

    expect(lead.clientId).toBe(client.id);
    const storedClient = await repository.get("client", client.id);
    expect(storedClient).toMatchObject({
      email: "phone@example.com",
      phone: "+49 123456",
      company: "Phone company"
    });
  });

  it("does not auto-link a lead when email and phone match different clients", async () => {
    const repository = new MemoryCrmRepository();
    const crm = createCrmService(repository);
    const emailClient = await crm.upsertClient({
      workspaceId: "workspace-1",
      name: "Email Client",
      email: "shared@example.com"
    });
    const phoneClient = await crm.upsertClient({
      workspaceId: "workspace-1",
      name: "Phone Client",
      phone: "+49 777"
    });

    const lead = await crm.upsertLeadWithClientResolution({
      workspaceId: "workspace-1",
      name: "Conflicting lead",
      email: "shared@example.com",
      phone: "+49 777"
    });

    expect(lead.clientId).toBeNull();
    expect(await repository.get("client", emailClient.id)).toMatchObject({ name: "Email Client" });
    expect(await repository.get("client", phoneClient.id)).toMatchObject({ name: "Phone Client" });
    const auditLogs = await repository.listAuditLogs("workspace-1");
    expect(auditLogs.find((log) => log.action === "lead.clientResolutionConflict")).toMatchObject({
      entity: "lead",
      metadata: expect.objectContaining({
        clientIds: expect.arrayContaining([emailClient.id, phoneClient.id])
      })
    });
  });

  it("links a lead to a client through the service layer", async () => {
    const repository = new MemoryCrmRepository();
    const crm = createCrmService(repository);
    const client = await crm.upsertClient({ workspaceId: "workspace-1", name: "Client One" });
    const lead = await crm.upsertLead({ workspaceId: "workspace-1", name: "Lead One" });

    const linked = await crm.linkLeadToClient({
      workspaceId: "workspace-1",
      leadId: lead.id,
      clientId: client.id
    });

    expect(linked.clientId).toBe(client.id);
    const auditLogs = await repository.listAuditLogs("workspace-1");
    expect(auditLogs.at(-1)).toMatchObject({
      action: "lead.linkClient",
      entity: "lead",
      entityId: lead.id
    });
  });

  it("archives records instead of deleting them", async () => {
    const repository = new MemoryCrmRepository();
    const crm = createCrmService(repository);
    const target = await crm.upsertColdTarget({ workspaceId: "workspace-1", name: "Outbound Contact" });

    const archived = await crm.archiveRecord({
      workspaceId: "workspace-1",
      entity: "coldTarget",
      id: target.id
    });

    expect(archived.archivedAt).toBeInstanceOf(Date);
    expect(archived.status).toBe("archived");
  });

  it("lists active records for table screens without archived rows", async () => {
    const repository = new MemoryCrmRepository();
    const crm = createCrmService(repository);
    const active = await crm.upsertClient({ workspaceId: "workspace-1", name: "Active Client" });
    const archived = await crm.upsertClient({ workspaceId: "workspace-1", name: "Archived Client" });
    await crm.archiveRecord({ workspaceId: "workspace-1", entity: "client", id: archived.id });

    await crm.upsertClient({ workspaceId: "other-workspace", name: "Other Workspace" });

    await expect(crm.listRecords({ workspaceId: "workspace-1", entity: "client" })).resolves.toEqual([active]);
  });

  it("upserts a document file linked to a lead", async () => {
    const repository = new MemoryCrmRepository();
    const crm = createCrmService(repository);
    const lead = await crm.upsertLead({ workspaceId: "workspace-1", name: "Lead With Docs" });

    const file = await crm.upsertDocumentFile({
      workspaceId: "workspace-1",
      leadId: lead.id,
      fileName: "brief.pdf",
      shortSummary: "Initial project brief",
      longSummary: "Detailed project brief created from the incoming request.",
      downloadUrl: "https://files.example/brief.pdf",
      storageProvider: "s3",
      storageBucket: "photo-studios",
      storageKey: "leads/brief.pdf"
    });

    expect(file.id).toMatch(/^doc_/);
    expect(file.leadId).toBe(lead.id);
    expect(file.shortSummary).toBe("Initial project brief");
    await expect(crm.listRecords({ workspaceId: "workspace-1", entity: "documentFile" })).resolves.toEqual([file]);
  });

  it("ingests a lead intake bundle with text and attachments", async () => {
    const repository = new MemoryCrmRepository();
    const crm = createCrmService(repository);
    const lead = await crm.upsertLead({ workspaceId: "workspace-1", name: "Lead With Intake" });

    const intake = await crm.ingestLeadIntake({
      workspaceId: "workspace-1",
      leadId: lead.id,
      sourceChannel: "telegram",
      sourceThreadId: "763604722",
      sourceMessageId: "901",
      textItems: [
        {
          sourceMessageId: "901",
          author: "Katya",
          text: "Клиент хочет дом 140 м2 в Швейцарии, нужно быстро собрать КП."
        }
      ],
      attachments: [
        {
          sourceMessageId: "902",
          kind: "pdf",
          fileName: "brief.pdf",
          storageProvider: "s3",
          storageBucket: "photo-studios",
          storageKey: "leads/lead-1/brief.pdf",
          downloadUrl: "https://files.example/brief.pdf",
          mimeType: "application/pdf",
          sizeBytes: 204800,
          summary: "PDF brief with project requirements"
        },
        {
          sourceMessageId: "903",
          kind: "voice",
          fileName: "voice.ogg",
          storageProvider: "s3",
          storageBucket: "photo-studios",
          storageKey: "leads/lead-1/voice.ogg",
          mimeType: "audio/ogg",
          sizeBytes: 32768
        }
      ]
    });

    expect(intake.lead.id).toBe(lead.id);
    expect(intake.summary).toContain("Source: TG thread 763604722.");
    expect(intake.summary).toContain("Клиент хочет дом 140 м2");
    expect(intake.summary).toContain("2 attachment(s)");
    expect(intake.summary).toContain("[pdf, voice]");
    expect(intake.summary).toContain("brief.pdf (pdf; PDF brief with project requirements)");
    expect(intake.leadSummary).toMatchObject({
      leadId: lead.id,
      source: "telegram"
    });
    expect(intake.leadSummary.shortSummary).toContain("Source: TG thread 763604722.");
    expect(intake.documents).toHaveLength(2);
    expect(intake.documents[0]).toMatchObject({
      leadId: lead.id,
      fileName: "brief.pdf",
      shortSummary: "PDF brief with project requirements"
    });
    expect(intake.documents[1]).toMatchObject({
      fileName: "voice.ogg",
      shortSummary: "Voice attached to lead intake"
    });

    const updatedLead = await repository.get("lead", lead.id);
    expect(updatedLead?.notes).toContain("Lead intake summary");
    expect(updatedLead?.notes).toContain("Original takes");
    expect(updatedLead?.notes).toContain("brief.pdf");
    expect(updatedLead?.notes).toContain("pdf #902: brief.pdf - PDF brief with project requirements");
    const summaries = await crm.listRecords({ workspaceId: "workspace-1", entity: "leadSummary" });
    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({
      id: intake.leadSummary.id,
      leadId: lead.id,
      source: "telegram"
    });

    const auditLogs = await repository.listAuditLogs("workspace-1");
    expect(auditLogs.find((log) => log.action === "lead.intakeIngest")).toMatchObject({
      action: "lead.intakeIngest",
      entity: "lead",
      entityId: lead.id
    });
  });

  it("undoes a lead intake by archiving its latest summary and removing the notes block", async () => {
    const repository = new MemoryCrmRepository();
    const crm = createCrmService(repository);
    const lead = await crm.upsertLead({ workspaceId: "workspace-1", name: "Active lead" });
    await crm.upsertLead({
      ...lead,
      workspaceId: "workspace-1",
      id: lead.id,
      phone: "+491711234567",
      externalMessageId: "901"
    });

    const intake = await crm.ingestLeadIntake({
      workspaceId: "workspace-1",
      leadId: lead.id,
      sourceChannel: "telegram",
      sourceThreadId: "763604722",
      sourceMessageId: "901",
      textItems: [{ sourceMessageId: "901", author: "Katya", text: "Wrongly attached note" }],
      attachments: [
        {
          sourceMessageId: "901",
          kind: "pdf",
          fileName: "wrong.pdf",
          storageProvider: "local",
          storageKey: "leads/lead-1/wrong.pdf",
          mimeType: "application/pdf",
          sizeBytes: 1200,
          summary: "Wrong attachment"
        }
      ]
    });
    const leadWithUpdateMarker = await repository.get("lead", lead.id);
    await repository.save("lead", {
      ...leadWithUpdateMarker!,
      notes: `${leadWithUpdateMarker!.notes}\n\nRaw input: Wrongly attached note\n\nUpdated from telegram message 901.`
    });

    const undone = await crm.undoLeadIntake({
      workspaceId: "workspace-1",
      leadId: lead.id,
      sourceMessageId: "901"
    });

    expect(undone.lead.id).toBe(lead.id);
    expect(undone.archivedDocumentIds).toEqual([intake.documents[0]?.id]);
    expect(undone.archivedSummaryIds).toEqual([intake.leadSummary.id]);
    expect(undone.lead.phone).toBeNull();
    expect(undone.lead.notes ?? "").not.toContain("Wrongly attached note");
    expect(undone.lead.notes ?? "").not.toContain("Updated from telegram message 901.");
    expect(undone.lead.notes ?? "").not.toContain("Lead intake summary");

    const documents = await crm.listRecords({ workspaceId: "workspace-1", entity: "documentFile", includeArchived: true });
    expect(documents[0]?.archivedAt).toBeInstanceOf(Date);
    const summaries = await crm.listRecords({ workspaceId: "workspace-1", entity: "leadSummary", includeArchived: true });
    expect(summaries[0]?.archivedAt).toBeInstanceOf(Date);
    const auditLogs = await repository.listAuditLogs("workspace-1");
    expect(auditLogs.find((log) => log.action === "lead.intakeUndo")).toMatchObject({
      entity: "lead",
      entityId: lead.id,
      metadata: expect.objectContaining({ restoredFields: expect.arrayContaining(["phone"]) })
    });
  });

  it("summarizes all active lead documents when later intake adds files", async () => {
    const repository = new MemoryCrmRepository();
    const crm = createCrmService(repository);
    const lead = await crm.upsertLead({ workspaceId: "workspace-1", name: "Lead With Multiple Intake Files" });

    await crm.ingestLeadIntake({
      workspaceId: "workspace-1",
      leadId: lead.id,
      sourceChannel: "telegram",
      sourceThreadId: "763604722",
      sourceMessageId: "901",
      attachments: [
        {
          sourceMessageId: "901",
          kind: "image",
          fileName: "concept.jpg",
          storageProvider: "local",
          storageKey: "leads/lead-1/concept.jpg",
          mimeType: "image/jpeg",
          sizeBytes: 1200,
          summary: "Concept image with a compact house."
        }
      ]
    });

    const second = await crm.ingestLeadIntake({
      workspaceId: "workspace-1",
      leadId: lead.id,
      sourceChannel: "telegram",
      sourceThreadId: "763604722",
      sourceMessageId: "902",
      attachments: [
        {
          sourceMessageId: "902",
          kind: "pdf",
          fileName: "plans.pdf",
          storageProvider: "local",
          storageKey: "leads/lead-1/plans.pdf",
          mimeType: "application/pdf",
          sizeBytes: 2400,
          summary: "Planning PDF with room schedule."
        }
      ]
    });

    expect(second.summary).toContain("2 attachment(s)");
    expect(second.summary).toContain("concept.jpg (image; Concept image with a compact house.)");
    expect(second.summary).toContain("plans.pdf (pdf; Planning PDF with room schedule.)");
    expect(second.leadSummary.longSummary).toContain("2 attachment(s)");
    expect(second.leadSummary.longSummary).toContain("concept.jpg");
    expect(second.leadSummary.longSummary).toContain("plans.pdf");
  });
});
