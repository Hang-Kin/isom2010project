import { createClient } from "@/lib/supabase/client";

export const ACCESS_DENIED = "You do not have access";
export const NO_DATA_YET = "No data yet";
export const HONEST_LIMITS =
  "Small sample; results are descriptive, not statistically significant. Team accounts are excluded only if listed. Events exist only from the deployment date. A PDF export shows task completion, not whether the application succeeded.";
export const EXCLUDE_STORAGE_KEY = "evidence-vault.insights.exclude-ids";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_EXCLUDE_IDS = 200;
const FUNNEL_ORDERS = [1, 2, 3, 4, 5, 6] as const;

export type FunnelCount = {
  stepOrder: number;
  step: string;
  users: number;
};

export type FunnelRow = {
  stepOrder: number;
  step: string;
  users: number;
  fromPrevious: number | null;
  fromSignedUp: number | null;
  barPercent: number;
  largestDropOff: boolean;
  droppedUsers: number;
  dropRate: number | null;
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

export type Activation = {
  pdfUsers: number;
  signedUp: number;
};

export type InsightsSnapshot = {
  funnel: FunnelRow[];
  retention: RetentionRow[];
  timeToValue: TimeToValue;
  activation: Activation;
};

export type AppliedFilters = {
  from: string;
  to: string;
  excluded: number;
};

export type InsightFilters =
  | { ok: false; error: string }
  | {
      ok: true;
      from: string | null;
      to: string | null;
      exclude: string[];
      applied: AppliedFilters;
    };

type RpcError = { message?: string } | null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export function parseExcludeIds(text: string): { ids: string[]; error: string | null } {
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

  if (badLines.length > 0) {
    const shown = badLines.slice(0, 5).join(", ");
    const extra = badLines.length - Math.min(badLines.length, 5);
    const more = extra > 0 ? `, and ${extra} more` : "";
    const error =
      badLines.length === 1
        ? `Line ${shown} is not a valid user id. Use one id per line.`
        : `Lines ${shown}${more} are not valid user ids. Use one id per line.`;
    return { ids: [], error };
  }

  if (ids.length > MAX_EXCLUDE_IDS) {
    return { ids: [], error: `Enter at most ${MAX_EXCLUDE_IDS} user ids.` };
  }

  return { ids, error: null };
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

export function dateBounds(fromInput: string, toInput: string):
  | { ok: true; from: string | null; to: string | null }
  | { ok: false; error: string } {
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

export function filtersFromDraft(draft: {
  from: string;
  to: string;
  excludeText: string;
}): InsightFilters {
  const parsed = parseExcludeIds(draft.excludeText);
  if (parsed.error) return { ok: false, error: parsed.error };
  const bounds = dateBounds(draft.from, draft.to);
  if (!bounds.ok) return bounds;
  return {
    ok: true,
    from: bounds.from,
    to: bounds.to,
    exclude: parsed.ids,
    applied: {
      from: draft.from.trim(),
      to: draft.to.trim(),
      excluded: parsed.ids.length,
    },
  };
}

export function describeFilters(applied: AppliedFilters): string {
  const excluded =
    applied.excluded === 0
      ? "No accounts are excluded."
      : applied.excluded === 1
        ? "1 account is excluded."
        : `${applied.excluded} accounts are excluded.`;

  let range = "Funnel and activation include every date.";
  if (applied.from && applied.to) {
    range = `Funnel and activation include ${applied.from} through ${applied.to}.`;
  } else if (applied.from) {
    range = `Funnel and activation include ${applied.from} and later.`;
  } else if (applied.to) {
    range = `Funnel and activation include dates through ${applied.to}.`;
  }

  return `${excluded} ${range} Retention and time to first value use the full history.`;
}

function ratio(part: number, whole: number): number | null {
  if (whole <= 0) return null;
  return part / whole;
}

export function buildFunnel(counts: FunnelCount[]): FunnelRow[] {
  const sorted = [...counts].sort((left, right) => left.stepOrder - right.stepOrder);
  if (sorted.length !== FUNNEL_ORDERS.length || sorted.some((row, index) => row.stepOrder !== index + 1)) {
    throw new Error("Insights returned an unexpected funnel.");
  }

  const signedUp = sorted[0]?.users ?? 0;
  let bestIndex = -1;
  let bestRate = 0;
  let bestDrop = 0;

  const rows = sorted.map((row, index) => {
    const previous = index === 0 ? null : sorted[index - 1]?.users ?? 0;
    const dropped = previous === null ? 0 : previous - row.users;
    const dropRate = previous !== null && previous > 0 ? dropped / previous : null;

    if (dropRate !== null && dropped > 0) {
      const steeper =
        bestIndex === -1 ||
        dropRate > bestRate + 1e-12 ||
        (Math.abs(dropRate - bestRate) <= 1e-12 && dropped > bestDrop);
      if (steeper) {
        bestIndex = index;
        bestRate = dropRate;
        bestDrop = dropped;
      }
    }

    return {
      stepOrder: row.stepOrder,
      step: row.step,
      users: row.users,
      fromPrevious: index === 0 ? null : ratio(row.users, previous ?? 0),
      fromSignedUp: ratio(row.users, signedUp),
      barPercent: signedUp > 0 ? Math.min(100, Math.max(0, (row.users / signedUp) * 100)) : 0,
      largestDropOff: false,
      droppedUsers: Math.max(0, dropped),
      dropRate: dropRate !== null && dropped > 0 ? dropRate : null,
    };
  });

  if (bestIndex >= 0) {
    const winner = rows[bestIndex];
    if (winner) winner.largestDropOff = true;
  }

  return rows;
}

export function buildRetention(
  counts: { relWeek: number; users: number; activated: number }[],
): RetentionRow[] {
  if (counts.length === 0) throw new Error("Insights returned an unexpected retention table.");
  const activatedValues = new Set(counts.map((row) => row.activated));
  if (activatedValues.size !== 1) throw new Error("Insights returned an unexpected retention table.");
  const activated = counts[0]?.activated ?? 0;
  const byWeek = new Map<number, number>();

  for (const row of counts) {
    if (row.relWeek < 0 || row.relWeek > 3) continue;
    if (byWeek.has(row.relWeek)) throw new Error("Insights returned an unexpected retention table.");
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

export function formatPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

export function formatMinutes(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export function formatActivation(pdfUsers: number, signedUp: number): string | null {
  if (signedUp <= 0) return null;
  return `${pdfUsers} / ${signedUp} (${formatPercent(pdfUsers / signedUp)})`;
}

export function funnelIsEmpty(rows: FunnelRow[]): boolean {
  return (rows.find((row) => row.stepOrder === 1)?.users ?? 0) === 0;
}

export function retentionIsEmpty(rows: RetentionRow[]): boolean {
  return (rows[0]?.activated ?? 0) === 0;
}

function formulaSafe(value: string): string {
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
    ["Step", "Users", "Conversion from previous", "Conversion from signed up", "Note"],
    ...rows.map((row) => [
      row.step,
      String(row.users),
      row.stepOrder === 1 ? "—" : formatPercent(row.fromPrevious),
      formatPercent(row.fromSignedUp),
      row.largestDropOff ? "Largest drop-off" : "",
    ]),
  ];
}

export function retentionTable(rows: RetentionRow[]): string[][] {
  return [
    ["Week", "Users", "Activated users", "Percent of activated"],
    ...rows.map((row) => [
      `Week ${row.relWeek}`,
      String(row.users),
      String(row.activated),
      formatPercent(row.percent),
    ]),
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
  try {
    window.localStorage.setItem(EXCLUDE_STORAGE_KEY, value);
    return true;
  } catch {
    return false;
  }
}

function scrubIds(message: string): string {
  return message.replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    "an id",
  );
}

export function explainInsightsError(error: RpcError | undefined): string {
  const message = error?.message?.trim() || "Could not load insights.";
  if (/not allowed/i.test(message)) return ACCESS_DENIED;
  if (/invalid input syntax for type uuid/i.test(message)) {
    return "One of the excluded ids is not a valid user id. Use one id per line.";
  }
  if (/does not exist|schema cache|could not find the function|PGRST202/i.test(message)) {
    return `${scrubIds(message)} Run the events SQL first, then the insights SQL, in the Supabase SQL editor.`;
  }
  return scrubIds(message);
}

function asCount(value: unknown): number {
  if (typeof value === "string" && value.trim() === "") {
    throw new Error("Insights returned a count that was not a number.");
  }
  const numeric = typeof value === "number" || typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isFinite(numeric) || numeric < 0 || !Number.isInteger(numeric)) {
    throw new Error("Insights returned a count that was not a number.");
  }
  if (numeric > Number.MAX_SAFE_INTEGER) {
    throw new Error("Insights returned a count that was not a number.");
  }
  return numeric;
}

function asMinutes(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const numeric = typeof value === "number" || typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isFinite(numeric)) throw new Error("Insights returned a duration that was not a number.");
  return numeric;
}

export function parseFunnelPayload(data: unknown): FunnelCount[] {
  if (!Array.isArray(data)) throw new Error("Insights returned an unexpected funnel.");
  return data.map((item) => {
    if (!isRecord(item)) throw new Error("Insights returned an unexpected funnel.");
    const step = typeof item.step === "string" ? item.step.trim() : "";
    if (!step) throw new Error("Insights returned an unexpected funnel.");
    return {
      stepOrder: asCount(item.step_order),
      step,
      users: asCount(item.users),
    };
  });
}

export function parseRetentionPayload(data: unknown): { relWeek: number; users: number; activated: number }[] {
  if (!Array.isArray(data)) throw new Error("Insights returned an unexpected retention table.");
  return data.map((item) => {
    if (!isRecord(item)) throw new Error("Insights returned an unexpected retention table.");
    return {
      relWeek: asCount(item.rel_week),
      users: asCount(item.users),
      activated: asCount(item.activated),
    };
  });
}

export function parseTimeToValue(data: unknown): TimeToValue {
  if (!Array.isArray(data) || data.length !== 1) {
    throw new Error("Insights returned an unexpected time to first value.");
  }
  const row = data[0];
  if (!isRecord(row)) throw new Error("Insights returned an unexpected time to first value.");
  return {
    users: asCount(row.users),
    medianMinutes: asMinutes(row.median_minutes),
    maxMinutes: asMinutes(row.max_minutes),
  };
}

export function snapshotFromPayloads(payload: {
  funnel: unknown;
  retention: unknown;
  timeToValue: unknown;
}): InsightsSnapshot {
  const funnel = buildFunnel(parseFunnelPayload(payload.funnel));
  const retention = buildRetention(parseRetentionPayload(payload.retention));
  const timeToValue = parseTimeToValue(payload.timeToValue);
  return {
    funnel,
    retention,
    timeToValue,
    activation: {
      pdfUsers: funnel.find((row) => row.stepOrder === 5)?.users ?? 0,
      signedUp: funnel.find((row) => row.stepOrder === 1)?.users ?? 0,
    },
  };
}

export async function fetchIsAdmin(): Promise<boolean> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("is_admin");
  if (error) throw new Error(explainInsightsError(error));
  if (data === true) return true;
  if (data === false) return false;
  throw new Error("Could not tell whether this account is an admin.");
}

export async function loadInsights(input: {
  from: string | null;
  to: string | null;
  exclude: string[];
}): Promise<InsightsSnapshot> {
  if (input.exclude.some((id) => !isUuid(id))) {
    throw new Error("One of the excluded ids is not a valid user id. Use one id per line.");
  }

  const supabase = createClient();
  const [funnel, retention, timeToValue] = await Promise.all([
    supabase.rpc("insights_funnel", {
      p_from: input.from,
      p_to: input.to,
      p_exclude: input.exclude,
    }),
    supabase.rpc("insights_retention", { p_exclude: input.exclude }),
    supabase.rpc("insights_time_to_value", { p_exclude: input.exclude }),
  ]);

  const error = funnel.error ?? retention.error ?? timeToValue.error;
  if (error) throw new Error(explainInsightsError(error));

  return snapshotFromPayloads({
    funnel: funnel.data,
    retention: retention.data,
    timeToValue: timeToValue.data,
  });
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
