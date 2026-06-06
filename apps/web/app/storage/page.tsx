import { TablePage } from "../components/TablePage";
import { tables } from "../sample-data";

export default function StoragePage() {
  return <TablePage {...tables.storage} endpoint="/api/crm/document-files" />;
}
