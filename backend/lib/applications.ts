import { asString } from "@backend/lib/api";

export const STAGES = [
  "interested",
  "applied",
  "screening",
  "interview",
  "assessment",
  "offer",
  "rejected",
] as const;

export type Stage = (typeof STAGES)[number];

export const STAGE_LABELS: Record<Stage, string> = {
  interested: "Interested",
  applied: "Applied",
  screening: "Screening",
  interview: "Interview",
  assessment: "Assessment",
  offer: "Offer",
  rejected: "Rejected",
};

export const ACTIVE_STAGES: Stage[] = ["applied", "screening", "interview", "assessment"];

export function parseDate(value: unknown): Date | null {
  const text = asString(value);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function isStage(value: string): value is Stage {
  return (STAGES as readonly string[]).includes(value);
}
