import { createClient } from "@/lib/supabase/client";

export const ACCESS_DENIED = "You do not have access to this page.";
export const NO_DATA_YET = "No data yet";
export const HONEST_LIMITS =
  "Small sample; descriptive only. Events exist only since logging began. Team accounts are excluded only if listed. A PDF export shows task completion, not that the application succeeded.";
export const FUNNEL_NOTE =
  "Steps count distinct users who did the action; entries created before logging began or via import may not appear, so the steps are not strictly nested.";
export const ACTIVATION_DEFINITION = "first PDF generated, not registration";
export const EXCLUDE_STORAGE_KEY = "evidence-vault.insights.exclude-ids";
export const MISSING = "-";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_EXCLUDE_IDS = 200;
const MAX_EXCLUDE_CHARS = 20000;
const ANSWERS = ["yes", "mostly", "no"] as const;

export type FeedbackAnswer = (typeof ANSWERS)[number];

export type FunnelCount = {
  stepOrder: number;
  step: string;
  users: number;
};

export type FunnelRow = {
  stepOrder: number;
  step: string;
  users: number;
  ofSignedUp: number | null;
  ofPrevious: number | null;
  barPercent: number;
  largestDrop: boolean;
  droppedUsers: number;
};

export type RetentionRow = {
  relWeek: number;
  users: number;
  activated: number;
  percent: number | null;
};

export type TimeToValue = {
  users: number;
  medianMinutes: number | null;
  maxMinutes: number | null;
};

export type ActivationView = {
  pdfUsers: number;
  signedUp: number;
  label: string;
};

export type FeedbackRow = {
  answer: FeedbackAnswer;
  label: "Yes" | "Mostly" | "No";
  responses: number;
  avgMinutes: number | null;
};

export type FeedbackSummary = {
  rows: FeedbackRow[];
  responses: number;
  matchedResponses: number;
  matchRate: number | null;
};

export type AppliedFilters = {
  from: string;
  to: string;
  excluded: number;
};

export type ExcludeParse = {
  ids: string[];
  error: string | null;
  blocked: boolean;
};

export type InsightLoad<T> =
  | { status: "ready"; data: T }
  | { status: "empty" }
  | { status: "error"; message: string }
  | { status: "denied" };

type RpcError = { message?: string; details?: string; hint?: string } | null;

const FUNNEL_ERROR = "Could not load the funnel.";
const RETENTION_ERROR = "Could not load retention.";
const TIME_ERROR = "Could not load time to first value.";
const FEEDBACK_ERROR = "Could not load feedback.";
const ACTIVATION_ERROR = "Could not load activation.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

function canonicalStep(step: string): string {
  return step.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

function isSignedUp(step: string): boolean {
  return canonicalStep(step) === "signed up";
}

function isGeneratedPdf(step: string): boolean {
  return canonicalStep(step) === "generated pdf" || canonicalStep(step) === "pdf generated";
}

function isSafeLabel(value: string): boolean {
  if (!value || value.length > 80) return false;
  if (/[\r\n\t@]/.test(value)) return false;
  if (UUID_RE.test(value.trim())) return false;
  return !/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(value);
}

export function parseExcludeIds(text: string): ExcludeParse {
  if (text.length > MAX_EXCLUDE_CHARS) {
    return { ids: [], error: "The exclude list is too long.", blocked: true };
  }

  const lines = text.split(/\r?\n/);
  const ids: string[] = [];
  const seen = new Set<string>();
  const badLines: number[] = [];

  lines.forEach((line, index) => {
    const value = line.trim();
    if (!value) return;
    if (!isUuid(value)) {
      badLines.push(index + 1);
      return;
    }
    const id = value.toLowerCase();
    if (!seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  });

  if (ids.length > MAX_EXCLUDE_IDS) {
    return { ids: [], error: `Enter at most ${MAX_EXCLUDE_IDS} user ids.`, blocked: true };
  }

  if (badLines.length > 0) {
    const shown = badLines.slice(0, 5).join(", ");
    const extra = badLines.length - Math.min(badLines.length, 5);
    const more = extra > 0 ? `, and ${extra} more` : "";
    const error =
      badLines.length === 1
        ? `Line ${shown} is not a valid user id and will be ignored.`
        : `Lines ${shown}${more} are not valid user ids and will be ignored.`;
    return { ids, error, blocked: false };
  }

  return { ids, error: null, blocked: false };
}

function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function nextCalendarDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day + 1);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function localDayStartIso(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0).toISOString();
}

