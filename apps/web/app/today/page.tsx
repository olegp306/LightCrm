import { CrmCalendar } from "../components/CrmCalendar";

type TodayPageProps = {
  searchParams?: {
    leadId?: string;
    clientId?: string;
    coldTargetId?: string;
  };
};

export default function TodayPage({ searchParams }: TodayPageProps) {
  const isFiltered = Boolean(searchParams?.leadId || searchParams?.clientId || searchParams?.coldTargetId);
  return (
    <CrmCalendar
      title={isFiltered ? "Filtered Calendar" : "Today"}
      description={
        isFiltered
          ? "Calendar filtered to the selected CRM record."
          : "Unified CRM calendar for reminders, scheduled events, Telegram intake, and LangGraph agent work."
      }
      leadId={searchParams?.leadId}
      clientId={searchParams?.clientId}
      coldTargetId={searchParams?.coldTargetId}
    />
  );
}
