import type { UpsertClientInput, UpsertLeadInput } from "@lightcrm/core";

export type LeadCsvRow = Record<string, string | undefined>;

export type LeadCsvMapping = {
  client: UpsertClientInput;
  lead: UpsertLeadInput;
};

function text(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function status(value: string | undefined): UpsertLeadInput["status"] {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "qualified" || normalized === "lost" || normalized === "converted" || normalized === "contacted") {
    return normalized;
  }
  return "new";
}

export function mapLeadCsvRow(row: LeadCsvRow, workspaceId: string, index: number): LeadCsvMapping {
  const clientName = text(row.Client) ?? text(row["Lead name"]) ?? `CSV Client ${index + 1}`;
  const clientId = text(row["Client ID"]) ?? `csv_client_${index + 1}`;
  const leadId = text(row["Lead ID"]) ?? `csv_lead_${index + 1}`;
  const leadName = text(row["Lead name"]) ?? text(row.Project) ?? clientName;
  const notes = [
    text(row.Project) ? `Project: ${text(row.Project)}` : null,
    text(row.Area) ? `Area: ${text(row.Area)}` : null,
    text(row.Description) ? `Description: ${text(row.Description)}` : null,
    text(row.Interest) ? `Interest: ${text(row.Interest)}` : null,
    text(row.Urgency) ? `Urgency: ${text(row.Urgency)}` : null,
    text(row.Todo) ? `Todo: ${text(row.Todo)}` : null,
    text(row.Address) ? `Address: ${text(row.Address)}` : null,
    text(row["Client projects"]) ? `Client projects: ${text(row["Client projects"])}` : null,
    text(row["Budget EUR"]) ? `Budget EUR: ${text(row["Budget EUR"])}` : null,
    text(row["Raw input"]) ? `Raw input: ${text(row["Raw input"])}` : null,
    text(row["Missing data"]) ? `Missing data: ${text(row["Missing data"])}` : null,
    text(row["Desired start"]) ? `Desired start: ${text(row["Desired start"])}` : null
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    client: {
      id: clientId,
      workspaceId,
      name: clientName,
      email: text(row.Email),
      phone: text(row.Phone),
      whatsapp: text(row.Messenger),
      company: text(row.Project),
      status: "active",
      notes: notes || null,
      sourceChannel: text(row.Source)
    },
    lead: {
      id: leadId,
      workspaceId,
      clientId,
      name: leadName,
      email: text(row.Email),
      phone: text(row.Phone),
      whatsapp: text(row.Messenger),
      company: text(row.Project),
      status: status(row.Status),
      sourceChannel: text(row.Source),
      externalThreadId: text(row["Project ID"]),
      externalMessageId: text(row["Lead ID"]),
      notes: notes || null
    }
  };
}
