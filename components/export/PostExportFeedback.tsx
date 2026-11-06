"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { StatusMessage } from "@/components/ui";
import {
  parseComment,
  parseMinutes,
  recordFeedbackDismissal,
  shouldAskForFeedback,
  submitFeedback,
  type FeedbackMatch,
} from "@/lib/feedback";
import { trackEvent } from "@/lib/events";

const SHOW_DELAY_MS = 1500;
const THANKS_VISIBLE_MS = 2000;

const CHOICES: { value: FeedbackMatch; label: string }[] = [
  { value: "yes", label: "Yes" },
  { value: "mostly", label: "Mostly" },
  { value: "no", label: "No" },
];

const CHOICE_BUTTON_STYLE = {
  minHeight: "3.5rem",
  padding: "0.75rem 0.5rem",
  fontSize: "1.125rem",
  lineHeight: 1.25,
  whiteSpace: "normal",
  textAlign: "center",
} as const;

type Phase = "ask" | "saving" | "thanks";

function focusableElements(container: HTMLElement): HTMLElement[] {
  const nodes = container.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  );
  return Array.from(nodes).filter((node) => !node.hasAttribute("disabled") && node.tabIndex !== -1);
}

/**
 * Modal shown after a successful PDF. minutes_normally is a SELF-REPORT of how long
 * this packet would normally take. It is not a measured duration.
 * The dialog is portaled, so the export page does not also render an inline card.
 */
