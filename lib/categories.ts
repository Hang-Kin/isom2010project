import type { Category } from "@/lib/types";

export type CategoryOption = {
  value: Category;
  label: string;
  badgeClass: string;
};

export const CATEGORIES: readonly CategoryOption[] = [
  {
    value: "award",
    label: "Award",
    badgeClass: "bg-accent-soft text-accent-strong",
  },
  {
    value: "activity",
    label: "Activity",
    badgeClass: "bg-[#e7eef6] text-[#1e3a5f]",
  },
  {
    value: "volunteering",
    label: "Volunteering",
    badgeClass: "bg-warning-soft text-warning",
  },
  {
    value: "scholarship",
    label: "Scholarship",
    badgeClass: "bg-[#f3e8ee] text-[#5c3b4a]",
  },
  {
    value: "internship",
    label: "Internship",
    badgeClass: "bg-[#e7e6f8] text-[#2e2a6e]",
  },
  {
    value: "other",
    label: "Other",
    badgeClass: "bg-[#e3f1f4] text-[#0e4450]",
  },
];

const FALLBACK_BADGE_CLASS = "bg-[#e7eaec] text-[#24343c]";

export function categoryLabel(value: string): string {
  const match = CATEGORIES.find((item) => item.value === value);
  if (match) return match.label;

  const trimmed = value.trim();
  if (!trimmed) return "Unknown";
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

export function categoryBadgeClass(value: string): string {
  return CATEGORIES.find((item) => item.value === value)?.badgeClass ?? FALLBACK_BADGE_CLASS;
}
