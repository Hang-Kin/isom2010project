"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { StatusMessage } from "@/components/ui";
import { normalizeAchievement, type AchievementCardModel } from "@/lib/achievements";
import { formatLayeredError } from "@/lib/supabase/errors";
import { createClient } from "@/lib/supabase/client";

export type AttentionIssue = "evidence" | "dates" | "description" | "organiser";

const ISSUE_LABELS: Record<AttentionIssue, string> = {
  evidence: "No evidence",
  dates: "No dates",
  description: "Short description",
  organiser: "No organiser",
};

const ISSUE_ORDER: AttentionIssue[] = ["evidence", "dates", "description", "organiser"];

export function issuesFor(entry: AchievementCardModel): AttentionIssue[] {
  const issues: AttentionIssue[] = [];
  if (entry.evidenceCount === 0) issues.push("evidence");
  if (!entry.start_date && !entry.end_date) issues.push("dates");
  if ((entry.description ?? "").trim().length < 40) issues.push("description");
  if (
    (entry.category === "award" || entry.category === "internship") &&
    !(entry.organizer ?? "").trim()
  ) {
    issues.push("organiser");
  }
  return issues;
}

export function NeedsAttention() {
  const [entries, setEntries] = useState<AchievementCardModel[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;

    async function load(silent: boolean) {
      if (!silent) setLoading(true);
      try {
        const supabase = createClient();
        const { data, error: queryError } = await supabase
          .from("achievements")
          .select(
            "id, user_id, title, category, organizer, role, start_date, end_date, hours, description, created_at, updated_at, evidence_files(id)",
          )
          .order("created_at", { ascending: false });

        if (!active) return;
        if (queryError) {
          setError(formatLayeredError("Could not check your entries", queryError));
          return;
        }

        const next = (data ?? [])
          .map((row) => normalizeAchievement(row))
          .filter((row): row is AchievementCardModel => row !== null);
        setEntries(next);
        setError(null);
      } catch (cause) {
        if (!active) return;
        setError(formatLayeredError("Could not check your entries", cause));
      } finally {
        if (active) setLoading(false);
      }
    }

    void load(false);

    function refresh() {
      void load(true);
    }

    function onVisible() {
      if (document.visibilityState === "visible") refresh();
    }

    window.addEventListener("focus", refresh);
    window.addEventListener("pageshow", refresh);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      active = false;
      window.removeEventListener("focus", refresh);
      window.removeEventListener("pageshow", refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [reloadKey]);

  const flagged = (entries ?? [])
    .map((entry) => ({ entry, issues: issuesFor(entry) }))
    .filter((item) => item.issues.length > 0)
    .sort((left, right) => {
      const byCount = right.issues.length - left.issues.length;
      if (byCount !== 0) return byCount;
      return right.entry.created_at.localeCompare(left.entry.created_at);
    });

  const counts = ISSUE_ORDER.map((issue) => ({
    issue,
    label: ISSUE_LABELS[issue],
    count: flagged.filter((item) => item.issues.includes(issue)).length,
  })).filter((item) => item.count > 0);

  if (loading && entries === null) {
    return <StatusMessage tone="info">Checking which entries need attention…</StatusMessage>;
  }

  if (error && entries === null) {
    return (
      <div className="space-y-3">
        <StatusMessage tone="error">{error}</StatusMessage>
        <button type="button" className="btn btn-secondary" onClick={() => setReloadKey((value) => value + 1)}>
          Try again
        </button>
      </div>
    );
  }

  if (flagged.length === 0) return null;

  const shown = flagged.slice(0, 5);

  return (
    <section className="card space-y-4" aria-labelledby="needs-attention-title" data-feat12="needs-attention">
      <div>
        <h2 id="needs-attention-title" className="font-serif text-2xl">
          Needs attention
        </h2>
        <p className="mt-1 text-sm text-muted">
          These entries are thin for an application. A reader needs dates, a clear description, and
          proof of what you did.
        </p>
      </div>
      <ul className="flex flex-wrap gap-2" aria-label="Issue counts">
        {counts.map((item) => (
          <li
            key={item.issue}
            className="rounded-full bg-warning-soft px-2.5 py-0.5 text-xs font-semibold text-warning"
          >
            {item.label} · {item.count}
          </li>
        ))}
      </ul>
      <ul className="space-y-3">
        {shown.map(({ entry, issues }) => (
          <li key={entry.id} className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold">{entry.title}</p>
              <p className="text-sm text-muted">{issues.map((issue) => ISSUE_LABELS[issue]).join(" · ")}</p>
            </div>
            <Link href={`/dashboard/achievements/${entry.id}/edit`} className="btn btn-secondary">
              Edit<span className="sr-only"> {entry.title}</span>
            </Link>
          </li>
        ))}
      </ul>
      {flagged.length > shown.length ? (
        <p className="text-sm text-muted">
          Showing {shown.length} of {flagged.length} entries.
        </p>
      ) : null}
      {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}
    </section>
  );
}
