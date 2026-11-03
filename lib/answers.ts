import type { Achievement } from "@/lib/types";
import {
  PRESETS,
  type AnswerStyle,
  type PresetId,
} from "@/lib/presets";

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

export type FormatAnswerOptions = {
  preset?: PresetId;
  style?: AnswerStyle;
};

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

function clean(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function monthSpan(start: string | null, end: string | null): string {
  const from = formatMonthYear(start);
  const to = formatMonthYear(end);
  if (from && to) return `${from} - ${to}`;
  return from || to;
}

function hoursText(hours: number | null): string {
  if (hours === null || hours === undefined) return "";
  const value = Number(hours);
  if (!Number.isFinite(value)) return "";
  return `${formatHours(value)} hours`;
}

function firstSentence(description: string): string {
  const trimmed = description.replace(/\s+/g, " ").trim();
  if (!trimmed) return "";
  const match = /^(.+?[.!?])(?:\s|$)/.exec(trimmed);
  const raw = (match ? match[1] : trimmed).trim();
  return raw.replace(/[.!?]+$/, "").trim();
}

function rolePlace(role: string, organizer: string, mode: "comma" | "at"): string {
  if (role && organizer) {
    return mode === "at" ? `${role} at ${organizer}` : `${role}, ${organizer}`;
  }
  return role || organizer;
}

function acted(
  verb: string,
  role: string,
  organizer: string,
  mode: "comma" | "at",
): string {
  if (role && organizer) return `${verb} as ${rolePlace(role, organizer, mode)}`;
  if (role) return `${verb} as ${role}`;
  if (organizer) return `${verb} at ${organizer}`;
  return "";
}

function withTitle(lead: string, title: string): string {
  if (lead) return lead;
  return title;
}

function bulletLead(
  achievement: Achievement,
  preset: PresetId,
  role: string,
  organizer: string,
  title: string,
): string {
  const category = achievement.category;

  if (category === "internship") {
    if (role && organizer) return `Completed an internship as ${role} at ${organizer}`;
    if (role) return `Completed an internship as ${role}`;
    if (organizer) return `Completed an internship at ${organizer}`;
    return title ? `Completed an internship, ${title}` : "Completed an internship";
  }

  if (category === "award" || category === "scholarship") {
    const result = title || (category === "award" ? "an award" : "a scholarship");
    const verb =
      category === "scholarship" ? "Awarded" : preset === "internship_cv" ? "Earned" : "Received";
    const mode = preset === "internship_cv" ? "at" : "comma";
    const who = rolePlace(role, organizer, mode);
    return who ? `${verb} ${result} as ${who}` : `${verb} ${result}`;
  }

  if (preset === "scholarship") {
    return withTitle(acted("Served", role, organizer, "comma"), title);
  }
  if (preset === "internship_cv") {
    return withTitle(acted("Worked", role, organizer, "at"), title);
  }
  if (preset === "exchange") {
    const verb = category === "volunteering" ? "Volunteered" : "Took part";
    return withTitle(acted(verb, role, organizer, "comma"), title);
  }
  return withTitle(rolePlace(role, organizer, "comma"), title);
}

function formatBullet(achievement: Achievement, preset: PresetId): string {
  const role = clean(achievement.role);
  const organizer = clean(achievement.organizer);
  const title = clean(achievement.title);
  const dates = monthSpan(achievement.start_date, achievement.end_date);
  const sentence = firstSentence(achievement.description ?? "");
  const hours = hoursText(achievement.hours);
  const lead = bulletLead(achievement, preset, role, organizer, title) || "Entry";

  let line = `- ${lead}`;
  if (dates) line += ` (${dates})`;
  if (sentence) line += `: ${sentence}.`;
  if (hours) line += ` (${hours})`;
  return line;
}

function paragraphOpening(
  achievement: Achievement,
  preset: PresetId,
  role: string,
  organizer: string,
  title: string,
): string {
  const category = achievement.category;

  if (category === "internship") {
    if (role && organizer) return `I completed an internship as ${role} at ${organizer}`;
    if (role) return `I completed an internship as ${role}`;
    if (organizer) return `I completed an internship at ${organizer}`;
    if (title) return `I completed an internship, ${title}`;
    return "I completed an internship";
  }

  if (category === "award") {
    const result = title || "an award";
    if (role && organizer) return `I received ${result} as ${role} at ${organizer}`;
    if (role) return `I received ${result} as ${role}`;
    if (organizer) return `I received ${result} from ${organizer}`;
    return `I received ${result}`;
  }

  if (category === "scholarship") {
    const result = title || "a scholarship";
    if (role && organizer) return `I was awarded ${result} as ${role} by ${organizer}`;
    if (role) return `I was awarded ${result} as ${role}`;
    if (organizer) return `I was awarded ${result} by ${organizer}`;
    return `I was awarded ${result}`;
  }

  const verb =
    category === "volunteering"
      ? "volunteered"
      : preset === "internship_cv"
        ? "worked"
        : preset === "exchange"
          ? "took part"
          : "served";

  if (role && organizer) return `I ${verb} as ${role} at ${organizer}`;
  if (role) return `I ${verb} as ${role}`;
  if (organizer) return `I ${verb} at ${organizer}`;
  if (title) return `I took part in ${title}`;
  return `I ${verb}`;
}

function purposeTail(preset: PresetId): string {
  if (preset === "scholarship") return "for this scholarship application";
  if (preset === "exchange") return "for this exchange application";
  return "";
}

function formatParagraph(achievement: Achievement, preset: PresetId): string {
  const role = clean(achievement.role);
  const organizer = clean(achievement.organizer);
  const title = clean(achievement.title);
  const from = formatMonthYear(achievement.start_date);
  const to = formatMonthYear(achievement.end_date);
  const hours = hoursText(achievement.hours);
  const description = (achievement.description ?? "").trim();

  let when = "";
  if (from && to) when = `from ${from} to ${to}`;
  else if (from) when = `from ${from}`;
  else if (to) when = `until ${to}`;

  const opening = paragraphOpening(achievement, preset, role, organizer, title);
  const main = [opening, when, hours ? `(${hours})` : "", purposeTail(preset)]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  const sentence = /[.!?]$/.test(main) ? main : `${main}.`;
  if (!description) return sentence;
  return `${sentence} ${description}`;
}

/**
 * Copy-ready text for one achievement.
 * With no options, the original single-line answer is unchanged.
 * Pass `preset` and `style` for application-specific bullet or paragraph text.
 * Empty role, organizer, dates, hours, or description are left out.
 */
export function formatAnswer(achievement: Achievement, options?: FormatAnswerOptions): string {
  if (options?.preset || options?.style) {
    const preset = options.preset ?? "general";
    const style = options.style ?? PRESETS[preset].defaultStyle;
    if (style === "bullet") return formatBullet(achievement, preset);
    return formatParagraph(achievement, preset);
  }

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
