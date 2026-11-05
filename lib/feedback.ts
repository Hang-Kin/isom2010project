import { friendlySupabaseError } from "@/lib/supabase/errors";
import { createClient } from "@/lib/supabase/client";

export const FEEDBACK_COMMENT_MAX = 200;
export const FEEDBACK_MINUTES_MAX = 600;

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

const SAVE_ERROR = "Could not save your feedback. Check your connection and try again.";

function calmSaveError(message: string): string {
  if (!message || /failed to fetch|network|load failed|typeerror/i.test(message)) return SAVE_ERROR;
  return message;
}

function isMatch(value: string): value is FeedbackMatch {
  return (MATCHED as readonly string[]).includes(value);
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

/**
 * Inserts one pdf_export row. Requires the public.feedback SQL from the pull request.
 * This function does not run that SQL. Invalid answers are rejected before any request.
 */
export async function submitFeedback(input: FeedbackInput): Promise<FeedbackResult> {
  const validated = validateFeedback(input);
  if (!validated.ok) return validated;

  try {
    const supabase = createClient();
    const { error } = await supabase.from("feedback").insert({
      kind: "pdf_export",
      matched: validated.value.matched,
      // SELF-REPORT. Not a measured duration.
      minutes_normally: validated.value.minutesNormally,
      comment: validated.value.comment,
    });
    if (error) {
      return {
        ok: false,
        error: calmSaveError(friendlySupabaseError(error, SAVE_ERROR)),
      };
    }
    return { ok: true };
  } catch (cause) {
    return {
      ok: false,
      error: calmSaveError(cause instanceof Error ? cause.message : ""),
    };
  }
}
