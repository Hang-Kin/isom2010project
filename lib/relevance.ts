import { categoryLabel } from "@/lib/categories";

/** Longest criteria the export page will analyse. */
export const MAX_CRITERIA_LENGTH = 5000;

export type Keyword = {
  term: string;
  count: number;
};

export type MatchField = "title" | "role" | "category" | "organizer" | "description";

export type KeywordMatch = {
  keyword: string;
  fields: MatchField[];
};

export type RelevanceEntry = {
  title: string;
  category: string;
  role?: string | null;
  organizer?: string | null;
  description?: string | null;
};

export type ScoreResult = {
  score: number;
  matched: string[];
};

export type RankedEntry<T extends RelevanceEntry = RelevanceEntry> = {
  entry: T;
  /** 0-100 relative to the best raw score in this set. */
  score: number;
  rawScore: number;
  matched: string[];
  matches: KeywordMatch[];
};

const FIELD_WEIGHTS: Record<MatchField, number> = {
  title: 3,
  role: 2,
  category: 2,
  organizer: 1,
  description: 1,
};

const FIELDS: readonly MatchField[] = [
  "title",
  "role",
  "category",
  "organizer",
  "description",
];

/**
 * Criteria stems that also match these achievement stems.
 * "leadership" covers president, captain, chair, and founder.
 * "community" covers volunteering.
 */
const CRITERION_SYNONYMS: Record<string, readonly string[]> = {
  leadership: ["president", "captain", "chair", "chairman", "chairperson", "founder", "leader", "head"],
  community: ["volunteer", "volunteering", "outreach", "charity"],
};

const STOP_WORD_LIST = [
  "a", "about", "above", "across", "after", "again", "against", "all", "almost", "along",
  "already", "also", "although", "always", "am", "among", "an", "and", "another", "any",
  "are", "around", "as", "at", "be", "because", "been", "before", "being", "below",
  "between", "both", "but", "by", "can", "cannot", "could", "did", "do", "does",
  "doing", "down", "during", "each", "either", "else", "enough", "even", "ever", "every",
  "everybody", "everyone", "everything", "few", "for", "from", "further", "had", "has",
  "have", "having", "he", "her", "here", "hers", "herself", "him", "himself", "his", "how",
  "i", "if", "in", "into", "is", "it", "its", "itself", "just", "me", "more", "most",
  "much", "my", "myself", "no", "nor", "not", "now", "of", "off", "on", "once", "only",
  "or", "other", "our", "ours", "ourselves", "out", "over", "own", "same", "she", "should",
  "so", "some", "someone", "something", "still", "such", "than", "that", "the", "their",
  "theirs", "them", "themselves", "then", "there", "these", "they", "this", "those",
  "through", "to", "too", "under", "until", "up", "very", "was", "we", "were", "what",
  "when", "where", "which", "while", "who", "whom", "why", "will", "with", "would", "you",
  "your", "yours", "yourself", "yourselves",
] as const;

export const STOP_WORDS: ReadonlySet<string> = new Set(STOP_WORD_LIST);

const expansionCache = new Map<string, ReadonlySet<string>>();

function isCjkChar(char: string): boolean {
  const code = char.codePointAt(0) ?? 0;
  return (
    (code >= 0x3400 && code <= 0x4dbf) ||
    (code >= 0x4e00 && code <= 0x9fff) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0x3040 && code <= 0x30ff) ||
    (code >= 0xac00 && code <= 0xd7af) ||
    (code >= 0x20000 && code <= 0x2ebe0)
  );
}

function containsCjk(token: string): boolean {
  for (const char of token) {
    if (isCjkChar(char)) return true;
  }
  return false;
}

/** Strip one common English suffix when the stem stays at least 3 characters. */
function stemToken(token: string): string {
  if (token.endsWith("ing")) {
    const stem = token.slice(0, -3);
    if (stem.length >= 3) return stem;
  }
  if (token.endsWith("ies")) {
    const stem = `${token.slice(0, -3)}y`;
    if (stem.length >= 3) return stem;
  }
  if (/(?:s|x|z|ch|sh)es$/.test(token)) {
    const stem = token.slice(0, -2);
    if (stem.length >= 3) return stem;
  }
  if (token.endsWith("ed")) {
    const stem = token.slice(0, -2);
    if (stem.length >= 3) return stem;
  }
  if (token.endsWith("ly")) {
    const stem = token.slice(0, -2);
    if (stem.length >= 3) return stem;
  }
  if (token.endsWith("s") && !token.endsWith("ss")) {
    const stem = token.slice(0, -1);
    if (stem.length >= 3) return stem;
  }
  return token;
}

function addCount(term: string, counts: Map<string, number>) {
  counts.set(term, (counts.get(term) ?? 0) + 1);
}

function addLatin(token: string, counts: Map<string, number>) {
  if (token.length < 3 || STOP_WORDS.has(token)) return;
  const stemmed = stemToken(token);
  if (stemmed.length < 3 || STOP_WORDS.has(stemmed)) return;
  addCount(stemmed, counts);
}

function addBigrams(chars: readonly string[], counts: Map<string, number>) {
  for (let index = 0; index < chars.length - 1; index += 1) {
    addCount(chars[index] + chars[index + 1], counts);
  }
}

