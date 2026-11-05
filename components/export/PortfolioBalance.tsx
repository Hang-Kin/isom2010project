"use client";

import { useEffect } from "react";
import { rememberCurrentUserSelection } from "@/components/dashboard/FirstWinChecklist";
import { categoryBadgeClass, categoryLabel, CATEGORIES } from "@/lib/categories";
import { formatHours } from "@/lib/achievements";

export type PortfolioEntry = {
  category: string;
  start_date: string | null;
  end_date: string | null;
  hours: number | null;
  evidence_files: readonly unknown[];
};

export type CategorySlice = {
  category: string;
  label: string;
  count: number;
};

export type PortfolioSummary = {
  total: number;
  slices: CategorySlice[];
  withEvidence: number;
  missingEvidence: number;
  earliestYear: number | null;
  latestYear: number | null;
  /** Sum of hours the student entered. Null when no selected entry has hours. */
  hours: number | null;
  hints: string[];
};

function isIsoDay(value: string | null): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function isoDay(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isRecent(entry: PortfolioEntry, now: Date): boolean {
  const start = isIsoDay(entry.start_date) ? entry.start_date : null;
  const end = isIsoDay(entry.end_date) ? entry.end_date : null;
  if (!start && !end) return false;
  const rangeStart = start ?? end!;
  const rangeEnd = end ?? start!;
  const cutoffDate = new Date(now.getTime());
  cutoffDate.setFullYear(cutoffDate.getFullYear() - 1);
  return rangeEnd >= isoDay(cutoffDate) && rangeStart <= isoDay(now);
}

function hoursOf(value: number | null): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

export function evidenceCoverageLine(withEvidence: number, total: number): string {
  const noun = total === 1 ? "entry has" : "entries have";
  return `${withEvidence} of ${total} selected ${noun} evidence`;
}

export function summarizePortfolio(
  entries: readonly PortfolioEntry[],
  now = new Date(),
): PortfolioSummary {
  const counts = new Map<string, number>();
  let withEvidence = 0;
  let hours = 0;
  let sawHours = false;
  const years: number[] = [];

  for (const entry of entries) {
    const category = entry.category || "other";
    counts.set(category, (counts.get(category) ?? 0) + 1);
    if (Array.isArray(entry.evidence_files) && entry.evidence_files.length > 0) withEvidence += 1;
    const entryHours = hoursOf(entry.hours);
    if (entryHours !== null) {
      sawHours = true;
      hours += entryHours;
    }
    for (const value of [entry.start_date, entry.end_date]) {
      if (isIsoDay(value)) years.push(Number(value.slice(0, 4)));
    }
  }

  const known = new Set<string>(CATEGORIES.map((item) => item.value));
  const extras = [...counts.keys()]
    .filter((category) => !known.has(category))
    .sort((left, right) => categoryLabel(left).localeCompare(categoryLabel(right)));
  const slices = [...known, ...extras]
    .filter((category) => (counts.get(category) ?? 0) > 0)
    .map((category) => ({
      category,
      label: categoryLabel(category),
      count: counts.get(category) ?? 0,
    }));

  const missingEvidence = entries.length - withEvidence;
  const hints: string[] = [];
  if (entries.length > 0 && slices.length === 1) {
    hints.push("All selected entries are in one category");
  }
  if (missingEvidence === 1) hints.push("1 selected entry has no evidence");
  if (missingEvidence > 1) hints.push(`${missingEvidence} selected entries have no evidence`);
  if (entries.length > 0 && !entries.some((entry) => isRecent(entry, now))) {
    hints.push("No entries from the last 12 months");
  }

  return {
    total: entries.length,
    slices,
    withEvidence,
    missingEvidence,
    earliestYear: years.length > 0 ? Math.min(...years) : null,
    latestYear: years.length > 0 ? Math.max(...years) : null,
    hours: sawHours ? hours : null,
    hints,
  };
}

function dateLine(summary: PortfolioSummary): string {
  if (summary.earliestYear === null || summary.latestYear === null) {
    return "No dates on the selected entries.";
  }
  if (summary.earliestYear === summary.latestYear) return `Dates: ${summary.earliestYear}`;
  return `Dates: ${summary.earliestYear}–${summary.latestYear}`;
}

export function PortfolioBalance({ entries }: { entries: readonly PortfolioEntry[] }) {
  const summary = summarizePortfolio(entries);

  useEffect(() => {
    if (entries.length === 0) return;
    void rememberCurrentUserSelection();
  }, [entries.length]);

  return (
    <section className="card space-y-3" aria-labelledby="portfolio-balance-heading">
      <h2 id="portfolio-balance-heading" className="font-serif text-2xl">
        Portfolio balance
      </h2>
      {summary.total === 0 ? (
        <p className="text-sm text-muted">Select entries to see the mix.</p>
      ) : (
        <>
          <div
            className="flex h-3 overflow-hidden rounded-full bg-line"
            role="img"
            aria-label={summary.slices.map((slice) => `${slice.label} ${slice.count}`).join(", ")}
          >
            {summary.slices.map((slice) => (
              <div
                key={slice.category}
                className={`h-3 ${categoryBadgeClass(slice.category)}`}
                style={{ flexGrow: slice.count, flexBasis: 0 }}
              />
            ))}
          </div>
          <ul className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
            {summary.slices.map((slice) => (
              <li key={slice.category}>
                {slice.label} {slice.count}
              </li>
            ))}
          </ul>
          <p className="text-sm">{evidenceCoverageLine(summary.withEvidence, summary.total)}</p>
          <p className="text-sm">{dateLine(summary)}</p>
          {summary.hours !== null ? (
            <p className="text-sm">Total hours: {formatHours(summary.hours)}</p>
          ) : null}
          {summary.hints.length > 0 ? (
            <ul className="space-y-1" aria-label="Balance hints">
              {summary.hints.map((hint) => (
                <li key={hint} className="text-sm text-warning">
                  {hint}
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </section>
  );
}
