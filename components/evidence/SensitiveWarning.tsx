"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export type SensitiveFileNotice = {
  id: string;
  name: string;
  reasons: string[];
};

const NOTICE =
  "Upload evidence of achievements only (certificates, award letters, activity proofs). Do not upload bank statements, ID or passport copies, or documents with account numbers. Cover or remove sensitive details first.";

function focusableElements(container: HTMLElement): HTMLElement[] {
  const nodes = container.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  );
  return Array.from(nodes).filter((node) => node.tabIndex !== -1);
}

function SensitiveConfirmDialog({
  files,
  onCancel,
  onConfirm,
}: {
  files: SensitiveFileNotice[];
  onCancel: () => void;
  onConfirm: (selectedIds: string[]) => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const onCancelRef = useRef(onCancel);
  const onConfirmRef = useRef(onConfirm);
  const [checked, setChecked] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(files.map((file) => [file.id, true])),
  );
  const [busy, setBusy] = useState(false);
  const multiple = files.length > 1;

  useEffect(() => {
    onCancelRef.current = onCancel;
    onConfirmRef.current = onConfirm;
  });

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancelRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onCancelRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const items = focusableElements(dialog);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    function onFocusIn(event: FocusEvent) {
      if (!dialog) return;
      if (event.target instanceof Node && dialog.contains(event.target)) return;
      (cancelRef.current ?? dialog).focus();
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("focusin", onFocusIn);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("focusin", onFocusIn);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, []);

  function selectedIds(): string[] {
    if (!multiple) return files.map((file) => file.id);
    return files.filter((file) => checked[file.id] !== false).map((file) => file.id);
  }

  function confirm() {
    if (busy) return;
    const ids = selectedIds();
    if (ids.length === 0) return;
    setBusy(true);
    onConfirmRef.current(ids);
  }

  const chosen = selectedIds();
  const dialog = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#1c1915]/40 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) event.preventDefault();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="flex max-h-[calc(100vh-2rem)] w-full max-w-lg flex-col gap-4 overflow-hidden rounded-xl border border-warning/40 bg-card p-5 shadow-lg"
      >
        <div className="shrink-0 space-y-2">
          <h2 id={titleId} className="font-serif text-2xl leading-tight">
            {multiple ? "Check these files before uploading" : "Check this file before uploading"}
          </h2>
          <p id={descriptionId} className="text-sm leading-relaxed text-muted">
            {multiple
              ? "These file names look like they may contain sensitive details. Nothing here is uploaded until you choose. Uncheck a file to leave it out, or cancel to skip all of them."
              : "This file name looks like it may contain sensitive details. It is not uploaded yet."}
          </p>
        </div>

        {multiple ? (
          <fieldset className="min-h-0 space-y-3 overflow-y-auto">
            <legend className="text-sm font-semibold">Flagged files</legend>
            {files.map((file) => {
              const reasonsId = `${titleId}-reasons-${file.id}`;
              return (
                <div key={file.id} className="rounded-md border border-line bg-[#fffdf9] px-3 py-2">
                  <label className="flex items-start gap-2 text-sm font-semibold">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={checked[file.id] !== false}
                      onChange={(event) =>
                        setChecked((current) => ({ ...current, [file.id]: event.target.checked }))
                      }
                      aria-describedby={reasonsId}
                    />
                    <span className="break-words">{file.name}</span>
                  </label>
                  <ul id={reasonsId} className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted">
                    {file.reasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </fieldset>
        ) : (
          <div className="min-h-0 overflow-y-auto rounded-md border border-line bg-[#fffdf9] px-3 py-2">
            <p className="break-words text-sm font-semibold">{files[0]?.name}</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted">
              {(files[0]?.reasons ?? []).map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:flex-wrap">
          <button
            ref={cancelRef}
            type="button"
            className="btn btn-secondary w-full sm:w-auto"
            onClick={() => onCancelRef.current()}
          >
            Cancel upload
          </button>
          <button
            type="button"
            className="btn btn-primary w-full whitespace-normal sm:w-auto"
            onClick={confirm}
            disabled={busy || chosen.length === 0}
          >
            {busy ? "Uploading…" : "I have removed sensitive details, upload anyway"}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(dialog, document.body);
}

export function SensitiveWarning({
  children,
  pending,
  onCancel,
  onConfirm,
}: {
  children: ReactNode;
  pending: SensitiveFileNotice[] | null;
  onCancel: () => void;
  onConfirm: (selectedIds: string[]) => void;
}) {
  return (
    <div className="space-y-3">
      <p className="rounded-md border border-line bg-[#fffdf9] px-3 py-2 text-sm leading-relaxed text-muted">
        {NOTICE}
      </p>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_16rem] sm:items-start">
        <div className="min-w-0">{children}</div>
        <p className="rounded-md border border-line bg-[#fffdf9] px-3 py-3 text-sm text-muted">
          <span className="block font-semibold text-foreground">Privacy</span>
          <span className="mt-1 block">
            Files are stored in a private bucket. Only the signed-in account can open them, and you
            can delete any file at any time.
          </span>
        </p>
      </div>
      {pending && pending.length > 0 ? (
        <SensitiveConfirmDialog
          key={pending.map((file) => file.id).join("|")}
          files={pending}
          onCancel={onCancel}
          onConfirm={onConfirm}
        />
      ) : null}
    </div>
  );
}
