import { createClient } from "@/lib/supabase/client";
import { formatLayeredError } from "@/lib/supabase/errors";

export const FEEDBACK_COMMENT_MAX = 200;
export const FEEDBACK_MINUTES_MAX = 600;

/** Ask again only while this signed-in user has dismissed the dialog fewer than twice. */
export const FEEDBACK_DISMISS_LIMIT = 2;

const DISMISS_STORAGE_PREFIX = "evidence-vault:feedback-dismiss:";

export type FeedbackMatch = "yes" | "mostly" | "no";

const MATCHED: readonly FeedbackMatch[] = ["yes", "mostly", "no"];

export type FeedbackInput = {
  matched: string;
  minutesNormally: number | null;
  comment: string | null;
};

export type ValidFeedback = {
  matched: FeedbackMatch;
  /** SELF-REPORT. Not a measured duration. Treat it as a self-report in the evaluation. */
  minutesNormally: number | null;
  comment: string | null;
};

export type FeedbackResult = { ok: true } | { ok: false; error: string };

const SAVE_ERROR = "Could not save your feedback";

function isMatch(value: string): value is FeedbackMatch {
  return (MATCHED as readonly string[]).includes(value);
}

export function feedbackDismissStorageKey(userId: string): string {
  return `${DISMISS_STORAGE_PREFIX}${userId}`;
}

/** Dismissal count for this user. A missing or unreadable value counts as zero. */
export function readFeedbackDismissals(userId: string): number {
  if (!userId || typeof window === "undefined") return 0;
  try {
    const raw = window.localStorage.getItem(feedbackDismissStorageKey(userId));
    if (raw === null || !/^\d+$/.test(raw)) return 0;
    const value = Number(raw);
    return Number.isSafeInteger(value) ? value : 0;
  } catch {
    return 0;
  }
}

/** Records one dismissal. Storage failures still let the dialog close. */
export function recordFeedbackDismissal(userId: string): void {
  if (!userId || typeof window === "undefined") return;
  try {
    const next = readFeedbackDismissals(userId) + 1;
    window.localStorage.setItem(feedbackDismissStorageKey(userId), String(next));
  } catch {
    // The PDF must stay usable when the browser blocks localStorage.
  }
}

export type FeedbackPromptDecision = { ask: true; userId: string } | { ask: false };

/**
 * Show the prompt only when this user has no feedback rows and fewer than two dismissals.
 * The row check is head/count of id for the signed-in user. It never reads comment text.
 */
export async function shouldAskForFeedback(): Promise<FeedbackPromptDecision> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user?.id) return { ask: false };

    const userId = data.user.id;
    if (readFeedbackDismissals(userId) >= FEEDBACK_DISMISS_LIMIT) return { ask: false };

    const { count, error: countError } = await supabase
      .from("feedback")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);

    if (countError || typeof count !== "number") return { ask: false };
    return count === 0 ? { ask: true, userId } : { ask: false };
  } catch {
    return { ask: false };
  }
}

/**
 * minutesNormally is a SELF-REPORT of how long this packet would normally take.
 * The app does not time the student. Evaluations must treat the number as a self-report.
 */
export function parseMinutes(
  raw: string,
): { ok: true; value: number | null } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, value: null };
  if (!/^\d+$/.test(trimmed)) {
    return { ok: false, error: "Minutes must be a whole number from 0 to 600." };
  }
  const value = Number(trimmed);
  if (value > FEEDBACK_MINUTES_MAX) {
    return { ok: false, error: "Minutes must be a whole number from 0 to 600." };
  }
  return { ok: true, value };
}

export function parseComment(
  raw: string,
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (raw.length > FEEDBACK_COMMENT_MAX) {
    return { ok: false, error: "Comment must be 200 characters or fewer." };
  }
  const trimmed = raw.trim();
  if (trimmed.length > FEEDBACK_COMMENT_MAX) {
    return { ok: false, error: "Comment must be 200 characters or fewer." };
  }
  return { ok: true, value: trimmed.length > 0 ? trimmed : null };
}

export function validateFeedback(
  input: FeedbackInput,
): { ok: true; value: ValidFeedback } | { ok: false; error: string } {
  if (!isMatch(input.matched)) {
    return { ok: false, error: "Choose Yes, Mostly, or No." };
  }

  let minutesNormally: number | null = null;
  if (input.minutesNormally !== null) {
    if (
      typeof input.minutesNormally !== "number" ||
      !Number.isInteger(input.minutesNormally) ||
      input.minutesNormally < 0 ||
      input.minutesNormally > FEEDBACK_MINUTES_MAX
    ) {
      return { ok: false, error: "Minutes must be a whole number from 0 to 600." };
    }
    minutesNormally = input.minutesNormally;
  }

  let comment: string | null = null;
  if (input.comment !== null) {
    if (typeof input.comment !== "string") {
      return { ok: false, error: "Comment must be 200 characters or fewer." };
    }
    const parsed = parseComment(input.comment);
    if (!parsed.ok) return parsed;
    comment = parsed.value;
  }

  return {
    ok: true,
    value: {
      matched: input.matched,
      minutesNormally,
      comment,
    },
  };
}

function isAbort(cause: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  if (!cause || typeof cause !== "object") return false;
  const name = "name" in cause && typeof cause.name === "string" ? cause.name : "";
  const message = "message" in cause && typeof cause.message === "string" ? cause.message : "";
  return name === "AbortError" || /aborted/i.test(message);
}

/**
 * Inserts one pdf_export row. Requires the public.feedback SQL from the pull request.
 * This function does not run that SQL. Invalid answers are rejected before any request.
 * Pass a signal so closing the dialog can cancel an insert that has not finished.
 */
export async function submitFeedback(
  input: FeedbackInput,
  signal?: AbortSignal,
): Promise<FeedbackResult> {
  const validated = validateFeedback(input);
  if (!validated.ok) return validated;
  if (signal?.aborted) return { ok: false, error: SAVE_ERROR };

  try {
    const supabase = createClient();
    let request = supabase.from("feedback").insert({
      kind: "pdf_export",
      matched: validated.value.matched,
      // SELF-REPORT. Not a measured duration.
      minutes_normally: validated.value.minutesNormally,
      comment: validated.value.comment,
    });
    if (signal) request = request.abortSignal(signal);
    const { error } = await request;
    if (isAbort(error, signal)) return { ok: false, error: SAVE_ERROR };
    if (error) return { ok: false, error: formatLayeredError(SAVE_ERROR, error) };
    return { ok: true };
  } catch (cause) {
    if (isAbort(cause, signal)) return { ok: false, error: SAVE_ERROR };
    return { ok: false, error: formatLayeredError(SAVE_ERROR, cause) };
  }
}
