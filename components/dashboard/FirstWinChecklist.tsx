"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { StatusMessage } from "@/components/ui";
import { trackEvent } from "@/lib/events";
import { createClient } from "@/lib/supabase/client";
import { friendlySupabaseError } from "@/lib/supabase/errors";

const SELECTED_PREFIX = "evidence-vault:feat11:selected:";
const TRACKED_PREFIX = "evidence-vault:feat11:onboarding-tracked:";
const DISMISSED_PREFIX = "evidence-vault:feat11:onboarding-dismissed:";

const trackedInTab = new Set<string>();

type StepId = "entry" | "evidence" | "select" | "pdf";

type Step = {
  id: StepId;
  label: string;
  href: string;
  done: boolean;
};

type Ready = {
  status: "ready";
  userId: string;
  steps: Step[];
  done: number;
  total: number;
  allDone: boolean;
  pdfHidden: boolean;
};

type Model =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "hidden" }
  | Ready;

function storageGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Guidance only. A blocked browser store must not stop the dashboard.
  }
}

export function rememberEntriesSelected(userId: string): void {
  if (!userId) return;
  storageSet(`${SELECTED_PREFIX}${userId}`, "1");
}

export function entriesWereSelected(userId: string): boolean {
  if (!userId) return false;
  return storageGet(`${SELECTED_PREFIX}${userId}`) === "1";
}

/** Records that this signed-in user has selected at least one export entry. Stores a flag only. */
export async function rememberCurrentUserSelection(): Promise<void> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return;
    rememberEntriesSelected(data.user.id);
  } catch {
    // Export must keep working when this reminder cannot be stored.
  }
}

function calmMessage(cause: unknown, fallback: string): string {
  const message = cause instanceof Error ? cause.message : "";
  if (/auth session missing|not authenticated|invalid jwt/i.test(message)) {
    return "You need to log in before this guide can check your steps.";
  }
  if (!message || /failed to fetch|network|load failed|typeerror/i.test(message)) return fallback;
  return message;
}

function isMissingRelation(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  return /does not exist|schema cache|could not find the table|could not find the/i.test(
    error.message ?? "",
  );
}

function shouldTrackOnboarding(userId: string): boolean {
  if (trackedInTab.has(userId)) return false;
  if (storageGet(`${TRACKED_PREFIX}${userId}`) === "1") {
    trackedInTab.add(userId);
    return false;
  }
  storageSet(`${TRACKED_PREFIX}${userId}`, "1");
  trackedInTab.add(userId);
  return true;
}