export function dateBounds(
  fromInput: string,
  toInput: string,
): { ok: true; from: string | null; to: string | null } | { ok: false; error: string } {
  const from = fromInput.trim();
  const to = toInput.trim();

  if (from && !isRealDate(from)) {
    return { ok: false, error: "Start date must be a real calendar date." };
  }
  if (to && !isRealDate(to)) {
    return { ok: false, error: "End date must be a real calendar date." };
  }
  if (from && to && from > to) {
    return { ok: false, error: "Start date must be on or before the end date." };
  }

  return {
    ok: true,
    from: from ? localDayStartIso(from) : null,
    to: to ? localDayStartIso(nextCalendarDate(to)) : null,
  };
}

export function describeFilters(applied: AppliedFilters, dateError: string | null): string {
  const excluded =
    applied.excluded === 0
      ? "No accounts are excluded."
      : applied.excluded === 1
        ? "1 account is excluded."
        : `${applied.excluded} accounts are excluded.`;

  let range = "The funnel includes every date.";
  if (dateError) {
    range = "The funnel date range was not applied.";
  } else if (applied.from && applied.to) {
    range = `The funnel includes ${applied.from} through ${applied.to}.`;
  } else if (applied.from) {
    range = `The funnel includes ${applied.from} and later.`;
  } else if (applied.to) {
    range = `The funnel includes dates through ${applied.to}.`;
  }

  return `${excluded} ${range} Retention, time to first value, and feedback use the full history.`;
}

export function buildFunnel(counts: FunnelCount[]): FunnelRow[] {
  const sorted = [...counts].sort((left, right) => left.stepOrder - right.stepOrder);
  const orders = new Set<number>();
  for (const row of sorted) {
    if (orders.has(row.stepOrder)) throw new Error("Unexpected insights shape.");
    orders.add(row.stepOrder);
    if (!isSafeLabel(row.step)) throw new Error("Unexpected insights shape.");
  }

  const signedUp = sorted.find((row) => isSignedUp(row.step))?.users;
  const scale = sorted.reduce((max, row) => Math.max(max, row.users), 0);
  let bestIndex = -1;
  let bestDrop = 0;

  const rows = sorted.map((row, index) => {
    const previousUsers = index === 0 ? null : (sorted[index - 1]?.users ?? 0);
    const dropped = previousUsers === null ? 0 : previousUsers - row.users;
    if (previousUsers !== null && previousUsers > 0 && dropped > bestDrop) {
      bestIndex = index;
      bestDrop = dropped;
    }
    return {
      stepOrder: row.stepOrder,
      step: row.step,
      users: row.users,
      ofSignedUp: signedUp === undefined || signedUp <= 0 ? null : row.users / signedUp,
      ofPrevious: previousUsers === null || previousUsers <= 0 ? null : row.users / previousUsers,
      barPercent: scale > 0 ? Math.min(100, Math.max(0, (row.users / scale) * 100)) : 0,
      largestDrop: false,
      droppedUsers: Math.max(0, dropped),
    };
  });

  if (bestIndex >= 0) {
    const winner = rows[bestIndex];
    if (winner) winner.largestDrop = true;
  }
  return rows;
}

export function funnelIsEmpty(rows: FunnelRow[]): boolean {
  return rows.length === 0 || rows.every((row) => row.users === 0);
}

export function activationFromRows(rows: FunnelRow[]): ActivationView | "empty" | "missing" {
  const signed = rows.find((row) => isSignedUp(row.step));
  const pdf = rows.find((row) => isGeneratedPdf(row.step));
  if (!signed || !pdf) return "missing";
  if (signed.users <= 0) return "empty";
  const ratio = pdf.users / signed.users;
  return {
    pdfUsers: pdf.users,
    signedUp: signed.users,
    label: `${pdf.users} / ${signed.users} (${formatPercent(ratio)})`,
  };
}