function addToken(token: string, counts: Map<string, number>) {
  if (!containsCjk(token)) {
    addLatin(token, counts);
    return;
  }

  let latin = "";
  let cjk: string[] = [];

  const flushLatin = () => {
    if (!latin) return;
    addLatin(latin, counts);
    latin = "";
  };

  const flushCjk = () => {
    if (cjk.length === 0) return;
    addBigrams(cjk, counts);
    cjk = [];
  };

  for (const char of token) {
    if (isCjkChar(char)) {
      flushLatin();
      cjk.push(char);
    } else {
      flushCjk();
      latin += char;
    }
  }

  flushLatin();
  flushCjk();
}

export function extractKeywords(text: string): Keyword[] {
  if (typeof text !== "string" || text.length === 0) return [];

  const counts = new Map<string, number>();
  const tokens = text.toLowerCase().match(/\p{L}+/gu) ?? [];
  for (const token of tokens) addToken(token, counts);

  return [...counts].map(([term, count]) => ({ term, count }));
}

function expansionsFor(term: string): ReadonlySet<string> {
  const cached = expansionCache.get(term);
  if (cached) return cached;

  const expanded = new Set<string>([term]);
  for (const extra of CRITERION_SYNONYMS[term] ?? []) {
    const extracted = extractKeywords(extra);
    if (extracted.length === 0) {
      expanded.add(extra);
      continue;
    }
    for (const keyword of extracted) expanded.add(keyword.term);
  }

  expansionCache.set(term, expanded);
  return expanded;
}

function prepareKeywords(keywords: readonly Keyword[]): Keyword[] {
  const counts = new Map<string, number>();
  for (const keyword of keywords) {
    if (!keyword || !Number.isFinite(keyword.count) || keyword.count <= 0) continue;
    const term = keyword.term?.trim();
    if (!term) continue;
    const extracted = extractKeywords(term);
    if (extracted.length === 0) continue;
    for (const item of extracted) {
      counts.set(item.term, (counts.get(item.term) ?? 0) + keyword.count * item.count);
    }
  }
  return [...counts].map(([term, count]) => ({ term, count }));
}

function fieldText(entry: RelevanceEntry, field: MatchField): string {
  switch (field) {
    case "title":
      return entry.title ?? "";
    case "role":
      return entry.role ?? "";
    case "organizer":
      return entry.organizer ?? "";
    case "description":
      return entry.description ?? "";
    case "category": {
      const value = entry.category?.trim() ?? "";
      if (!value) return "";
      const label = categoryLabel(value);
      return label.toLowerCase() === value.toLowerCase() ? value : `${value} ${label}`;
    }
  }
}

function termsIn(text: string): Set<string> {
  const terms = new Set<string>();
  for (const keyword of extractKeywords(text)) terms.add(keyword.term);
  return terms;
}

function formatMatched(matches: readonly KeywordMatch[]): string[] {
  return matches.map((match) => `${match.keyword} (${match.fields.join(", ")})`);
}

function scorePrepared(
  entry: RelevanceEntry,
  keywords: readonly Keyword[],
): ScoreResult & { matches: KeywordMatch[] } {
  const fieldTerms = new Map<MatchField, Set<string>>();
  for (const field of FIELDS) fieldTerms.set(field, termsIn(fieldText(entry, field)));

  let score = 0;
  const matches: KeywordMatch[] = [];

  for (const keyword of keywords) {
    const expansions = expansionsFor(keyword.term);
    const fields: MatchField[] = [];
    for (const field of FIELDS) {
      const terms = fieldTerms.get(field);
      if (!terms) continue;
      let found = false;
      for (const candidate of expansions) {
        if (terms.has(candidate)) {
          found = true;
          break;
        }
      }
      if (!found) continue;
      fields.push(field);
      score += FIELD_WEIGHTS[field] * keyword.count;
    }
    if (fields.length > 0) matches.push({ keyword: keyword.term, fields });
  }

  return { score, matched: formatMatched(matches), matches };
}

export function scoreAchievement(
  achievement: RelevanceEntry,
  keywords: readonly Keyword[],
): ScoreResult {
  const result = scorePrepared(achievement, prepareKeywords(keywords));
  return { score: result.score, matched: result.matched };
}

export function rankAchievements<T extends RelevanceEntry>(
  achievements: readonly T[],
  keywords: readonly Keyword[],
): RankedEntry<T>[] {
  const prepared = prepareKeywords(keywords);
  const scored = achievements.map((entry) => {
    const result = scorePrepared(entry, prepared);
    return {
      entry,
      rawScore: result.score,
      matched: result.matched,
      matches: result.matches,
    };
  });
  const best = scored.reduce((max, item) => (item.rawScore > max ? item.rawScore : max), 0);

  const ranked: RankedEntry<T>[] = scored.map((item) => ({
    ...item,
    score: best === 0 ? 0 : Math.round((item.rawScore / best) * 100),
  }));

  ranked.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    return left.entry.title.localeCompare(right.entry.title);
  });

  return ranked;
}

/** Full next selection. Replace drops current ids; otherwise new ids are appended. */
export function mergeRelevanceSelection(
  current: readonly string[],
  incoming: readonly string[],
  replace: boolean,
): string[] {
  if (replace) {
    const seen = new Set<string>();
    const next: string[] = [];
    for (const id of incoming) {
      if (seen.has(id)) continue;
      seen.add(id);
      next.push(id);
    }
    return next;
  }

  const next = [...current];
  const seen = new Set(current);
  for (const id of incoming) {
    if (seen.has(id)) continue;
    seen.add(id);
    next.push(id);
  }
  return next;
}
