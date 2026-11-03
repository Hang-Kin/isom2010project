export type AnswerLimitUnit = "words" | "chars";

export type CharCount = {
  withSpaces: number;
  withoutSpaces: number;
};

export type CountTone = "normal" | "warning" | "over";

export const ANSWER_LIMIT_MIN = 1;
export const ANSWER_LIMIT_MAX = 5000;

const LEADING_BULLETS =
  /^[ \t\u3000]*(?:(?:[-*][ \t\u3000]+)|(?:[\u2022\u2023\u2043\u2219\u25E6\u25AA\u25CF\u00B7\u30FB][ \t\u3000]*))+/;

/**
 * Words are whitespace-separated. Each CJK character counts as one word.
 * Leading "-", "*", and bullet markers are not counted.
 */
export function countWords(text: string): number {
  if (!text) return 0;
  let total = 0;
  for (const line of text.split(/\r\n|\n|\r/)) {
    const stripped = line.replace(LEADING_BULLETS, "");
    for (const token of stripped.split(/\s+/)) {
      if (token) total += countToken(token);
    }
  }
  return total;
}

/** Character counts by Unicode code point, with spaces and without spaces. */
export function countChars(text: string): CharCount {
  let withSpaces = 0;
  let withoutSpaces = 0;
  for (const char of text) {
    withSpaces += 1;
    if (!/\s/u.test(char)) withoutSpaces += 1;
  }
  return { withSpaces, withoutSpaces };
}

export function parseAnswerLimit(draft: string): { limit: number | null; error: string | null } {
  const trimmed = draft.trim();
  if (!trimmed) return { limit: null, error: null };
  if (!/^\d+$/.test(trimmed)) {
    return {
      limit: null,
      error:
        "Enter a whole number from 1 to 5000, or leave blank for no limit. The current limit is unchanged.",
    };
  }
  const limit = Number(trimmed);
  if (!Number.isSafeInteger(limit) || limit < ANSWER_LIMIT_MIN) {
    return { limit: null, error: "Limit must be at least 1. The current limit is unchanged." };
  }
  if (limit > ANSWER_LIMIT_MAX) {
    return { limit: null, error: "Limit cannot be more than 5000. The current limit is unchanged." };
  }
  return { limit, error: null };
}

export function answerLimitStatus(limit: number | null, unit: AnswerLimitUnit): string {
  if (limit === null) return "No limit.";
  const name =
    unit === "words"
      ? limit === 1
        ? "word"
        : "words"
      : limit === 1
        ? "character"
        : "characters";
  return `Limit set to ${limit} ${name}.`;
}

export function measureCount(text: string, unit: AnswerLimitUnit): number {
  if (unit === "chars") return countChars(text).withSpaces;
  return countWords(text);
}

export function countTone(count: number, limit: number | null): CountTone {
  if (limit === null) return "normal";
  if (count > limit) return "over";
  if (count * 10 >= limit * 9) return "warning";
  return "normal";
}

export function formatCountLabel(
  text: string,
  limit: number | null | undefined,
  unit: AnswerLimitUnit = "words",
): { label: string; tone: CountTone; count: number; overBy: number } {
  const active = normalizeLimit(limit);
  const chars = unit === "chars" ? countChars(text) : null;
  const count = chars ? chars.withSpaces : countWords(text);
  const tone = countTone(count, active);
  const quota = unit === "words" ? "words" : "characters";
  let label = active === null ? `${count} ${pluralUnit(count, unit)}` : `${count} / ${active} ${quota}`;
  if (chars) label += ` (${chars.withoutSpaces} without spaces)`;
  const overBy = active !== null && count > active ? count - active : 0;
  if (overBy > 0) label += ` · ${overBy} ${pluralUnit(overBy, unit)} over`;
  return { label, tone, count, overBy };
}

export function isOverLimit(
  text: string,
  limit: number | null | undefined,
  unit: AnswerLimitUnit = "words",
): boolean {
  const active = normalizeLimit(limit);
  if (active === null) return false;
  return measureCount(text, unit) > active;
}

export function summarizeAnswers(
  texts: readonly string[],
  limit: number | null | undefined,
  unit: AnswerLimitUnit = "words",
): string {
  const active = normalizeLimit(limit);
  let total = 0;
  let over = 0;
  for (const text of texts) {
    const count = measureCount(text, unit);
    total += count;
    if (active !== null && count > active) over += 1;
  }
  const totalName = pluralUnit(total, unit);
  const answers = texts.length === 1 ? "answer" : "answers";
  return `Total: ${total} ${totalName} across ${texts.length} ${answers}; ${over} over the limit`;
}

function normalizeLimit(limit: number | null | undefined): number | null {
  if (limit === null || limit === undefined) return null;
  if (!Number.isSafeInteger(limit) || limit < ANSWER_LIMIT_MIN) return null;
  return limit;
}

function pluralUnit(count: number, unit: AnswerLimitUnit): string {
  if (unit === "words") return count === 1 ? "word" : "words";
  return count === 1 ? "character" : "characters";
}

function countToken(token: string): number {
  let words = 0;
  let inWord = false;
  for (const char of token) {
    if (isCjk(char)) {
      if (inWord) {
        words += 1;
        inWord = false;
      }
      words += 1;
      continue;
    }
    if (isWordChar(char)) inWord = true;
  }
  if (inWord) words += 1;
  return words;
}

function isWordChar(char: string): boolean {
  return /[\p{L}\p{N}]/u.test(char);
}

function isCjk(char: string): boolean {
  const code = char.codePointAt(0);
  if (code === undefined) return false;
  return (
    (code >= 0x1100 && code <= 0x11ff) ||
    (code >= 0x2e80 && code <= 0x2fdf) ||
    (code >= 0x3005 && code <= 0x3007) ||
    (code >= 0x3041 && code <= 0x3096) ||
    (code >= 0x309d && code <= 0x309f) ||
    (code >= 0x30a1 && code <= 0x30fa) ||
    (code >= 0x30fd && code <= 0x30ff) ||
    (code >= 0x31f0 && code <= 0x31ff) ||
    (code >= 0x3400 && code <= 0x4dbf) ||
    (code >= 0x4e00 && code <= 0x9fff) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xff66 && code <= 0xff9d) ||
    (code >= 0x20000 && code <= 0x2a6df)
  );
}