export function FirstWinChecklist() {
  const [model, setModel] = useState<Model>({ status: "loading" });
  const [reloadKey, setReloadKey] = useState(0);
  const stopped = useRef(false);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    stopped.current = false;

    async function load(background: boolean) {
      try {
        const supabase = createClient();
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (!active || stopped.current) return;
        if (userError) {
          throw new Error(friendlySupabaseError(userError, "Could not check your steps. Try again."));
        }
        if (!userData.user) {
          if (!background) {
            setModel({
              status: "error",
              message: "You need to log in before this guide can check your steps.",
            });
          }
          return;
        }

        const userId = userData.user.id;
        if (storageGet(`${DISMISSED_PREFIX}${userId}`) === "1") {
          stopped.current = true;
          setModel({ status: "hidden" });
          return;
        }

        const [achievementResult, evidenceResult, pdfResult, selectedResult] = await Promise.all([
          supabase
            .from("achievements")
            .select("id", { count: "exact", head: true })
            .eq("user_id", userId),
          supabase
            .from("evidence_files")
            .select("id", { count: "exact", head: true })
            .eq("user_id", userId),
          supabase
            .from("events")
            .select("id", { count: "exact", head: true })
            .eq("user_id", userId)
            .eq("event_name", "pdf_generated"),
          supabase
            .from("events")
            .select("id", { count: "exact", head: true })
            .eq("user_id", userId)
            .eq("event_name", "entries_selected"),
        ]);
        if (!active || stopped.current) return;

        if (achievementResult.error) {
          throw new Error(
            friendlySupabaseError(achievementResult.error, "Could not check your entries."),
          );
        }
        if (evidenceResult.error) {
          throw new Error(
            friendlySupabaseError(evidenceResult.error, "Could not check your evidence."),
          );
        }

        const pdfHidden = isMissingRelation(pdfResult.error);
        if (pdfResult.error && !pdfHidden) {
          throw new Error(friendlySupabaseError(pdfResult.error, "Could not check your PDF step."));
        }

        let selectedFromEvents = false;
        if (isMissingRelation(selectedResult.error)) {
          selectedFromEvents = false;
        } else if (selectedResult.error) {
          throw new Error(
            friendlySupabaseError(selectedResult.error, "Could not check your export step."),
          );
        } else {
          selectedFromEvents = (selectedResult.count ?? 0) > 0;
        }

        const steps: Step[] = [
          {
            id: "entry",
            label: "Add an entry",
            href: "/dashboard/achievements/new",
            done: (achievementResult.count ?? 0) > 0,
          },
          {
            id: "evidence",
            label: "Attach evidence",
            href: "/dashboard/achievements",
            done: (evidenceResult.count ?? 0) > 0,
          },
          {
            id: "select",
            label: "Select entries on the Export page",
            href: "/dashboard/export",
            done: selectedFromEvents || entriesWereSelected(userId),
          },
        ];
        if (!pdfHidden) {
          steps.push({
            id: "pdf",
            label: "Generate your PDF",
            href: "/dashboard/export",
            done: (pdfResult.count ?? 0) > 0,
          });
        }

        const done = steps.filter((step) => step.done).length;
        setModel({
          status: "ready",
          userId,
          steps,
          done,
          total: steps.length,
          allDone: !pdfHidden && done === steps.length,
          pdfHidden,
        });
      } catch (cause) {
        if (!active || stopped.current) return;
        const message = calmMessage(cause, "Could not check your steps. Try again.");
        setModel((current) => {
          if (background && current.status === "ready") return current;
          return { status: "error", message };
        });
      }
    }

    function schedule() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (!active || stopped.current) return;
        if (document.visibilityState !== "visible") {
          schedule();
          return;
        }
        void load(true).finally(() => {
          if (active && !stopped.current) schedule();
        });
      }, 15000);
    }

    void load(false).finally(() => {
      if (active && !stopped.current) schedule();
    });

    function refresh() {
      if (stopped.current || document.visibilityState === "hidden") return;
      void load(true);
    }

    window.addEventListener("focus", refresh);
    window.addEventListener("storage", refresh);
    document.addEventListener("visibilitychange", refresh);

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [reloadKey]);

  useEffect(() => {
    if (model.status !== "ready" || !model.allDone) return;
    if (!shouldTrackOnboarding(model.userId)) return;
    try {
      trackEvent("onboarding_completed");
    } catch {
      // The guide still switches to All set. Logging must not block the page.
    }
  }, [model]);

  if (model.status === "hidden") return null;

  if (model.status === "loading") {
    return (
      <section className="card" aria-labelledby="first-packet-heading">
        <h2 id="first-packet-heading" className="font-serif text-2xl">
          Your first packet in 4 steps
        </h2>
        <div className="mt-3">
          <StatusMessage tone="info">Checking your first packet…</StatusMessage>
        </div>
      </section>
    );
  }

  if (model.status === "error") {
    return (
      <section className="card space-y-3" aria-labelledby="first-packet-heading">
        <h2 id="first-packet-heading" className="font-serif text-2xl">
          Your first packet in 4 steps
        </h2>
        <StatusMessage tone="error">{model.message}</StatusMessage>
        <button type="button" className="btn btn-secondary" onClick={() => setReloadKey((value) => value + 1)}>
          Try again
        </button>
      </section>
    );
  }

  if (model.allDone) {
    return (
      <section className="card flex flex-wrap items-center justify-between gap-3" aria-label="First packet">
        <p className="font-semibold" role="status">
          All set.
        </p>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            stopped.current = true;
            storageSet(`${DISMISSED_PREFIX}${model.userId}`, "1");
            setModel({ status: "hidden" });
          }}
        >
          Dismiss
        </button>
      </section>
    );
  }

  return (
    <section className="card space-y-3" aria-labelledby="first-packet-heading">
      <h2 id="first-packet-heading" className="font-serif text-2xl">
        Your first packet in 4 steps
      </h2>
      <div
        className="h-2 overflow-hidden rounded-full bg-line"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={model.total}
        aria-valuenow={model.done}
        aria-label={`${model.done} of ${model.total} done`}
      >
        <div
          className="h-2 rounded-full bg-accent"
          style={{ width: `${model.total === 0 ? 0 : (model.done / model.total) * 100}%` }}
        />
      </div>
      <p className="text-sm font-semibold">
        {model.done} of {model.total} done
      </p>
      {model.pdfHidden ? (
        <p className="text-sm text-muted">The PDF step is hidden until the events table is available.</p>
      ) : null}
      <ol className="space-y-2">
        {model.steps.map((step, index) => (
          <li key={step.id} className="flex items-center justify-between gap-3">
            <Link href={step.href} className="font-semibold text-accent-strong">
              {index + 1}. {step.label}
            </Link>
            {step.done ? (
              <span className="text-sm font-semibold text-accent-strong">Done</span>
            ) : (
              <span className="text-sm text-muted">Not yet</span>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
