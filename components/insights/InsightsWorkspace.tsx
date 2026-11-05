"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FunnelTable } from "@/components/insights/FunnelTable";
import { RetentionTable } from "@/components/insights/RetentionTable";
import { Field, PageHeader, StatusMessage } from "@/components/ui";
import {
  ACCESS_DENIED,
  HONEST_LIMITS,
  NO_DATA_YET,
  describeFilters,
  fetchIsAdmin,
  filtersFromDraft,
  formatActivation,
  formatMinutes,
  funnelIsEmpty,
  loadInsights,
  retentionIsEmpty,
  writeExcludeDraft,
  readExcludeDraft,
  type AppliedFilters,
  type InsightsSnapshot,
} from "@/lib/insights";

type ErrorKind = "validation" | "load";

type Phase =
  | { kind: "checking" }
  | { kind: "denied" }
  | { kind: "failed"; message: string }
  | {
      kind: "admin";
      loading: boolean;
      error: string | null;
      errorKind: ErrorKind | null;
      notice: string | null;
      snapshot: InsightsSnapshot | null;
      applied: AppliedFilters | null;
    };

const STORAGE_WARNING = "Could not save excluded ids in this browser.";

export function InsightsWorkspace() {
  const [phase, setPhase] = useState<Phase>({ kind: "checking" });
  const [reloadKey, setReloadKey] = useState(0);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [excludeText, setExcludeText] = useState("");
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const requestRef = useRef(0);
  const mountedRef = useRef(true);

  const runLoad = useCallback(
    async (
      draft: { from: string; to: string; excludeText: string },
      requestId: number,
      success: string,
    ) => {
      const filters = filtersFromDraft(draft);
      if (!filters.ok) {
        if (!mountedRef.current || requestRef.current !== requestId) return;
        setPhase((current) => {
          if (current.kind === "admin") {
            return { ...current, loading: false, error: filters.error, errorKind: "validation", notice: null };
          }
          return {
            kind: "admin",
            loading: false,
            error: filters.error,
            errorKind: "validation",
            notice: null,
            snapshot: null,
            applied: null,
          };
        });
        return;
      }

      setPhase((current) => ({
        kind: "admin",
        loading: true,
        error: null,
        errorKind: null,
        notice: null,
        snapshot: current.kind === "admin" ? current.snapshot : null,
        applied: current.kind === "admin" ? current.applied : null,
      }));

      try {
        const snapshot = await loadInsights({
          from: filters.from,
          to: filters.to,
          exclude: filters.exclude,
        });
        if (!mountedRef.current || requestRef.current !== requestId) return;
        setPhase({
          kind: "admin",
          loading: false,
          error: null,
          errorKind: null,
          notice: success,
          snapshot,
          applied: filters.applied,
        });
      } catch (cause) {
        if (!mountedRef.current || requestRef.current !== requestId) return;
        const message = cause instanceof Error ? cause.message : "Could not load insights.";
        if (message === ACCESS_DENIED) {
          setPhase({ kind: "denied" });
          return;
        }
        setPhase((current) => {
          const snapshot = current.kind === "admin" ? current.snapshot : null;
          const applied = current.kind === "admin" ? current.applied : null;
          const stale = snapshot ? " The tables still show the previous totals." : "";
          return {
            kind: "admin",
            loading: false,
            error: `${message}${stale}`,
            errorKind: "load",
            notice: null,
            snapshot,
            applied,
          };
        });
      }
    },
    [],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const requestId = ++requestRef.current;
    const stored = readExcludeDraft();

    async function start() {
      try {
        const allowed = await fetchIsAdmin();
        if (!active || requestRef.current !== requestId) return;
        if (!allowed) {
          setPhase({ kind: "denied" });
          return;
        }
        setExcludeText(stored);
        await runLoad({ from: "", to: "", excludeText: stored }, requestId, "Insights loaded.");
      } catch (cause) {
        if (!active || requestRef.current !== requestId) return;
        const message = cause instanceof Error ? cause.message : "Could not load insights.";
        if (message === ACCESS_DENIED) {
          setPhase({ kind: "denied" });
          return;
        }
        setPhase({ kind: "failed", message });
      }
    }

    void start();
    return () => {
      active = false;
    };
  }, [reloadKey, runLoad]);

  function rememberExclude(value: string) {
    setExcludeText(value);
    setStorageWarning(writeExcludeDraft(value) ? null : STORAGE_WARNING);
  }

  function applyFilters() {
    if (phase.kind !== "admin" || phase.loading) return;
    const requestId = ++requestRef.current;
    if (!writeExcludeDraft(excludeText)) setStorageWarning(STORAGE_WARNING);
    void runLoad({ from, to, excludeText }, requestId, "Insights updated.");
  }

  function retryLoad() {
    if (phase.kind !== "admin" || phase.loading) return;
    const requestId = ++requestRef.current;
    void runLoad({ from, to, excludeText }, requestId, "Insights updated.");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Insights"
        lede="Totals for the course evaluation. These figures are counts only."
      />

      {phase.kind === "checking" ? <StatusMessage tone="info">Checking access…</StatusMessage> : null}

      {phase.kind === "denied" ? (
        <section className="card">
          <p>{ACCESS_DENIED}</p>
        </section>
      ) : null}

      {phase.kind === "failed" ? (
        <div className="space-y-3">
          <StatusMessage tone="error">{phase.message}</StatusMessage>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setPhase({ kind: "checking" });
              setReloadKey((value) => value + 1);
            }}
          >
            Try again
          </button>
        </div>
      ) : null}

      {phase.kind === "admin" ? (
        <AdminInsights
          phase={phase}
          from={from}
          to={to}
          excludeText={excludeText}
          storageWarning={storageWarning}
          onFrom={setFrom}
          onTo={setTo}
          onExclude={rememberExclude}
          onApply={applyFilters}
          onRetry={retryLoad}
        />
      ) : null}
    </div>
  );
}

