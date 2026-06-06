import { TablePage } from "../components/TablePage";
import { tables } from "../sample-data";

export default function ClientsPage() {
  return <TablePage {...tables.clients} endpoint="/api/crm/clients" />;
}
