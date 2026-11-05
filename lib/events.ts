/**
 * No-op stand-in for FEAT-7.
 * On merge, keep FEAT-7's lib/events.ts and drop this stub.
 */
export function trackEvent(
  name: string,
  props?: Record<string, string | number | boolean | null>,
): void {
  void name;
  void props;
}
