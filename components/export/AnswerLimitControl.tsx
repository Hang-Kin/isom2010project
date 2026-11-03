"use client";

import { useState } from "react";
import { StatusMessage } from "@/components/ui";
import {
  ANSWER_LIMIT_MAX,
  ANSWER_LIMIT_MIN,
  answerLimitStatus,
  parseAnswerLimit,
  type AnswerLimitUnit,
} from "@/lib/textcount";

export type AnswerLimitValue = {
  limit: number | null;
  unit: AnswerLimitUnit;
};

export function AnswerLimitControl({
  value,
  onChange,
}: {
  value: AnswerLimitValue;
  onChange: (value: AnswerLimitValue) => void;
}) {
  const limitKey = value.limit === null ? "" : String(value.limit);
  const [draft, setDraft] = useState<string | null>(null);
  const [seenLimit, setSeenLimit] = useState(limitKey);

  if (seenLimit !== limitKey) {
    setSeenLimit(limitKey);
    setDraft(null);
  }

  const shown = draft === null ? limitKey : draft;
  const parsed = parseAnswerLimit(shown);

  function updateDraft(next: string) {
    setDraft(next);
    const result = parseAnswerLimit(next);
    if (result.error) return;
    if (result.limit === value.limit) return;
    onChange({ limit: result.limit, unit: value.unit });
  }

  function updateUnit(unit: AnswerLimitUnit) {
    if (unit === value.unit) return;
    onChange({ limit: value.limit, unit });
  }

  return (
    <section className="card space-y-4" aria-label="Answer limit">
      <h2 className="font-serif text-2xl">Answer limit</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1.5 text-sm font-semibold" htmlFor="answer-limit">
          Limit ({ANSWER_LIMIT_MIN}-{ANSWER_LIMIT_MAX})
          <input
            id="answer-limit"
            className="field-input font-normal"
            type="number"
            inputMode="numeric"
            min={ANSWER_LIMIT_MIN}
            max={ANSWER_LIMIT_MAX}
            step={1}
            value={shown}
            placeholder="No limit"
            autoComplete="off"
            aria-invalid={parsed.error ? true : undefined}
            aria-describedby="answer-limit-status"
            onChange={(event) => updateDraft(event.target.value)}
          />
        </label>
        <label className="space-y-1.5 text-sm font-semibold" htmlFor="answer-limit-unit">
          Count by
          <select
            id="answer-limit-unit"
            className="field-input font-normal"
            value={value.unit}
            onChange={(event) => updateUnit(event.target.value as AnswerLimitUnit)}
          >
            <option value="words">Words</option>
            <option value="chars">Characters</option>
          </select>
        </label>
      </div>
      <div id="answer-limit-status">
        {parsed.error ? (
          <StatusMessage tone="error">{parsed.error}</StatusMessage>
        ) : value.limit === null ? (
          <StatusMessage tone="info">{answerLimitStatus(null, value.unit)}</StatusMessage>
        ) : (
          <StatusMessage tone="success">{answerLimitStatus(value.limit, value.unit)}</StatusMessage>
        )}
      </div>
      <p className="text-sm text-muted">
        Leave blank for no limit. Character limits use the count with spaces. Counts are advice
        only and do not block copying or the PDF.
      </p>
    </section>
  );
}
