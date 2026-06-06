import { TablePage } from "../components/TablePage";
import { tables } from "../sample-data";

export default function OutreachPage() {
  return <TablePage {...tables.outreach} endpoint="/api/crm/outreach" />;
}
