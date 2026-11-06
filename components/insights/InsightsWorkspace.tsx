"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { FeedbackTable } from "@/components/insights/FeedbackTable";
import { FunnelTable } from "@/components/insights/FunnelTable";
import { RetentionTable } from "@/components/insights/RetentionTable";
import { Field, PageHeader, StatusMessage } from "@/components/ui";
import {
  ACCESS_DENIED,
  ACTIVATION_DEFINITION,
  FUNNEL_NOTE,
  HONEST_LIMITS,
  NO_DATA_YET,
  activationError,
  activationFromRows,
  dateBounds,
  describeFilters,
  fetchIsAdmin,
  formatMinutes,
  loadFeedback,
  loadFunnel,
  loadRetention,
  loadTimeToValue,
  parseExcludeIds,
  readExcludeDraft,
  writeExcludeDraft,
  type ActivationView,
  type AppliedFilters,
  type FeedbackSummary,
  type FunnelRow,
  type InsightLoad,
  type RetentionRow,
  type TimeToValue,
} from "@/lib/insights";

type Access = "checking" | "denied" | "admin";

type Phase<T> =
  | { status: "loading" }
  | { status: "empty" }
  | { status: "error"; message: string }
  | { status: "ready"; data: T };

type Draft = {
  from: string;
  to: string;
  excludeText: string;
};

const STORAGE_WARNING = "Could not save the exclude list in this browser.";
const BLOCKED_MESSAGE = "Fix the exclude list, then refresh.";

const loadingPhase = { status: "loading" } as const;

