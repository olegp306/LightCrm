export type OutreachCalendarReminder = {
  sourceChannel: string | null;
  coldTargetId: string | null;
  description: string | null;
  title: string;
};

export type OutreachCalendarCampaign = {
  id: string;
  name: string;
  touchpoints: Array<{
    id: string;
    touchNumber: number;
    title: string;
    channel: string;
    action: string;
  }>;
};

export type OutreachCalendarDetails = {
  campaignId: string;
  campaignName: string;
  touchId: string | null;
  touchNumber: number | null;
  touchTitle: string | null;
  action: string | null;
  channel: string | null;
  subject: string | null;
  body: string | null;
  email: string | null;
};

function textAfterMarker(value: string | null, marker: string): string | null {
  if (!value) {
    return null;
  }
  const index = value.indexOf(marker);
  if (index < 0) {
    return null;
  }
  const rest = value.slice(index + marker.length);
  const nextSection = rest.search(/\n\n[A-Z][A-Za-z ]+:/);
  return (nextSection >= 0 ? rest.slice(0, nextSection) : rest).trim() || null;
}

export function outreachDetailsForReminder(
  reminder: OutreachCalendarReminder,
  coldTargets: ReadonlyMap<string, { email: string | null }>,
  campaigns: readonly OutreachCalendarCampaign[]
): OutreachCalendarDetails | null {
  if (reminder.sourceChannel !== "outreach-campaign" || !reminder.coldTargetId) {
    return null;
  }
  const lines = (reminder.description ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const campaignName = lines[0] ?? "Outreach campaign";
  const campaign = campaigns.find((item) => item.name === campaignName) ?? null;
  const touchMatch = reminder.title.match(/^Touch\s+(\d+):\s*(.+?)(?:\s+-\s+.+)?$/i);
  const touchNumber = touchMatch ? Number(touchMatch[1]) : null;
  const touchTitle = touchMatch?.[2]?.trim() || null;
  const touch =
    campaign?.touchpoints.find((item) => item.touchNumber === touchNumber) ??
    campaign?.touchpoints.find((item) => item.title === touchTitle) ??
    null;
  const subject = textAfterMarker(reminder.description, "Subject:");
  const body = textAfterMarker(reminder.description, "Draft:");
  const coldTarget = coldTargets.get(reminder.coldTargetId);

  return {
    campaignId: campaign?.id ?? campaignName,
    campaignName: campaign?.name ?? campaignName,
    touchId: touch?.id ?? null,
    touchNumber,
    touchTitle: touch?.title ?? touchTitle,
    action: touch?.action ?? lines[1] ?? null,
    channel: touch?.channel ?? null,
    subject,
    body,
    email: coldTarget?.email ?? null
  };
}
