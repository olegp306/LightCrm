import { TablePage } from "../components/TablePage";
import { tables } from "../sample-data";

export default function TodayPage() {
  return <TablePage {...tables.today} endpoint="/api/crm/reminders" />;
}