export function InsightsWorkspace() {
  const [access, setAccess] = useState<Access>("checking");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [excludeText, setExcludeText] = useState("");
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [funnel, setFunnel] = useState<Phase<FunnelRow[]>>(loadingPhase);
  const [activation, setActivation] = useState<Phase<ActivationView>>(loadingPhase);
  const [retention, setRetention] = useState<Phase<RetentionRow[]>>(loadingPhase);
  const [timeToValue, setTimeToValue] = useState<Phase<TimeToValue>>(loadingPhase);
  const [feedback, setFeedback] = useState<Phase<FeedbackSummary>>(loadingPhase);
  const requestRef = useRef(0);
  const refreshLock = useRef(false);

  const excludeParse = useMemo(() => parseExcludeIds(excludeText), [excludeText]);
  const bounds = useMemo(() => dateBounds(from, to), [from, to]);
  const dateError = bounds.ok ? null : bounds.error;
  const loading =
    access === "admin" &&
    [funnel, activation, retention, timeToValue, feedback].some((phase) => phase.status === "loading");

  const run = useCallback(async (draft: Draft, source: "load" | "refresh") => {
    const requestId = ++requestRef.current;
    const current = () => requestRef.current === requestId;
    const exclude = parseExcludeIds(draft.excludeText);
    const dates = dateBounds(draft.from, draft.to);

    if (exclude.blocked) {
      if (!current()) return;
      const blocked: Phase<never> = { status: "error", message: BLOCKED_MESSAGE };
      setNotice(null);
      setSummary(null);
      setFunnel(blocked);
      setActivation(blocked);
      setRetention(blocked);
      setTimeToValue(blocked);
      setFeedback(blocked);
      return;
    }

    if (!current()) return;
    setNotice(null);
    const applied: AppliedFilters = {
      from: draft.from.trim(),
      to: draft.to.trim(),
      excluded: exclude.ids.length,
    };
    setSummary(describeFilters(applied, dates.ok ? null : dates.error));
    setFunnel(loadingPhase);
    setActivation(loadingPhase);
    setRetention(loadingPhase);
    setTimeToValue(loadingPhase);
    setFeedback(loadingPhase);

    const funnelTask: Promise<InsightLoad<FunnelRow[]>> = dates.ok
      ? loadFunnel({ from: dates.from, to: dates.to, exclude: exclude.ids })
      : Promise.resolve({ status: "error", message: dates.error });

    const [funnelResult, retentionResult, timeResult, feedbackResult] = await Promise.all([
      funnelTask,
      loadRetention(exclude.ids),
      loadTimeToValue(exclude.ids),
      loadFeedback(exclude.ids),
    ]);
    if (!current()) return;

    if (
      funnelResult.status === "denied" ||
      retentionResult.status === "denied" ||
      timeResult.status === "denied" ||
      feedbackResult.status === "denied"
    ) {
      setAccess("denied");
      return;
    }

    const funnelPhase = present(funnelResult);
    let activationFailed = false;
    if (funnelPhase.status === "ready") {
      const view = activationFromRows(funnelPhase.data);
      if (view === "missing") {
        activationFailed = true;
        setActivation({ status: "error", message: activationError });
      } else if (view === "empty") {
        setActivation({ status: "empty" });
      } else {
        setActivation({ status: "ready", data: view });
      }
      setFunnel(funnelPhase);
    } else if (funnelPhase.status === "empty") {
      setFunnel({ status: "empty" });
      setActivation({ status: "empty" });
    } else {
      setFunnel(funnelPhase);
      setActivation(funnelPhase);
    }

    setRetention(present(retentionResult));
    setTimeToValue(present(timeResult));
    setFeedback(present(feedbackResult));

    const failed =
      activationFailed ||
      funnelResult.status === "error" ||
      retentionResult.status === "error" ||
      timeResult.status === "error" ||
      feedbackResult.status === "error";
    if (source === "refresh" && !failed) setNotice("Updated.");
  }, []);

  useEffect(() => {
    let active = true;
    const stored = readExcludeDraft();

    void fetchIsAdmin().then((allowed) => {
      if (!active) return;
      if (!allowed) {
        setAccess("denied");
        return;
      }
      setExcludeText(stored);
      setAccess("admin");
      void run({ from: "", to: "", excludeText: stored }, "load");
    });

    return () => {
      active = false;
      requestRef.current += 1;
    };
  }, [run]);

  function rememberExclude(value: string) {
    setExcludeText(value);
    const parsed = parseExcludeIds(value);
    if (parsed.blocked) return;
    setStorageWarning(writeExcludeDraft(value) ? null : STORAGE_WARNING);
  }

  async function refresh() {
    if (loading || excludeParse.blocked || refreshLock.current) return;
    refreshLock.current = true;
    try {
      const allowed = await fetchIsAdmin();
      if (!allowed) {
        setAccess("denied");
        return;
      }
      setStorageWarning(writeExcludeDraft(excludeText) ? null : STORAGE_WARNING);
      await run({ from, to, excludeText }, "refresh");
    } finally {
      refreshLock.current = false;
    }
  }

  return (
    <div className="min-w-0 space-y-6">
      <PageHeader title="Insights" lede="Totals for the course evaluation. These figures are counts only." />

      {access === "checking" ? <StatusMessage tone="info">Checking access…</StatusMessage> : null}

      {access === "denied" ? (
        <section className="card">
          <p>{ACCESS_DENIED}</p>
        </section>
      ) : null}

      {access === "admin" ? (
        <>
          <section className="card space-y-2 border-warning/40 bg-warning-soft" aria-labelledby="insights-limits">
            <h2 id="insights-limits" className="font-serif text-2xl text-warning">
              Limits
            </h2>
            <p className="text-sm leading-relaxed">{HONEST_LIMITS}</p>
          </section>

          <form
            className="card space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              refresh();
            }}
          >
            <div>
              <h2 className="font-serif text-2xl">Filters</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted">
                Dates are optional and apply to the funnel only. The end date is included, in your local
                timezone. Excluded ids apply to every figure.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="From" htmlFor="insights-from">
                <input
                  id="insights-from"
                  className="field-input"
                  type="date"
                  value={from}
                  onChange={(event) => setFrom(event.target.value)}
                  disabled={loading}
                  aria-invalid={dateError ? true : undefined}
                  aria-describedby={dateError ? "insights-dates-error" : undefined}
                />
              </Field>
              <Field label="To" htmlFor="insights-to">
                <input
                  id="insights-to"
                  className="field-input"
                  type="date"
                  value={to}
                  onChange={(event) => setTo(event.target.value)}
                  disabled={loading}
                  aria-invalid={dateError ? true : undefined}
                  aria-describedby={dateError ? "insights-dates-error" : undefined}
                />
              </Field>
            </div>
            {dateError ? (
              <p id="insights-dates-error" className="text-sm text-danger" role="alert">
                {dateError}
              </p>
            ) : null}
            <Field
              label="Exclude user ids (one per line)"
              htmlFor="insights-exclude"
              hint="Saved in this browser. Invalid lines are ignored."
              error={excludeParse.error ?? undefined}
            >
              <textarea
                id="insights-exclude"
                className="field-input min-h-28 font-mono text-sm"
                value={excludeText}
                onChange={(event) => rememberExclude(event.target.value)}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                autoComplete="off"
                disabled={loading}
                aria-invalid={excludeParse.error ? true : undefined}
                aria-describedby={excludeParse.error ? "insights-exclude-error" : undefined}
                placeholder="One user id per line"
              />
            </Field>
            <button
              type="submit"
              className="btn btn-primary w-full sm:w-auto"
              disabled={loading || excludeParse.blocked}
            >
              {loading ? "Refreshing…" : "Refresh"}
            </button>
          </form>

          {storageWarning ? <StatusMessage tone="warning">{storageWarning}</StatusMessage> : null}
          {summary ? <p className="text-sm text-muted">{summary}</p> : null}
          {notice ? <StatusMessage tone="success">{notice}</StatusMessage> : null}

          <InsightBlock
            id="insights-funnel"
            title="Funnel"
            description="Distinct users at each step. The bar is scaled to the largest step."
            note={FUNNEL_NOTE}
            phase={funnel}
          >
            {funnel.status === "ready" ? <FunnelTable rows={funnel.data} /> : null}
          </InsightBlock>

          <div className="grid min-w-0 gap-4 md:grid-cols-2">
            <InsightBlock
              id="insights-activation"
              title="Activation"
              description={`Activation is the ${ACTIVATION_DEFINITION}.`}
              phase={activation}
            >
              {activation.status === "ready" ? (
                <>
                  <p className="font-serif text-3xl leading-tight break-words sm:text-4xl">{activation.data.label}</p>
                  <p className="text-sm text-muted">Generated PDF users / Signed up users</p>
                </>
              ) : null}
            </InsightBlock>

            <InsightBlock
              id="insights-time"
              title="Time to first value"
              description="Minutes from account creation to the first PDF."
              phase={timeToValue}
            >
              {timeToValue.status === "ready" ? (
                <dl className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-3">
                  <div className="min-w-0">
                    <dt className="text-sm text-muted">Users</dt>
                    <dd className="font-serif text-3xl tabular-nums">{timeToValue.data.users}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-sm text-muted">Median minutes</dt>
                    <dd className="font-serif text-3xl tabular-nums">
                      {formatMinutes(timeToValue.data.medianMinutes)}
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-sm text-muted">Max minutes</dt>
                    <dd className="font-serif text-3xl tabular-nums">
                      {formatMinutes(timeToValue.data.maxMinutes)}
                    </dd>
                  </div>
                </dl>
              ) : null}
            </InsightBlock>
          </div>

          <InsightBlock
            id="insights-retention"
            title="Retention"
            description="Relative weeks 0 to 3. Week 0 starts at the first PDF generated or downloaded. The percent uses activated users as the denominator."
            phase={retention}
          >
            {retention.status === "ready" ? <RetentionTable rows={retention.data} /> : null}
          </InsightBlock>

          <InsightBlock
            id="insights-feedback"
            title="Feedback"
            description="Responses and the average minutes for each answer: Yes, Mostly, and No. The minutes are a self-report."
            phase={feedback}
          >
            {feedback.status === "ready" ? <FeedbackTable summary={feedback.data} /> : null}
          </InsightBlock>

          <section className="card space-y-3" aria-labelledby="insights-gates">
            <h2 id="insights-gates" className="font-serif text-2xl">
              Course gates
            </h2>
            <div className="space-y-3 text-sm leading-relaxed">
              <p>
                <span className="font-semibold">Gate 1, adoption.</span> The funnel and the activation rate are
                the adoption measures, and activation is the {ACTIVATION_DEFINITION}.
              </p>
              <p>
                <span className="font-semibold">Gate 2, continued use.</span> Retention across relative weeks, and
                any second-day PDF, are the continued-use measures.
              </p>
              <p>
                <span className="font-semibold">Gate 3, value.</span> The feedback match rate, the share of Yes or
                Mostly answers, is the value measure.
              </p>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

function present<T>(result: InsightLoad<T>): Phase<T> {
  if (result.status === "denied") return { status: "error", message: ACCESS_DENIED };
  return result;
}

function InsightBlock({
  id,
  title,
  description,
  note,
  phase,
  children,
}: {
  id: string;
  title: string;
  description: string;
  note?: string;
  phase: Phase<unknown>;
  children?: ReactNode;
}) {
  return (
    <section className="card min-w-0 space-y-4" aria-labelledby={id} aria-busy={phase.status === "loading"}>
      <div className="max-w-2xl">
        <h2 id={id} className="font-serif text-2xl">
          {title}
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-muted">{description}</p>
        {note ? <p className="mt-2 text-sm leading-relaxed">{note}</p> : null}
      </div>
      {phase.status === "loading" ? <p className="text-sm text-muted">Loading…</p> : null}
      {phase.status === "empty" ? <p>{NO_DATA_YET}</p> : null}
      {phase.status === "error" ? <StatusMessage tone="error">{phase.message}</StatusMessage> : null}
      {phase.status === "ready" ? children : null}
    </section>
  );
}
