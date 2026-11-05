"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { SuggestionFeedback } from "@/components/export/SuggestionFeedback"; // FEAT-11
import { StatusMessage } from "@/components/ui";
import { categoryBadgeClass, categoryLabel } from "@/lib/categories";
import {
  MAX_CRITERIA_LENGTH,
  extractKeywords,
  mergeRelevanceSelection,
  rankAchievements,
  type Keyword,
  type KeywordMatch,
  type RankedEntry,
  type RelevanceEntry,
} from "@/lib/relevance";

export type RelevancePanelAchievement = RelevanceEntry & { id: string };

type Status = {
  tone: "error" | "success" | "info" | "warning";
  text: string;
};

const HONESTY_NOTE =
  "Keyword matching only. It does not understand meaning, and it cannot know what assessors value. Use it as a prompt for your own judgement.";

function entryWord(count: number): string {
  return count === 1 ? "entry" : "entries";
}

function parseTopCount(value: string): { count: number } | { error: string } {
  const trimmed = value.trim();
  if (!trimmed) return { error: "Enter how many top entries to select." };
  if (!/^\d+$/.test(trimmed)) return { error: "Top entries must be a whole number." };
  const count = Number(trimmed);
  if (count < 1) return { error: "Select at least 1 entry." };
  if (count > 200) return { error: "Select 200 entries or fewer." };
  return { count };
}

