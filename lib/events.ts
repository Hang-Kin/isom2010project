/**
 * FEAT-11 no-op stub. This file does not exist on main yet.
 * On merge, keep FEAT-7's lib/events.ts and append only these EventName members:
 * "feedback_submitted" | "suggestion_accepted" | "suggestion_dismissed" | "onboarding_completed"
 */
export type EventName =
  // FEAT-11
  | "feedback_submitted"
  | "suggestion_accepted"
  | "suggestion_dismissed"
  | "onboarding_completed";

/**
 * Fire-and-forget. FEAT-7 replaces this with the real insert.
 * Must never throw and must never block the UI.
 */
export function trackEvent(
  name: EventName,
  props?: Record<string, string | number | boolean | null>,
): void {
  void name;
  void props;
}
