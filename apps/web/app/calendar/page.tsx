import { TablePage } from "../components/TablePage";
import { tables } from "../sample-data";

export default function CalendarPage() {
  return <TablePage {...tables.calendar} endpoint="/api/crm/calendar-events" />;
}
