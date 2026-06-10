import type { PlannedCrmAction, RiskLevel } from "./types";

export function reviewAction(reason: string, payload: Record<string, unknown> = {}): PlannedCrmAction {
  return {
    type: "request_review",
    risk: "review",
    reason,
    payload
  };
}

export function riskFromConfirmation(needsHumanConfirmation: boolean): RiskLevel {
  return needsHumanConfirmation ? "review" : "auto";
}
