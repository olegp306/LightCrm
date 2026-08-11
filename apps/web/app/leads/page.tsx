import { TablePage } from "../components/TablePage";
import { tables } from "../sample-data";

export default function LeadsPage() {
  return (
    <TablePage
      {...tables.leads}
      endpoint="/api/crm/leads?includeArchived=true"
      calendarFeedEndpoint="/api/crm/calendar-feed"
      documentUploadEndpoint="/api/crm/lead-intake/upload"
      leadSummariesEndpoint="/api/crm/leads/summaries"
      updateRecordEndpoint="/api/crm/leads/update"
      updateRecordIdField="leadId"
      manualPingEndpoint="/api/crm/manual-ping"
      offerGenerateEndpoint="/api/crm/leads/generate-offer"
      sendToTelegramEndpoint="/api/crm/leads/send-to-telegram"
      clientOptionsEndpoint="/api/crm/clients"
      clientLinkEndpoint="/api/crm/leads/link-client"
    />
  );
}
