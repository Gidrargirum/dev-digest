import type { SkillSource, SkillType } from "@devdigest/shared";

/** Badge colour for a skill type (accent/ok/crit/neutral by category). */
export function typeColor(type: SkillType): string {
  switch (type) {
    case "rubric":
      return "var(--accent-text)";
    case "convention":
      return "var(--ok)";
    case "security":
      return "var(--crit)";
    default:
      return "var(--text-secondary)";
  }
}

/** Icon shown next to a skill's source label. */
export function sourceIcon(source: SkillSource): "Edit" | "Wrench" | "Globe" | "Upload" {
  switch (source) {
    case "manual":
      return "Edit";
    case "extracted":
      return "Wrench";
    case "community":
      return "Globe";
    case "imported_url":
      return "Upload";
  }
}