export const activationError = ACTIVATION_ERROR;

export function buildRetention(
  counts: { relWeek: number; users: number; activated: number }[],
): RetentionRow[] {
  if (counts.length === 0) return [];
  const inRange = counts.filter((row) => row.relWeek >= 0 && row.relWeek <= 3);
  if (inRange.length === 0) throw new Error("Unexpected insights shape.");

  const activatedValues = new Set(counts.map((row) => row.activated));
  if (activatedValues.size !== 1) throw new Error("Unexpected insights shape.");
  const activated = inRange[0]?.activated ?? 0;
  const byWeek = new Map<number, number>();

  for (const row of inRange) {
    if (byWeek.has(row.relWeek)) throw new Error("Unexpected insights shape.");
    byWeek.set(row.relWeek, row.users);
  }

  return [0, 1, 2, 3].map((relWeek) => {
    const users = byWeek.get(relWeek) ?? 0;
    return {
      relWeek,
      users,
      activated,
      percent: activated > 0 ? users / activated : null,
    };
  });
}

export function retentionIsEmpty(rows: RetentionRow[]): boolean {
  if (rows.length === 0) return true;
  const activated = rows[0]?.activated ?? 0;
  if (activated > 0) return false;
  return rows.every((row) => row.users === 0);
}

export function buildFeedback(
  counts: { matched: string; responses: number; avgMinutes: number | null }[],
): FeedbackSummary {
  const byAnswer = new Map<FeedbackAnswer, { responses: number; avgMinutes: number | null }>();
  for (const row of counts) {
    const key = row.matched.trim().toLowerCase();
    if (key !== "yes" && key !== "mostly" && key !== "no") throw new Error("Unexpected insights shape.");
    if (byAnswer.has(key)) throw new Error("Unexpected insights shape.");
    byAnswer.set(key, { responses: row.responses, avgMinutes: row.avgMinutes });
  }

  const rows: FeedbackRow[] = ANSWERS.map((answer) => {
    const found = byAnswer.get(answer);
    const responses = found?.responses ?? 0;
    const label = answer === "yes" ? "Yes" : answer === "mostly" ? "Mostly" : "No";
    return {
      answer,
      label,
      responses,
      avgMinutes: responses > 0 ? (found?.avgMinutes ?? null) : null,
    };
  });
  const responses = rows.reduce((sum, row) => sum + row.responses, 0);
  const matchedResponses =
    (byAnswer.get("yes")?.responses ?? 0) + (byAnswer.get("mostly")?.responses ?? 0);
  return {
    rows,
    responses,
    matchedResponses,
    matchRate: responses > 0 ? matchedResponses / responses : null,
  };
}

export function formatPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return MISSING;
  return `${(value * 100).toFixed(1)}%`;
}

