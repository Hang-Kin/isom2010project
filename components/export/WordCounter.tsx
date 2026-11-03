import {
  formatCountLabel,
  isOverLimit,
  summarizeAnswers,
  type AnswerLimitUnit,
} from "@/lib/textcount";

const toneClass = {
  normal: "text-muted",
  warning: "text-warning",
  over: "text-danger",
} as const;

export function WordCounter({
  text,
  limit,
  unit = "words",
}: {
  text: string;
  limit?: number | null;
  unit?: AnswerLimitUnit;
}) {
  const { label, tone } = formatCountLabel(text, limit, unit);

  return (
    <p aria-live="polite" aria-atomic="true" className={`text-sm font-semibold ${toneClass[tone]}`}>
      {label}
    </p>
  );
}

export function AnswerCountSummary({
  texts,
  limit,
  unit = "words",
}: {
  texts: readonly string[];
  limit?: number | null;
  unit?: AnswerLimitUnit;
}) {
  return <p className="text-sm text-muted">{summarizeAnswers(texts, limit, unit)}</p>;
}

export function CopyLimitWarning({
  texts,
  limit,
  unit = "words",
}: {
  texts: readonly string[];
  limit?: number | null;
  unit?: AnswerLimitUnit;
}) {
  const over = texts.some((text) => isOverLimit(text, limit, unit));
  if (!over) return null;

  return (
    <span
      role="status"
      className="rounded-full bg-danger-soft px-2 py-0.5 text-xs font-semibold text-danger"
    >
      Over the limit
    </span>
  );
}