function AdminInsights({
  phase,
  from,
  to,
  excludeText,
  storageWarning,
  onFrom,
  onTo,
  onExclude,
  onApply,
  onRetry,
}: {
  phase: Extract<Phase, { kind: "admin" }>;
  from: string;
  to: string;
  excludeText: string;
  storageWarning: string | null;
  onFrom: (value: string) => void;
  onTo: (value: string) => void;
  onExclude: (value: string) => void;
  onApply: () => void;
  onRetry: () => void;
}) {
  const snapshot = phase.snapshot;
  const funnelEmpty = snapshot ? funnelIsEmpty(snapshot.funnel) : false;
  const retentionEmpty = snapshot ? retentionIsEmpty(snapshot.retention) : false;
  const timeEmpty = snapshot ? snapshot.timeToValue.users === 0 : false;
  const activationText = snapshot ? formatActivation(snapshot.activation.pdfUsers, snapshot.activation.signedUp) : null;

  return (
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
          onApply();
        }}
      >
        <div>
          <h2 className="font-serif text-2xl">Filters</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            The date range applies to the funnel and the activation card. The end date is included, in
            your local timezone. Retention and time to first value use the full history, with the same
            excluded ids.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="From" htmlFor="insights-from">
            <input
              id="insights-from"
              className="field-input"
              type="date"
              value={from}
              onChange={(event) => onFrom(event.target.value)}
              disabled={phase.loading}
            />
          </Field>
          <Field label="To" htmlFor="insights-to">
            <input
              id="insights-to"
              className="field-input"
              type="date"
              value={to}
              onChange={(event) => onTo(event.target.value)}
              disabled={phase.loading}
            />
          </Field>
        </div>
        <Field
          label="Team user ids to exclude"
          htmlFor="insights-exclude"
          hint="One user id per line. Saved in this browser. The totals leave these accounts out and do not list them."
        >
          <textarea
            id="insights-exclude"
            className="field-input min-h-28 font-mono text-sm"
            value={excludeText}
            onChange={(event) => onExclude(event.target.value)}
            spellCheck={false}
            autoComplete="off"
            disabled={phase.loading}
            placeholder="One user id per line"
          />
        </Field>
        <button type="submit" className="btn btn-primary" disabled={phase.loading}>
          {phase.loading ? "Loading…" : "Apply filters"}
        </button>
      </form>

      {storageWarning ? <StatusMessage tone="warning">{storageWarning}</StatusMessage> : null}
      {phase.loading ? <StatusMessage tone="info">Loading insights…</StatusMessage> : null}
      {!phase.loading && phase.error ? <StatusMessage tone="error">{phase.error}</StatusMessage> : null}
      {!phase.loading && phase.error && phase.errorKind === "load" ? (
        <button type="button" className="btn btn-secondary" onClick={onRetry}>
          Try again
        </button>
      ) : null}
      {!phase.loading && !phase.error && phase.notice ? (
        <StatusMessage tone="success">{phase.notice}</StatusMessage>
      ) : null}

      {snapshot && phase.applied ? (
        <div className="space-y-6" aria-busy={phase.loading}>
          <p className="text-sm text-muted">{describeFilters(phase.applied)}</p>

          {funnelEmpty ? (
            <section className="card space-y-2" aria-labelledby="insights-funnel-empty">
              <h2 id="insights-funnel-empty" className="font-serif text-2xl">
                Funnel
              </h2>
              <p>{NO_DATA_YET}</p>
            </section>
          ) : (
            <FunnelTable rows={snapshot.funnel} disabled={phase.loading} />
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="card space-y-3" aria-labelledby="insights-activation">
              <h2 id="insights-activation" className="font-serif text-2xl">
                Activation
              </h2>
              <p className="text-sm leading-relaxed text-muted">
                Activation is the first PDF generated, not registration.
              </p>
              {activationText ? (
                <>
                  <p className="font-serif text-4xl leading-tight">{activationText}</p>
                  <p className="text-sm text-muted">PDF-generating users / signed-up users</p>
                </>
              ) : (
                <p>{NO_DATA_YET}</p>
              )}
            </section>

            <section className="card space-y-3" aria-labelledby="insights-time">
              <h2 id="insights-time" className="font-serif text-2xl">
                Time to first value
              </h2>
              <p className="text-sm leading-relaxed text-muted">
                Minutes from sign-up to the first PDF generated.
              </p>
              {timeEmpty ? (
                <p>{NO_DATA_YET}</p>
              ) : (
                <dl className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <dt className="text-sm text-muted">Users</dt>
                    <dd className="font-serif text-3xl">{snapshot.timeToValue.users}</dd>
                  </div>
                  <div>
                    <dt className="text-sm text-muted">Median minutes</dt>
                    <dd className="font-serif text-3xl">{formatMinutes(snapshot.timeToValue.medianMinutes)}</dd>
                  </div>
                  <div>
                    <dt className="text-sm text-muted">Max minutes</dt>
                    <dd className="font-serif text-3xl">{formatMinutes(snapshot.timeToValue.maxMinutes)}</dd>
                  </div>
                </dl>
              )}
            </section>
          </div>

          {retentionEmpty ? (
            <section className="card space-y-2" aria-labelledby="insights-retention-empty">
              <h2 id="insights-retention-empty" className="font-serif text-2xl">
                Retention
              </h2>
              <p>{NO_DATA_YET}</p>
            </section>
          ) : (
            <RetentionTable rows={snapshot.retention} disabled={phase.loading} />
          )}
        </div>
      ) : null}
    </>
  );
}
