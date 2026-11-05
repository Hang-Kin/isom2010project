"use client";

import { useState, type FormEvent } from "react";
import { StatusMessage } from "@/components/ui";
import { parseComment, parseMinutes, submitFeedback, type FeedbackMatch } from "@/lib/feedback";
import { trackEvent } from "@/lib/events";

const CHOICES: { value: FeedbackMatch; label: string }[] = [
  { value: "yes", label: "Yes" },
  { value: "mostly", label: "Mostly" },
  { value: "no", label: "No" },
];

/**
 * Shown once for each generated PDF. minutes_normally is a SELF-REPORT of how long
 * this packet would normally take. It is not a measured duration. Treat it as a
 * self-report in the evaluation.
 */
export function PostExportFeedback({ generationId }: { generationId: string | null }) {
  const [matched, setMatched] = useState<FeedbackMatch | null>(null);
  const [minutesRaw, setMinutesRaw] = useState("");
  const [comment, setComment] = useState("");
  const [phase, setPhase] = useState<"ask" | "saving" | "thanks" | "hidden">("ask");
  const [error, setError] = useState<string | null>(null);

  if (!generationId || phase === "hidden") return null;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (phase === "saving") return;

    const minutes = parseMinutes(minutesRaw);
    if (!minutes.ok) {
      setError(minutes.error);
      return;
    }
    const parsedComment = parseComment(comment);
    if (!parsedComment.ok) {
      setError(parsedComment.error);
      return;
    }
    if (!matched) {
      setError("Choose Yes, Mostly, or No.");
      return;
    }

    setPhase("saving");
    setError(null);
    const result = await submitFeedback({
      matched,
      minutesNormally: minutes.value,
      comment: parsedComment.value,
    });
    if (!result.ok) {
      setPhase("ask");
      setError(result.error);
      return;
    }

    try {
      trackEvent("feedback_submitted", { matched });
    } catch {
      // The row is already saved. Logging must not hide the thank-you.
    }
    setPhase("thanks");
  }

  if (phase === "thanks") {
    return (
      <p className="text-sm font-semibold text-accent-strong" role="status">
        Thanks.
      </p>
    );
  }

  return (
    <form
      className="space-y-3 rounded-md border border-line p-3"
      onSubmit={(event) => void onSubmit(event)}
      aria-busy={phase === "saving"}
    >
      <fieldset className="space-y-2" disabled={phase === "saving"}>
        <legend className="text-sm font-semibold">Did this packet match what you needed?</legend>
        <div className="flex flex-wrap gap-2">
          {CHOICES.map((choice) => (
            <button
              key={choice.value}
              type="button"
              className={matched === choice.value ? "btn btn-primary" : "btn btn-secondary"}
              aria-pressed={matched === choice.value}
              onClick={() => {
                setMatched(choice.value);
                setError(null);
              }}
            >
              {choice.label}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="block space-y-1.5 text-sm font-semibold" htmlFor="feedback-minutes">
        About how many minutes would this normally take you?
        <input
          id="feedback-minutes"
          className="field-input font-normal"
          inputMode="numeric"
          value={minutesRaw}
          onChange={(event) => setMinutesRaw(event.target.value)}
          disabled={phase === "saving"}
          aria-describedby="feedback-minutes-hint"
        />
      </label>
      {/* SELF-REPORT: the student estimates minutes. This is not a timer. */}
      <p id="feedback-minutes-hint" className="text-sm text-muted">
        Optional. A whole number from 0 to 600. This is your own estimate.
      </p>

      <label className="block space-y-1.5 text-sm font-semibold" htmlFor="feedback-comment">
        Comment
        <textarea
          id="feedback-comment"
          className="field-input min-h-20 resize-y font-normal"
          value={comment}
          maxLength={200}
          onChange={(event) => setComment(event.target.value.slice(0, 200))}
          disabled={phase === "saving"}
          placeholder="Anything confusing or missing? Please do not include personal details."
        />
      </label>
      <p className="text-sm text-muted">{comment.length}/200 characters.</p>

      {phase === "saving" ? <StatusMessage tone="info">Saving your answer…</StatusMessage> : null}
      {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}

      <div className="flex flex-wrap gap-2">
        <button type="submit" className="btn btn-primary" disabled={phase === "saving"}>
          {phase === "saving" ? "Saving…" : "Submit"}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={phase === "saving"}
          onClick={() => setPhase("hidden")}
        >
          Not now
        </button>
      </div>
    </form>
  );
}
