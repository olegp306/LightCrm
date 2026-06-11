import { CrmCalendar } from "../components/CrmCalendar";

type TodayPageProps = {
  searchParams?: {
    leadId?: string;
    clientId?: string;
    coldTargetId?: string;
  };
};

export default function TodayPage({ searchParams }: TodayPageProps) {
  const title = searchParams?.leadId
    ? "Lead Calendar"
    : searchParams?.clientId
      ? "Client Calendar"
      : searchParams?.coldTargetId
        ? "Cold Target Calendar"
        : "Today";
  const isFiltered = title !== "Today";
  return (
    <CrmCalendar
      title={title}
      description={
        isFiltered
          ? "Schedule and manual events for the selected CRM record."
          : "Unified CRM calendar for reminders, scheduled events, Telegram intake, and LangGraph agent work."
      }
      leadId={searchParams?.leadId}
      clientId={searchParams?.clientId}
      coldTargetId={searchParams?.coldTargetId}
    />
  );
}