export function formatMinutes(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return MISSING;
  return value.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export function formatMatchRate(summary: FeedbackSummary): string | null {
  if (summary.responses <= 0 || summary.matchRate === null) return null;
  return `${summary.matchedResponses} / ${summary.responses} (${formatPercent(summary.matchRate)})`;
}

function formulaSafe(value: string): string {
  // A lone hyphen is the empty-percent marker. Escaping it would paste as text "'-".
  if (value === MISSING) return value;
  return /^[\t\r\n ]*[=+\-@]/.test(value) ? `'${value}` : value;
}

function csvCell(value: string): string {
  const safe = formulaSafe(value);
  if (/[",\n\r]/.test(safe)) return `"${safe.replaceAll('"', '""')}"`;
  return safe;
}

function tsvCell(value: string): string {
  return formulaSafe(value).replace(/[\t\r\n]/g, " ");
}

export function toCsv(rows: string[][]): string {
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

export function toTsv(rows: string[][]): string {
  return rows.map((row) => row.map(tsvCell).join("\t")).join("\r\n");
}

export function funnelTable(rows: FunnelRow[]): string[][] {
  return [
    ["Step", "Users", "% of signed up", "% of previous step"],
    ...rows.map((row) => [
      row.step,
      String(row.users),
      formatPercent(row.ofSignedUp),
      formatPercent(row.ofPrevious),
    ]),
  ];
}

export function retentionTable(rows: RetentionRow[]): string[][] {
  return [
    ["Week", "Users", "% of activated users", "Activated users"],
    ...rows.map((row) => [
      `Week ${row.relWeek}`,
      String(row.users),
      formatPercent(row.percent),
      String(row.activated),
    ]),
  ];
}

export function feedbackTable(summary: FeedbackSummary): string[][] {
  return [
    ["Answer", "Responses", "Average minutes (self-report)"],
    ...summary.rows.map((row) => [row.label, String(row.responses), formatMinutes(row.avgMinutes)]),
  ];
}

export function readExcludeDraft(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(EXCLUDE_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function writeExcludeDraft(value: string): boolean {
  if (typeof window === "undefined") return false;
  if (value.length > MAX_EXCLUDE_CHARS) return false;
  try {
    window.localStorage.setItem(EXCLUDE_STORAGE_KEY, value);
    return true;
  } catch {
    return false;
  }
}

function isDeniedError(error: RpcError): boolean {
  if (!error) return false;
  const blob = `${error.message ?? ""} ${error.details ?? ""} ${error.hint ?? ""}`;
  return /not allowed/i.test(blob);
}

function asCount(value: unknown): number {
  if (typeof value === "string" && value.trim() === "") throw new Error("Unexpected insights shape.");
  const numeric = typeof value === "number" || typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > Number.MAX_SAFE_INTEGER) {
    throw new Error("Unexpected insights shape.");
  }
  if (Math.abs(numeric - Math.round(numeric)) > 1e-6) throw new Error("Unexpected insights shape.");
  return Math.round(numeric);
}

function asMinutes(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const numeric = typeof value === "number" || typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isFinite(numeric)) throw new Error("Unexpected insights shape.");
  return numeric;
}

export function parseFunnelPayload(data: unknown): FunnelCount[] {
  if (!Array.isArray(data)) throw new Error("Unexpected insights shape.");
  return data.map((item) => {
    if (!isRecord(item)) throw new Error("Unexpected insights shape.");
    const step = typeof item.step === "string" ? item.step.trim() : "";
    if (!step) throw new Error("Unexpected insights shape.");
    return {
      stepOrder: asCount(item.step_order),
      step,
      users: asCount(item.users),
    };
  });
}

export function parseRetentionPayload(data: unknown): { relWeek: number; users: number; activated: number }[] {
  if (!Array.isArray(data)) throw new Error("Unexpected insights shape.");
  return data.map((item) => {
    if (!isRecord(item)) throw new Error("Unexpected insights shape.");
    return {
      relWeek: asCount(item.rel_week),
      users: asCount(item.users),
      activated: asCount(item.activated),
    };
  });
}

export function parseTimePayload(data: unknown): TimeToValue | null {
  const rows = Array.isArray(data) ? data : isRecord(data) ? [data] : null;
  if (!rows) throw new Error("Unexpected insights shape.");
  if (rows.length === 0) return null;
  const parsed = rows.map((item) => {
    if (!isRecord(item)) throw new Error("Unexpected insights shape.");
    return {
      users: asCount(item.users),
      medianMinutes: asMinutes(item.median_minutes),
      maxMinutes: asMinutes(item.max_minutes),
    };
  });
  const first = parsed[0];
  if (!first) return null;
  const same = parsed.every(
    (row) =>
      row.users === first.users &&
      row.medianMinutes === first.medianMinutes &&
      row.maxMinutes === first.maxMinutes,
  );
  if (!same) throw new Error("Unexpected insights shape.");
  return first;
}

export function parseFeedbackPayload(
  data: unknown,
): { matched: string; responses: number; avgMinutes: number | null }[] {
  if (!Array.isArray(data)) throw new Error("Unexpected insights shape.");
  return data.map((item) => {
    if (!isRecord(item)) throw new Error("Unexpected insights shape.");
    const matched = typeof item.matched === "string" ? item.matched : "";
    if (!matched.trim()) throw new Error("Unexpected insights shape.");
    return {
      matched,
      responses: asCount(item.responses),
      avgMinutes: asMinutes(item.avg_minutes),
    };
  });
}

type RpcName = "insights_funnel" | "insights_retention" | "insights_time_to_value" | "insights_feedback";

async function readRpc(
  fn: RpcName,
  args: Record<string, unknown>,
): Promise<{ ok: true; data: unknown } | { ok: false; denied: boolean }> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase.rpc(fn, args);
    if (error) return { ok: false, denied: isDeniedError(error) };
    return { ok: true, data };
  } catch {
    return { ok: false, denied: false };
  }
}

function excludeIsSafe(exclude: string[]): boolean {
  return exclude.every((id) => isUuid(id));
}

export async function fetchIsAdmin(): Promise<boolean> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("is_admin");
    if (error || data !== true) return false;
    return true;
  } catch {
    return false;
  }
}

