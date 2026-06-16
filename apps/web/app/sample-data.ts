import type { ArchiveRecordEntity, CreateRecordConfig, CrmTableColumn, CrmTableRow } from "@lightcrm/ui";

export type TableDefinition = {
  title: string;
  description: string;
  columns: CrmTableColumn[];
  rows: CrmTableRow[];
  tableKey?: string;
  archiveEntity?: ArchiveRecordEntity;
  createRecord?: CreateRecordConfig;
};

export const tables: Record<string, TableDefinition> = {
  clients: {
    title: "Clients",
    description: "Warm and confirmed relationships with contact context.",
    archiveEntity: "client",
    columns: [
      { id: "code", title: "Client ID", width: 120, mobilePriority: 1 },
      { id: "name", title: "Name", width: 190, mobilePriority: 1 },
      { id: "company", title: "Company", width: 180, mobilePriority: 2 },
      { id: "email", title: "Email", width: 230, mobilePriority: 3 },
      { id: "phone", title: "Phone", width: 150, mobilePriority: 4 },
      { id: "status", title: "Status", width: 120, mobilePriority: 5 },
      { id: "sourceChannel", title: "Source", width: 140, defaultVisible: false },
      { id: "notes", title: "Notes", width: 260, mobilePriority: 6 }
    ],
    createRecord: {
      endpoint: "/api/crm/clients/upsert",
      workspaceId: "default",
      fields: [
        { id: "name", label: "Name", required: true },
        { id: "company", label: "Company" },
        { id: "email", label: "Email" },
        { id: "phone", label: "Phone" },
        { id: "notes", label: "Notes", multiline: true }
      ]
    },
    rows: [
      { id: "1", values: { code: "C-2026-001", name: "Ada Lovelace", company: "Analytical Studio", email: "ada@example.com", phone: "+33 600 000 001", status: "active", sourceChannel: "referral", notes: "Prefers WhatsApp" } },
      { id: "2", values: { code: "C-2026-002", name: "Grace Hopper", company: "Compiler Works", email: "grace@example.com", phone: "+33 600 000 002", status: "warm", sourceChannel: "website", notes: "Interested in June rollout" } }
    ]
  },
  leads: {
    title: "Leads",
    description: "Potential opportunities, optionally linked to client records.",
    tableKey: "leads.v8",
    archiveEntity: "lead",
    columns: [
      { id: "code", title: "Lead ID", width: 120, mobilePriority: 1 },
      { id: "client.name", title: "Client", width: 190, mobilePriority: 2, group: "Client" },
      { id: "projectName", title: "Lead name", width: 230, mobilePriority: 3 },
      { id: "area", title: "Area", width: 120, mobilePriority: 4, valueKind: "area" },
      { id: "description", title: "Description", width: 280, mobilePriority: 5, valueKind: "longText" },
      { id: "interest", title: "Interest", width: 120, mobilePriority: 6 },
      { id: "urgency", title: "Urgency", width: 120, mobilePriority: 7 },
      { id: "todo", title: "Todo", width: 180 },
      { id: "ballSide", title: "Ball", width: 96, valueKind: "handoff" },
      { id: "address", title: "Address", width: 210 },
      { id: "client.phone", title: "Phone", width: 150, group: "Client" },
      { id: "client.email", title: "Email", width: 230, group: "Client" },
      { id: "messenger", title: "Messenger", width: 150 },
      { id: "sourceChannel", title: "Source", width: 140 },
      { id: "summaryShort", title: "Summary", width: 240, valueKind: "longText", defaultVisible: false },
      { id: "summaryLong", title: "Full summary", width: 360, valueKind: "longText", defaultVisible: false },
      { id: "summaryUpdatedAt", title: "Summary updated", width: 170, defaultVisible: false },
      { id: "documents", title: "Documents", width: 300, valueKind: "documents" },
      { id: "calendar", title: "Calendar", width: 260, valueKind: "calendar" }
    ],
    createRecord: {
      endpoint: "/api/crm/leads/upsert",
      workspaceId: "default",
      payloadMap: {
        "client.name": "name",
        "client.phone": "phone",
        "client.email": "email",
        projectName: "company"
      },
      noteFields: {
        projectName: "Project",
        area: "Area",
        description: "Description",
        interest: "Interest",
        urgency: "Urgency",
        todo: "Todo",
        ballSide: "Ball side",
        address: "Address"
      },
      fields: [
        { id: "client.name", label: "Client", required: true },
        { id: "projectName", label: "Lead name" },
        { id: "area", label: "Area" },
        { id: "description", label: "Description", multiline: true },
        { id: "client.phone", label: "Phone" },
        { id: "client.email", label: "Email" },
        { id: "address", label: "Address" },
        { id: "todo", label: "Todo" }
      ]
    },
    rows: [
      {
        id: "1",
        values: {
          "client.name": "Ada Lovelace",
          project: "Northwind house",
          calendar: [
            {
              id: "sample-event-northwind",
              kind: "event",
              title: "Northwind intro call",
              startsAt: "2026-06-09T09:00:00.000Z",
              endsAt: "2026-06-09T10:00:00.000Z",
              status: "local",
              sourceChannel: "crm"
            }
          ],
          area: "140 m2",
          projectName: "Northwind house",
          description: "Planning request",
          interest: "hot",
          urgency: "June",
          todo: "Send KP",
          ballSide: "us",
          address: "Birkenfeld",
          "client.phone": "+33 600 000 001",
          "client.email": "ada@example.com",
          messenger: "TG",
          sourceChannel: "telegram",
          documents: [
            {
              id: "sample-doc-1",
              fileName: "northwind-brief.pdf",
              shortSummary: "Initial project brief",
              longSummary: "Detailed request brief extracted from the first lead intake documents.",
              downloadUrl: "https://example.com/download/brief.pdf",
              mimeType: "application/pdf",
              sizeBytes: 204800
            },
            {
              id: "sample-doc-2",
              fileName: "budget-table.xlsx",
              shortSummary: "Budget table",
              longSummary: "Early budget estimate spreadsheet.",
              downloadUrl: "https://example.com/download/budget.xlsx",
              mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
              sizeBytes: 78400
            }
          ]
        }
      },
      {
        id: "2",
        values: {
          "client.name": "Ivan Buyer",
          projectName: "Blue Market apartment",
          description: "Needs follow-up",
          interest: "warm",
          todo: "Clarify area",
          messenger: "WhatsApp",
          sourceChannel: "referral"
        }
      }
    ]
  },
  coldTargets: {
    title: "Cold Targets",
    description: "Outbound people and companies before a warmer relationship exists.",
    archiveEntity: "coldTarget",
    columns: [
      { id: "name", title: "Name", width: 190, mobilePriority: 1 },
      { id: "company", title: "Company", width: 180 },
      { id: "role", title: "Role", width: 180 },
      { id: "email", title: "Email", width: 230 },
      { id: "linkedinUrl", title: "LinkedIn", width: 220 },
      { id: "status", title: "Status", width: 130, mobilePriority: 2 }
    ],
    createRecord: {
      endpoint: "/api/crm/cold-targets/upsert",
      workspaceId: "default",
      fields: [
        { id: "name", label: "Name", required: true },
        { id: "company", label: "Company" },
        { id: "role", label: "Role" },
        { id: "email", label: "Email" },
        { id: "linkedinUrl", label: "LinkedIn" }
      ]
    },
    rows: [
      { id: "1", values: { name: "Maya Ops", company: "Bright Supply", role: "COO", email: "maya@example.com", linkedinUrl: "linkedin.com/in/maya", status: "queued" } },
      { id: "2", values: { name: "Leo Founder", company: "Small SaaS", role: "Founder", email: "leo@example.com", linkedinUrl: "linkedin.com/in/leo", status: "new" } }
    ]
  },
  storage: {
    title: "Storage",
    description: "Document register for client and lead files stored in Cloudflare R2.",
    tableKey: "storage.v1",
    archiveEntity: "documentFile",
    columns: [
      { id: "shortSummary", title: "Summary", width: 220, mobilePriority: 1 },
      { id: "longSummary", title: "Full summary", width: 360, mobilePriority: 2 },
      { id: "downloadUrl", title: "Download", width: 280, mobilePriority: 3, valueKind: "link" },
      { id: "relatedLabel", title: "Linked to", width: 220, mobilePriority: 4 },
      { id: "relatedHref", title: "Open link", width: 180, mobilePriority: 5, valueKind: "link" },
      { id: "fileName", title: "File name", width: 220, mobilePriority: 6 },
      { id: "storageProvider", title: "Provider", width: 110, defaultVisible: false },
      { id: "storageBucket", title: "Bucket", width: 160, defaultVisible: false },
      { id: "storageKey", title: "Storage key", width: 280, defaultVisible: false },
      { id: "mimeType", title: "MIME type", width: 160, defaultVisible: false },
      { id: "sizeBytes", title: "Size", width: 110, defaultVisible: false }
    ],
    rows: [
      {
        id: "1",
        values: {
          shortSummary: "Initial project brief",
          longSummary: "Detailed request brief extracted from the first lead intake documents.",
          downloadUrl: "https://example.com/download/brief.pdf",
          relatedLabel: "Northwind house",
          relatedHref: "/leads?record=1",
          fileName: "brief.pdf",
          storageProvider: "s3",
          storageBucket: "photo-studios",
          storageKey: "leads/1/brief.pdf",
          mimeType: "application/pdf",
          sizeBytes: 204800
        }
      }
    ]
  },
  outreach: {
    title: "Outreach",
    description: "Contact history across cold targets, leads, and clients.",
    columns: [
      { id: "subject", title: "Subject", width: 220 },
      { id: "channel", title: "Channel", width: 130 },
      { id: "direction", title: "Direction", width: 130 },
      { id: "related", title: "Related record", width: 200 },
      { id: "occurredAt", title: "Occurred", width: 170 },
      { id: "outcome", title: "Outcome", width: 220 }
    ],
    rows: [
      { id: "1", values: { subject: "Intro email", channel: "email", direction: "outbound", related: "Maya Ops", occurredAt: "2026-06-05 09:30", outcome: "Opened" } },
      { id: "2", values: { subject: "Pricing question", channel: "whatsapp", direction: "inbound", related: "Nora Prospect", occurredAt: "2026-06-05 13:10", outcome: "Reply needed" } }
    ]
  },
  calendar: {
    title: "Calendar",
    description: "Events stored in CRM now, external sync later.",
    columns: [
      { id: "title", title: "Title", width: 220 },
      { id: "startsAt", title: "Starts", width: 170 },
      { id: "endsAt", title: "Ends", width: 170 },
      { id: "related", title: "Related record", width: 200 },
      { id: "location", title: "Location", width: 180 },
      { id: "syncStatus", title: "Sync", width: 130 }
    ],
    rows: [
      { id: "1", values: { title: "Northwind intro call", startsAt: "2026-06-09 09:00", endsAt: "2026-06-09 10:00", related: "Nora Prospect", location: "Google Meet", syncStatus: "local" } },
      { id: "2", values: { title: "Client onboarding", startsAt: "2026-06-10 14:00", endsAt: "2026-06-10 15:00", related: "Grace Hopper", location: "Zoom", syncStatus: "local" } }
    ]
  },
  today: {
    title: "Today",
    description: "Operational queue for reminders and scheduled work.",
    archiveEntity: "reminder",
    columns: [
      { id: "title", title: "Task", width: 260 },
      { id: "dueAt", title: "Due", width: 170 },
      { id: "related", title: "Related record", width: 200 },
      { id: "status", title: "Status", width: 130 },
      { id: "sourceChannel", title: "Source", width: 150 }
    ],
    rows: [
      { id: "1", values: { title: "Follow up with Northwind", dueAt: "2026-06-06 16:00", related: "Nora Prospect", status: "open", sourceChannel: "manual" } },
      { id: "2", values: { title: "Send onboarding notes", dueAt: "2026-06-06 18:00", related: "Grace Hopper", status: "open", sourceChannel: "calendar" } }
    ]
  }
};
