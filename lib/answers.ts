import type { Achievement } from "@/lib/types";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export function formatMonthYear(iso: string | null): string {
  if (!iso) return "";
  const match = /^(\d{4})-(\d{2})/.exec(iso);
  if (!match) return "";
  const monthIndex = Number(match[2]) - 1;
  const month = MONTHS[monthIndex];
  if (!month) return "";
  return `${month} ${match[1]}`;
}

function formatHours(hours: number): string {
  const rounded = Math.round(hours * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

/**
 * Copy-ready line for one achievement.
 * Empty role, organizer, dates, hours, or description are left out.
 */
export function formatAnswer(achievement: Achievement): string {
  const title = achievement.title.trim();
  const role = achievement.role?.trim() ?? "";
  const organizer = achievement.organizer?.trim() ?? "";
  const description = achievement.description?.trim() ?? "";
  const roleAndOrganizer = [role, organizer].filter(Boolean).join(", ");

  const start = formatMonthYear(achievement.start_date);
  const end = formatMonthYear(achievement.end_date);
  const dates = start && end ? `${start} - ${end}` : start || end;

  const hoursValue =
    achievement.hours === null || achievement.hours === undefined
      ? null
      : Number(achievement.hours);
  const hours =
    hoursValue !== null && Number.isFinite(hoursValue) ? `${formatHours(hoursValue)} hours` : "";

  const details = [dates, hours].filter(Boolean).join(", ");
  const wrappedDetails = details ? ` (${details})` : "";

  let answer = title;
  if (roleAndOrganizer) answer += ` - ${roleAndOrganizer}`;
  answer += wrappedDetails;
  if (description) answer += `. ${description}`;
  return answer;
}
