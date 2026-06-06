import { TablePage } from "../components/TablePage";
import { tables } from "../sample-data";

export default function ColdTargetsPage() {
  return <TablePage {...tables.coldTargets} endpoint="/api/crm/cold-targets" />;
}
