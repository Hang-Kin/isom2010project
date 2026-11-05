"use client";

import { useState } from "react";
import { HowItWorks } from "@/components/export/HowItWorks";
import { StatusMessage } from "@/components/ui";
import { trackEvent } from "@/lib/events";

type SuggestionSource = {
  entry: { id: string; title: string };
  score: number;
};

type Decision = "accepted" | "dismissed";

type Notice = {
  key: string;
  tone: "success" | "error" | "info";
  text: string;
};

export function scoreBucket(score: number): "high" | "mid" | "low" {
  if (!Number.isFinite(score)) return "low";
  if (score >= 67) return "high";
  if (score >= 34) return "mid";
  return "low";
}

function sessionKeyOf(keywords: readonly { term: string; count: number }[] | null): string {
  if (!keywords || keywords.length === 0) return "";
  return keywords.map((item) => `${item.term}:${item.count}`).join("|");
}

export function SuggestionFeedback({
  items,
  keywords,
  disabled,
  onAdd,
}: {
  items: readonly SuggestionSource[];
  keywords: readonly { term: string; count: number }[] | null;
  disabled: boolean;
  onAdd: (id: string, title: string) => void;
}) {
  const sessionKey = sessionKeyOf(keywords);
  const [bucket, setBucket] = useState<{ key: string; decisions: Record<string, Decision> }>({
    key: sessionKey,
    decisions: {},
  });
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const decisions = bucket.key === sessionKey ? bucket.decisions : {};
  const visibleNotice = notice && notice.key === sessionKey ? notice : null;
  const used = items.filter((item) => decisions[item.entry.id] === "accepted").length;

  async function choose(item: SuggestionSource, rank: number, action: Decision) {
    if (disabled || pending) return;
    setPending(true);
    setNotice({ key: sessionKey, tone: "info", text: "Saving your choice…" });
    await Promise.resolve();
    try {
      if (action === "accepted") onAdd(item.entry.id, item.entry.title);
      try {
        // Props are rank and score_bucket only. Never send the title, keywords, or description.
        trackEvent(action === "accepted" ? "suggestion_accepted" : "suggestion_dismissed", {
          rank,
          score_bucket: scoreBucket(item.score),
        });
      } catch {
        // The choice still stands. Logging must not block the export page.
      }
      setBucket((current) => {
        const base = current.key === sessionKey ? current.decisions : {};
        return { key: sessionKey, decisions: { ...base, [item.entry.id]: action } };
      });
      setNotice({
        key: sessionKey,
        tone: "success",
        text: action === "accepted" ? "Added to your selection." : "Marked as not relevant.",
      });
    } catch {
      setNotice({
        key: sessionKey,
        tone: "error",
        text: "Could not add that entry. Try again.",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-3">
      <HowItWorks />
      {items.length > 0 ? (
        <>
          <p className="text-sm text-muted">Tell us which suggestions helped. Add also selects that entry.</p>
          <p className="text-sm font-semibold" role="status">
            You used {used} of {items.length} suggestions
          </p>
          <ul className="space-y-2">
            {items.map((item, index) => {
              const decision = decisions[item.entry.id];
              const rank = index + 1;
              return (
                <li
                  key={item.entry.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line p-3"
                >
                  <p className="min-w-0 font-semibold break-words">{item.entry.title}</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={decision === "accepted" ? "btn btn-primary" : "btn btn-secondary"}
                      aria-pressed={decision === "accepted"}
                      disabled={disabled || pending}
                      onClick={() => void choose(item, rank, "accepted")}
                    >
                      Add
                    </button>
                    <button
                      type="button"
                      className={decision === "dismissed" ? "btn btn-primary" : "btn btn-secondary"}
                      aria-pressed={decision === "dismissed"}
                      disabled={disabled || pending}
                      onClick={() => void choose(item, rank, "dismissed")}
                    >
                      Not relevant
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          {visibleNotice ? (
            <StatusMessage tone={visibleNotice.tone}>{visibleNotice.text}</StatusMessage>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
