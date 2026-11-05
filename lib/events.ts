import { createClient } from "@/lib/supabase/client";

/**
 * FEAT-7 owns this file. On merge, keep this implementation and discard stubs.
 * FEAT-11 may append EventName members on the marked line only.
 */

export type EventName =
  | "login"
  | "achievement_created"
  | "evidence_uploaded"
  | "entries_selected"
  | "answers_copied"
  | "pdf_generated"
  | "pdf_downloaded"
  | "packet_saved"
  | "packet_loaded"
  | "import_completed"
  | "backup_downloaded"
  | "sensitive_warning_shown"
  | "sensitive_warning_confirmed"
  | "sensitive_warning_cancelled"
  | "verifier_added"
  // FEAT-11: append feedback_submitted, suggestion_accepted, suggestion_dismissed, onboarding_completed.
  ;

type EventProps = Record<string, string | number | boolean | null>;

const MAX_PROP_LENGTH = 40;
const ANSWERS_COPIED_GAP_MS = 5000;

const DROPPED_KEYS = new Set([
  "title",
  "titles",
  "file_name",
  "filename",
  "email",
  "description",
  "content",
  "document",
  "text",
  "body",
  "comment",
  "name",
]);

let entriesSelectedLogged = false;
let answersCopiedAt = 0;
const eventStartedAt = new Map<EventName, number>();

function withMeasuredDuration(name: EventName, props: EventProps | undefined): EventProps | undefined {
  if (name !== "pdf_generated") return props;
  const started = eventStartedAt.get(name);
  eventStartedAt.delete(name);
  if (started === undefined || typeof props?.duration_ms === "number") return props;
  const duration_ms = Math.max(0, Math.round(performance.now() - started));
  return { ...props, duration_ms };
}

/**
 * Starts a duration for a later trackEvent. Used for pdf_generated so the
 * page component does not call performance.now during render.
 * Safe to call more than once: the latest call wins.
 */
export function markEvent(name: EventName): void {
  try {
    eventStartedAt.set(name, performance.now());
  } catch (error) {
    logDev(name, error);
  }
}

function logDev(name: string, error: unknown): void {
  if (process.env.NODE_ENV !== "development") return;
  const message = error instanceof Error ? error.message : "event was not recorded";
  console.error(`trackEvent ${name}: ${message}`);
}

function sanitizeProps(props: EventProps | undefined): EventProps {
  const safe: EventProps = {};
  if (!props) return safe;

  for (const [key, value] of Object.entries(props)) {
    if (!key || key.length > MAX_PROP_LENGTH) continue;
    if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
    if (DROPPED_KEYS.has(key.toLowerCase())) continue;
    if (value === null || typeof value === "boolean") {
      safe[key] = value;
      continue;
    }
    if (typeof value === "number") {
      if (Number.isFinite(value)) safe[key] = value;
      continue;
    }
    if (typeof value !== "string") continue;
    if (value.length > MAX_PROP_LENGTH) continue;
    // Titles, file names, emails, and paths are not metrics.
    if (/\s/.test(value) || value.includes("@")) continue;
    if (/[\\/]/.test(value) || /\.[a-z0-9]{1,8}$/i.test(value)) continue;
    if (/^\d{8,}$/.test(value)) continue;
    safe[key] = value;
  }

  return safe;
}

function reserve(name: EventName, props: EventProps): boolean {
  if (name === "entries_selected") {
    if (typeof props.count === "number" && props.count <= 0) return false;
    if (entriesSelectedLogged) return false;
    entriesSelectedLogged = true;
    return true;
  }

  if (name === "answers_copied") {
    const now = Date.now();
    if (now - answersCopiedAt < ANSWERS_COPIED_GAP_MS) return false;
    answersCopiedAt = now;
    return true;
  }

  return true;
}

function release(name: EventName): void {
  if (name === "entries_selected") entriesSelectedLogged = false;
  if (name === "answers_copied") answersCopiedAt = 0;
}

async function persist(name: EventName, props: EventProps): Promise<void> {
  try {
    const supabase = createClient();
    const { data, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !data.session) {
      release(name);
      if (sessionError) logDev(name, sessionError);
      return;
    }

    const { error } = await supabase.from("events").insert({
      event_name: name,
      props,
    });

    if (error) {
      release(name);
      logDev(name, error);
    }
  } catch (error) {
    release(name);
    logDev(name, error);
  }
}

/** Fire-and-forget. Never throws and never blocks the action that called it. */
export function trackEvent(name: EventName, props?: EventProps): void {
  try {
    const safe = sanitizeProps(withMeasuredDuration(name, props));
    if (!reserve(name, safe)) return;
    void persist(name, safe);
  } catch (error) {
    logDev(name, error);
  }
}