function FeedbackDialog({ userId, onClose }: { userId: string; onClose: () => void }) {
  const titleId = useId();
  const descriptionId = useId();
  const thanksId = useId();
  const minutesId = useId();
  const minutesHintId = useId();
  const commentId = useId();
  const commentCountId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const phaseRef = useRef<Phase>("ask");
  const requestCloseRef = useRef<() => void>(() => {});
  const closedRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const [matched, setMatched] = useState<FeedbackMatch | null>(null);
  const [minutesRaw, setMinutesRaw] = useState("");
  const [comment, setComment] = useState("");
  const [phase, setPhase] = useState<Phase>("ask");
  const [error, setError] = useState<string | null>(null);

  function requestClose() {
    if (closedRef.current) return;
    closedRef.current = true;
    abortRef.current?.abort();
    if (phaseRef.current !== "thanks") recordFeedbackDismissal(userId);
    onCloseRef.current();
  }

  useLayoutEffect(() => {
    onCloseRef.current = onClose;
    phaseRef.current = phase;
    requestCloseRef.current = requestClose;
  });

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog?.focus({ preventScroll: true });

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        requestCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const items = focusableElements(dialog);
      if (items.length === 0) {
        event.preventDefault();
        dialog.focus({ preventScroll: true });
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      const outside = !(active instanceof Node) || !dialog.contains(active);
      if (event.shiftKey) {
        if (active === first || active === dialog || outside) {
          event.preventDefault();
          last.focus();
        }
        return;
      }
      if (active === last || active === dialog || outside) {
        event.preventDefault();
        first.focus();
      }
    }

    function onFocusIn(event: FocusEvent) {
      if (!dialog) return;
      if (event.target instanceof Node && dialog.contains(event.target)) return;
      const items = focusableElements(dialog);
      (items[0] ?? dialog).focus();
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("focusin", onFocusIn);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("focusin", onFocusIn);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    if (phase !== "thanks") return;
    dialogRef.current?.focus({ preventScroll: true });
    const timer = window.setTimeout(() => onCloseRef.current(), THANKS_VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (phaseRef.current === "saving" || phaseRef.current === "thanks" || closedRef.current) return;

    const minutes = parseMinutes(minutesRaw);
    if (!minutes.ok) {
      setError(minutes.error);
      return;
    }
    const parsedComment = parseComment(comment);
    if (!parsedComment.ok) {
      setError(parsedComment.error);
      return;
    }
    if (!matched) {
      setError("Choose Yes, Mostly, or No.");
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    phaseRef.current = "saving";
    setPhase("saving");
    setError(null);
    const result = await submitFeedback(
      {
        matched,
        minutesNormally: minutes.value,
        comment: parsedComment.value,
      },
      controller.signal,
    );
    if (closedRef.current) return;
    if (!result.ok) {
      phaseRef.current = "ask";
      setPhase("ask");
      setError(result.error);
      return;
    }

    try {
      trackEvent("feedback_submitted", { matched });
    } catch {
      // The row is already saved. Logging must not hide the thank-you.
    }
    if (closedRef.current) return;
    phaseRef.current = "thanks";
    setPhase("thanks");
  }

  function onBackdropPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    requestClose();
  }

  const describedBy = phase === "thanks" ? thanksId : descriptionId;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#1c1915]/40 p-4"
      onPointerDown={onBackdropPointerDown}
    >
      <div
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={describedBy}
        className="flex max-h-[calc(100vh-2rem)] w-full max-w-lg flex-col gap-4 overflow-y-auto overscroll-contain rounded-xl border border-line bg-card p-5 shadow-lg"
      >
        <h2 id={titleId} className="font-serif text-2xl leading-tight">
          Did this packet match what you needed?
        </h2>

        {phase === "thanks" ? (
          <p id={thanksId} role="status" className="text-lg font-semibold text-accent-strong">
            Thanks, that helps
          </p>
        ) : (
          <form
            className="flex flex-col gap-4"
            noValidate
            aria-busy={phase === "saving"}
            onSubmit={(event) => void onSubmit(event)}
          >
            <p id={descriptionId} className="text-sm leading-relaxed text-muted">
              Optional. Nothing is saved until you submit.
            </p>
            <div className="grid grid-cols-3 gap-2">
              {CHOICES.map((choice) => {
                const selected = matched === choice.value;
                return (
                  <button
                    key={choice.value}
                    type="button"
                    className={selected ? "btn btn-primary w-full justify-center" : "btn btn-secondary w-full justify-center"}
                    style={CHOICE_BUTTON_STYLE}
                    aria-pressed={selected}
                    disabled={phase === "saving"}
                    onClick={() => {
                      setMatched(choice.value);
                      setError(null);
                    }}
                  >
                    {choice.label}
                  </button>
                );
              })}
            </div>

            {matched ? (
              <div className="flex flex-col gap-4">
                {/* Separate block from the input so the field border cannot clip the label. */}
                {/* SELF-REPORT: the student estimates minutes. This is not a timer. */}
                <div className="grid gap-2">
                  <label htmlFor={minutesId} className="block text-sm font-semibold leading-normal">
                    About how many minutes would this normally take you? (your own estimate)
                  </label>
                  <input
                    id={minutesId}
                    className="field-input block w-full font-normal"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={minutesRaw}
                    onChange={(event) => setMinutesRaw(event.target.value)}
                    disabled={phase === "saving"}
                    aria-describedby={minutesHintId}
                  />
                  <p id={minutesHintId} className="text-sm leading-normal text-muted">
                    Optional. A whole number from 0 to 600.
                  </p>
                </div>

                <div className="grid gap-2">
                  <label htmlFor={commentId} className="block text-sm font-semibold leading-normal">
                    Comment
                  </label>
                  <textarea
                    id={commentId}
                    className="field-input block min-h-20 w-full resize-y font-normal"
                    value={comment}
                    maxLength={200}
                    onChange={(event) => setComment(event.target.value.slice(0, 200))}
                    disabled={phase === "saving"}
                    placeholder="Anything confusing or missing? Please do not include personal details."
                    aria-describedby={commentCountId}
                  />
                  <p id={commentCountId} className="text-sm text-muted">
                    {comment.length}/200 characters.
                  </p>
                </div>
              </div>
            ) : null}

            {phase === "saving" ? <StatusMessage tone="info">Saving your answer…</StatusMessage> : null}
            {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}

            <div className="flex flex-wrap gap-2">
              {matched ? (
                <button type="submit" className="btn btn-primary" disabled={phase === "saving"}>
                  {phase === "saving" ? "Saving…" : "Submit"}
                </button>
              ) : null}
              <button type="button" className="btn btn-ghost" onClick={requestClose}>
                Not now
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export function PostExportFeedback({ generationId }: { generationId: string | null }) {
  const [prompt, setPrompt] = useState<{ userId: string } | null>(null);

  useEffect(() => {
    if (!generationId) return;
    let cancelled = false;
    let timer = 0;
    let finishDelay = () => {};
    const delay = new Promise<void>((resolve) => {
      finishDelay = resolve;
      timer = window.setTimeout(resolve, SHOW_DELAY_MS);
    });
    const decisionPromise = shouldAskForFeedback();

    void (async () => {
      await delay;
      if (cancelled) return;
      const decision = await decisionPromise;
      if (cancelled || !decision.ask) return;
      setPrompt({ userId: decision.userId });
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      finishDelay();
    };
  }, [generationId]);

  if (!generationId || !prompt || typeof document === "undefined") return null;

  return createPortal(
    <FeedbackDialog userId={prompt.userId} onClose={() => setPrompt(null)} />,
    document.body,
  );
}