function sameTerms(left: readonly Keyword[], right: readonly Keyword[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((item, index) => item.term === right[index]?.term && item.count === right[index]?.count);
}

function ResultRow({
  item,
  selected,
  disabled,
  onAdd,
}: {
  item: RankedEntry<RelevancePanelAchievement>;
  selected: boolean;
  disabled: boolean;
  onAdd: () => void;
}) {
  const { entry, score, matches } = item;
  return (
    <li className="space-y-2 rounded-md border border-line p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="font-semibold break-words">{entry.title}</p>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${categoryBadgeClass(entry.category)}`}
            >
              {categoryLabel(entry.category)}
            </span>
            {selected ? (
              <span className="text-xs font-semibold text-accent-strong">In selection</span>
            ) : null}
          </div>
        </div>
        <button type="button" className="btn btn-secondary" onClick={onAdd} disabled={disabled}>
          Add this entry
        </button>
      </div>
      <div className="flex items-center gap-2">
        <div
          className="h-2 flex-1 overflow-hidden rounded-full bg-line"
          role="meter"
          aria-label={`Relevance score for ${entry.title}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={score}
          aria-valuetext={`${score} out of 100`}
        >
          <div className="h-2 rounded-full bg-accent" style={{ width: `${score}%` }} />
        </div>
        <span className="w-10 text-right text-sm font-semibold tabular-nums">{score}</span>
      </div>
      {matches.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {matches.map((match) => (
            <MatchChip key={match.keyword} match={match} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted">No keyword overlap.</p>
      )}
    </li>
  );
}

function MatchChip({ match }: { match: KeywordMatch }) {
  return (
    <span className="rounded-full border border-line bg-white px-2 py-0.5 text-xs">
      {match.keyword} · {match.fields.join(", ")}
    </span>
  );
}

/**
 * Ranks entries by keyword overlap. onSelect receives the full next id list:
 * current ids are kept, and new ids are appended, unless Replace selection is on.
 */
export function RelevancePanel({
  achievements,
  selectedIds,
  onSelect,
}: {
  achievements: readonly RelevancePanelAchievement[];
  selectedIds: readonly string[];
  onSelect: (ids: string[]) => void;
}) {
  const [criteria, setCriteria] = useState("");
  const [topCount, setTopCount] = useState("5");
  const [replace, setReplace] = useState(false);
  const [draftKeywords, setDraftKeywords] = useState<Keyword[]>([]);
  const [activeKeywords, setActiveKeywords] = useState<Keyword[] | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const token = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      token.current += 1;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const ranked = useMemo(() => {
    if (!activeKeywords || activeKeywords.length === 0) return null;
    return rankAchievements(achievements, activeKeywords);
  }, [achievements, activeKeywords]);

  const matched = ranked?.filter((item) => item.score > 0) ?? [];
  const unmatched = ranked?.filter((item) => item.score === 0) ?? [];
  const keywordsDirty = activeKeywords !== null && !sameTerms(draftKeywords, activeKeywords);

  function runBusy(label: string, work: () => void) {
    const id = token.current + 1;
    token.current = id;
    setBusy(label);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (token.current !== id) return;
      try {
        work();
      } catch (cause) {
        setStatus({
          tone: "error",
          text: cause instanceof Error ? cause.message : "Could not update keyword relevance.",
        });
      } finally {
        if (token.current === id) setBusy(null);
      }
    }, 0);
  }

  function analyse() {
    const snapshot = criteria;
    runBusy("Analysing keywords…", () => {
      if (achievements.length === 0) {
        setStatus({
          tone: "info",
          text: "Add an achievement before analysing. Nothing was selected.",
        });
        return;
      }
      if (snapshot.length > MAX_CRITERIA_LENGTH) {
        setStatus({ tone: "error", text: "Criteria must be 5,000 characters or fewer." });
        return;
      }
      if (!snapshot.trim()) {
        setDraftKeywords([]);
        setActiveKeywords(null);
        setStatus({
          tone: "info",
          text: "Paste the scholarship criteria or job description first. Nothing was selected.",
        });
        return;
      }

      const extracted = extractKeywords(snapshot);
      if (extracted.length === 0) {
        setDraftKeywords([]);
        setActiveKeywords(null);
        setStatus({
          tone: "info",
          text: "No usable keywords found. Try specific skills or themes. Nothing was selected.",
        });
        return;
      }

      setDraftKeywords(extracted);
      setActiveKeywords(extracted);
      const best = rankAchievements(achievements, extracted).some((item) => item.score > 0);
      setStatus({
        tone: "success",
        text: best
          ? `Ranked ${achievements.length} ${entryWord(achievements.length)} from ${extracted.length} keywords.`
          : `Ranked ${achievements.length} ${entryWord(achievements.length)}. No entries matched these keywords.`,
      });
    });
  }

  function rerun() {
    runBusy("Analysing keywords…", () => {
      if (draftKeywords.length === 0) {
        setActiveKeywords(null);
        setStatus({
          tone: "info",
          text: "Keep at least one keyword, or paste criteria and analyse again. Nothing was selected.",
        });
        return;
      }
      setActiveKeywords(draftKeywords.map((item) => ({ ...item })));
      setStatus({
        tone: "success",
        text: `Ranked ${achievements.length} ${entryWord(achievements.length)} from ${draftKeywords.length} keywords.`,
      });
    });
  }

  function removeKeyword(term: string) {
    setDraftKeywords((current) => current.filter((item) => item.term !== term));
    setStatus({ tone: "info", text: `Removed "${term}". Re-run to update the ranking.` });
  }

  function addEntry(id: string, title: string) {
    runBusy("Updating selection…", () => {
      const already = selectedIds.includes(id);
      if (!replace && already) {
        setStatus({ tone: "info", text: `"${title}" is already in your selection.` });
        return;
      }
      onSelect(mergeRelevanceSelection(selectedIds, [id], replace));
      setStatus({
        tone: "success",
        text: replace
          ? `Replaced your selection with "${title}".`
          : `Added "${title}" to your selection.`,
      });
    });
  }

  function selectTop() {
    runBusy("Updating selection…", () => {
      if (!ranked) {
        setStatus({ tone: "error", text: "Analyse criteria before selecting entries." });
        return;
      }
      const parsed = parseTopCount(topCount);
      if ("error" in parsed) {
        setStatus({ tone: "error", text: parsed.error });
        return;
      }
      const positive = ranked.filter((item) => item.score > 0);
      if (positive.length === 0) {
        setStatus({
          tone: "info",
          text: "No entries matched those keywords, so the selection was left unchanged.",
        });
        return;
      }

      const chosen = positive.slice(0, parsed.count);
      const ids = chosen.map((item) => item.entry.id);
      const added = ids.filter((id) => !selectedIds.includes(id)).length;
      if (!replace && added === 0) {
        setStatus({ tone: "info", text: "Those entries are already in your selection." });
        return;
      }

      onSelect(mergeRelevanceSelection(selectedIds, ids, replace));
      if (replace) {
        setStatus({
          tone: "success",
          text:
            chosen.length < parsed.count
              ? `Only ${chosen.length} ${entryWord(chosen.length)} matched. Replaced your selection with ${chosen.length === 1 ? "that entry" : `those ${chosen.length}`}.`
              : `Replaced your selection with the top ${chosen.length} ${entryWord(chosen.length)}.`,
        });
        return;
      }
      setStatus({
        tone: "success",
        text:
          chosen.length < parsed.count
            ? `Only ${chosen.length} ${entryWord(chosen.length)} matched. Added ${added} to your selection.`
            : `Added ${added} ${entryWord(added)} to your selection.`,
      });
    });
  }

  return (
    <section className="card space-y-4" aria-labelledby="relevance-heading">
      <div className="space-y-2">
        <h2 id="relevance-heading" className="font-serif text-2xl">
          Keyword relevance
        </h2>
        <p className="rounded-md border border-warning/40 bg-warning-soft px-3 py-2 text-sm text-warning">
          {HONESTY_NOTE}
        </p>
      </div>

      <label className="block space-y-1.5 text-sm font-semibold" htmlFor="relevance-criteria">
        Paste the scholarship criteria or job description
        <textarea
          id="relevance-criteria"
          className="field-input min-h-28 resize-y font-normal"
          value={criteria}
          maxLength={MAX_CRITERIA_LENGTH}
          onChange={(event) => setCriteria(event.target.value.slice(0, MAX_CRITERIA_LENGTH))}
          placeholder="Example: leadership experience and community service"
        />
      </label>
      <p className="text-sm text-muted">
        {criteria.length}/{MAX_CRITERIA_LENGTH} characters. 5,000 characters maximum.
      </p>

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary" onClick={analyse} disabled={busy !== null}>
          {busy === "Analysing keywords…" ? "Analysing…" : "Analyse"}
        </button>
        {activeKeywords || draftKeywords.length > 0 ? (
          <button type="button" className="btn btn-secondary" onClick={rerun} disabled={busy !== null}>
            Re-run
          </button>
        ) : null}
      </div>

      {busy ? <StatusMessage tone="info">{busy}</StatusMessage> : null}
      {!busy && status ? <StatusMessage tone={status.tone}>{status.text}</StatusMessage> : null}

      {draftKeywords.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Extracted keywords</h3>
          <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto">
            {draftKeywords.map((keyword) => (
              <button
                key={keyword.term}
                type="button"
                className="inline-flex items-center gap-1 rounded-full border border-line bg-white px-2.5 py-1 text-sm"
                onClick={() => removeKeyword(keyword.term)}
                disabled={busy !== null}
                aria-label={
                  keyword.count > 1
                    ? `Remove keyword ${keyword.term}, counted ${keyword.count} times`
                    : `Remove keyword ${keyword.term}`
                }
              >
                <span>{keyword.term}</span>
                {keyword.count > 1 ? <span className="text-muted">×{keyword.count}</span> : null}
                <span aria-hidden="true">×</span>
              </button>
            ))}
          </div>
          {keywordsDirty ? (
            <p className="text-sm text-muted">Keywords changed. Re-run to update the ranking.</p>
          ) : (
            <p className="text-sm text-muted">Remove a keyword that does not belong, then re-run.</p>
          )}
        </div>
      ) : null}

      {ranked ? (
        <div className="space-y-4">
          {/* FEAT-11 */}
          <SuggestionFeedback
            items={matched}
            keywords={activeKeywords}
            disabled={busy !== null}
            onAdd={addEntry}
          />
          <div className="flex flex-wrap items-end gap-3">
            <label className="space-y-1.5 text-sm font-semibold" htmlFor="relevance-top-n">
              Select top
              <div className="w-24">
                <input
                  id="relevance-top-n"
                  className="field-input font-normal"
                  inputMode="numeric"
                  value={topCount}
                  onChange={(event) => setTopCount(event.target.value)}
                  disabled={busy !== null}
                />
              </div>
            </label>
            <button type="button" className="btn btn-primary" onClick={selectTop} disabled={busy !== null}>
              Select top {topCount.trim() || "N"}
            </button>
            <label className="flex items-center gap-2 pb-2 text-sm font-semibold" htmlFor="relevance-replace">
              <input
                id="relevance-replace"
                type="checkbox"
                checked={replace}
                onChange={(event) => setReplace(event.target.checked)}
                disabled={busy !== null}
              />
              Replace selection
            </label>
          </div>
          <p className="text-sm text-muted">
            New picks are added to your current selection. Turn on Replace selection to drop entries
            you had already picked.
          </p>

          {matched.length === 0 ? (
            <p className="text-sm text-muted">No entries matched these keywords.</p>
          ) : (
            <ul className="space-y-3">
              {matched.map((item) => (
                <ResultRow
                  key={item.entry.id}
                  item={item}
                  selected={selectedIds.includes(item.entry.id)}
                  disabled={busy !== null}
                  onAdd={() => addEntry(item.entry.id, item.entry.title)}
                />
              ))}
            </ul>
          )}

          {unmatched.length > 0 ? (
            <details className="rounded-md border border-line p-3">
              <summary className="cursor-pointer text-sm font-semibold">
                No keyword match ({unmatched.length})
              </summary>
              <ul className="mt-3 space-y-3">
                {unmatched.map((item) => (
                  <ResultRow
                    key={item.entry.id}
                    item={item}
                    selected={selectedIds.includes(item.entry.id)}
                    disabled={busy !== null}
                    onAdd={() => addEntry(item.entry.id, item.entry.title)}
                  />
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
