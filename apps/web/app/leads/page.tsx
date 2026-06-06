import { TablePage } from "../components/TablePage";
import { tables } from "../sample-data";

export default function LeadsPage() {
  return <TablePage {...tables.leads} endpoint="/api/crm/leads" />;
}
