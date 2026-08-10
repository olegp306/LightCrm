import { TablePage } from "../components/TablePage";
import { tables } from "../sample-data";

export default function ColdTargetsPage() {
  return (
    <TablePage
      {...tables.coldTargets}
      endpoint="/api/crm/cold-targets"
      updateRecordEndpoint="/api/crm/cold-targets/upsert"
      updateRecordIdField="id"
      calendarFeedEndpoint="/api/crm/calendar-feed"
      outreachStartEndpoint="/api/crm/outreach-campaigns/start"
      outreachAdvanceEndpoint="/api/crm/outreach-campaigns/advance"
      outreachDraftEndpoint="/api/crm/outreach-campaigns/draft"
      outreachProtocolEndpoint="/api/crm/outreach-protocol"
    />
  );
}
