import { describe, expect, it } from "vitest";
import { createCrmService, MemoryCrmRepository } from "./index";

describe("createCrmService", () => {
  it("upserts a client and records an audit log", async () => {
    const repository = new MemoryCrmRepository();
    const crm = createCrmService(repository);

    const client = await crm.upsertClient({
      workspaceId: "workspace-1",
      name: "Ada Lovelace",
      email: "ada@example.com"
    });

    expect(client.id).toMatch(/^client_/);
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
});