export async function loadFunnel(input: {
  from: string | null;
  to: string | null;
  exclude: string[];
}): Promise<InsightLoad<FunnelRow[]>> {
  if (!excludeIsSafe(input.exclude)) return { status: "error", message: FUNNEL_ERROR };
  const rpc = await readRpc("insights_funnel", {
    p_from: input.from,
    p_to: input.to,
    p_exclude: input.exclude,
  });
  if (!rpc.ok) return rpc.denied ? { status: "denied" } : { status: "error", message: FUNNEL_ERROR };
  try {
    const rows = buildFunnel(parseFunnelPayload(rpc.data));
    if (funnelIsEmpty(rows)) return { status: "empty" };
    return { status: "ready", data: rows };
  } catch {
    return { status: "error", message: FUNNEL_ERROR };
  }
}

export async function loadRetention(exclude: string[]): Promise<InsightLoad<RetentionRow[]>> {
  if (!excludeIsSafe(exclude)) return { status: "error", message: RETENTION_ERROR };
  const rpc = await readRpc("insights_retention", { p_exclude: exclude });
  if (!rpc.ok) return rpc.denied ? { status: "denied" } : { status: "error", message: RETENTION_ERROR };
  try {
    const rows = buildRetention(parseRetentionPayload(rpc.data));
    if (retentionIsEmpty(rows)) return { status: "empty" };
    return { status: "ready", data: rows };
  } catch {
    return { status: "error", message: RETENTION_ERROR };
  }
}

export async function loadTimeToValue(exclude: string[]): Promise<InsightLoad<TimeToValue>> {
  if (!excludeIsSafe(exclude)) return { status: "error", message: TIME_ERROR };
  const rpc = await readRpc("insights_time_to_value", { p_exclude: exclude });
  if (!rpc.ok) return rpc.denied ? { status: "denied" } : { status: "error", message: TIME_ERROR };
  try {
    const row = parseTimePayload(rpc.data);
    if (!row || row.users === 0) return { status: "empty" };
    return { status: "ready", data: row };
  } catch {
    return { status: "error", message: TIME_ERROR };
  }
}

export async function loadFeedback(exclude: string[]): Promise<InsightLoad<FeedbackSummary>> {
  if (!excludeIsSafe(exclude)) return { status: "error", message: FEEDBACK_ERROR };
  const rpc = await readRpc("insights_feedback", { p_exclude: exclude });
  if (!rpc.ok) return rpc.denied ? { status: "denied" } : { status: "error", message: FEEDBACK_ERROR };
  try {
    const summary = buildFeedback(parseFeedbackPayload(rpc.data));
    if (summary.responses === 0) return { status: "empty" };
    return { status: "ready", data: summary };
  } catch {
    return { status: "error", message: FEEDBACK_ERROR };
  }
}

export async function copyText(text: string): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await Promise.race([
        navigator.clipboard.writeText(text),
        new Promise<never>((_, reject) => {
          window.setTimeout(() => reject(new Error("clipboard timeout")), 1500);
        }),
      ]);
      return;
    } catch {
      // Some browsers block the async clipboard. The selection fallback below still copies the table.
    }
  }

  if (typeof document === "undefined") throw new Error("Could not copy the table.");
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.top = "0";
  area.style.left = "0";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.focus();
  area.select();
  const copied = document.execCommand("copy");
  area.remove();
  if (!copied) throw new Error("Could not copy the table.");
}

export function downloadCsv(filename: string, csv: string): void {
  if (typeof document === "undefined") throw new Error("Could not download the CSV.");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
