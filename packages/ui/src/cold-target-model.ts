export type ColdTargetPingTone = "fresh" | "overdue" | "dormant";

const DAY_MS = 24 * 60 * 60 * 1000;

export function coldTargetPingTone(value: string | null | undefined, now = new Date()): ColdTargetPingTone {
  if (!value) {
    return "overdue";
  }
  const pingAt = new Date(value);
  if (Number.isNaN(pingAt.getTime())) {
    return "overdue";
  }
  const ageDays = Math.max(0, now.getTime() - pingAt.getTime()) / DAY_MS;
  if (ageDays >= 30) {
    return "dormant";
  }
  if (ageDays >= 7) {
    return "overdue";
  }
  return "fresh";
}

export function coldTargetPingLabel(value: string | null | undefined, now = new Date()): string {
  if (!value) {
    return "No ping yet";
  }
  const pingAt = new Date(value);
  if (Number.isNaN(pingAt.getTime())) {
    return "No ping yet";
  }
  const ageDays = Math.floor(Math.max(0, now.getTime() - pingAt.getTime()) / DAY_MS);
  return ageDays === 0 ? "Today" : `${ageDays}d ago`;
}
