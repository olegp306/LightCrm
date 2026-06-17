import { createCrmService } from "@lightcrm/core";
import { getPrismaClient } from "./client";
import { createPrismaCrmRepository } from "./prisma-repository";

const workspaceId = process.env.LIGHTCRM_WORKSPACE_ID ?? "default";

const prisma = getPrismaClient();
const crm = createCrmService(createPrismaCrmRepository(prisma));

async function main() {
  const ada = await crm.upsertClient({
    id: "seed_client_ada",
    workspaceId,
    name: "Ada Lovelace",
    company: "Analytical Studio",
    email: "ada@example.com",
    phone: "+33 600 000 001",
    whatsapp: "+33 600 000 001",
    status: "active",
    sourceChannel: "referral",
    notes: "Prefers WhatsApp"
  });

  await crm.upsertClient({
    id: "seed_client_grace",
    workspaceId,
    name: "Grace Hopper",
    company: "Compiler Works",
    email: "grace@example.com",
    phone: "+33 600 000 002",
    status: "warm",
    sourceChannel: "website",
    notes: "Interested in June rollout"
  });

  const lead = await crm.upsertLead({
    id: "seed_lead_nora",
    workspaceId,
    clientId: ada.id,
    name: "Nora Prospect",
    company: "Northwind",
    email: "nora@example.com",
    status: "qualified",
    notes: "Asked for pricing"
  });

  const target = await crm.upsertColdTarget({
    id: "seed_cold_maya",
    workspaceId,
    code: "T-2026-001",
    name: "Maya Ops",
    company: "Bright Supply",
    role: "COO",
    email: "maya@example.com",
    linkedinUrl: "linkedin.com/in/maya",
    status: "queued",
    source: "manual research",
    notesResearch: "Manual research notes for the outbound target.",
    archivedLetters: "Initial intro letter draft."
  });

  await crm.createOutreachTouch({
    workspaceId,
    coldTargetId: target.id,
    channel: "email",
    direction: "outbound",
    subject: "Intro email",
    body: "Short intro and value proposition",
    occurredAt: new Date("2026-06-05T09:30:00.000Z"),
    outcome: "Opened"
  });

  await crm.upsertReminder({
    id: "seed_reminder_northwind",
    workspaceId,
    leadId: lead.id,
    title: "Follow up with Northwind",
    dueAt: new Date("2026-06-06T16:00:00.000Z"),
    status: "open",
    sourceChannel: "manual"
  });

  await crm.upsertCalendarEvent({
    id: "seed_event_northwind_intro",
    workspaceId,
    leadId: lead.id,
    title: "Northwind intro call",
    startsAt: new Date("2026-06-09T09:00:00.000Z"),
    endsAt: new Date("2026-06-09T10:00:00.000Z"),
    location: "Google Meet",
    syncStatus: "local"
  });

  await crm.upsertDocumentFile({
    id: "seed_doc_northwind_brief",
    workspaceId,
    leadId: lead.id,
    clientId: ada.id,
    fileName: "northwind-brief.pdf",
    shortSummary: "Initial project brief",
    longSummary: "Detailed intake brief for the Northwind lead, linked to the client and lead records.",
    downloadUrl: "https://example.com/download/northwind-brief.pdf",
    storageProvider: process.env.STORAGE_PROVIDER ?? "s3",
    storageBucket: process.env.S3_BUCKET ?? "photo-studios",
    storageKey: "leads/seed_lead_nora/northwind-brief.pdf",
    mimeType: "application/pdf",
    sizeBytes: 204800
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
    console.log(`Seeded LightCrm workspace "${workspaceId}".`);
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
