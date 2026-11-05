"use client";

import { useEffect, useRef, useState } from "react";
import { EvidenceList } from "@/components/evidence/EvidenceList";
import { SensitiveWarning, type SensitiveFileNotice } from "@/components/evidence/SensitiveWarning"; // FEAT-8
import { UploadCompressionNote } from "@/lib/image-compress"; // FEAT-12
import { StatusMessage } from "@/components/ui";
import {
  deleteEvidence,
  getEvidenceSignedUrl,
  listEvidence,
  uploadEvidence,
} from "@/lib/evidence";
import { checkFileNameSensitivity } from "@/lib/sensitive"; // FEAT-8
import type { EvidenceFile } from "@/lib/types";
import { trackEvent } from "@/lib/events"; // FEAT-7

type UploadJob = {
  id: string;
  name: string;
  status: "uploading" | "error" | "cancelled";
  message?: string;
};

type SensitiveHold = SensitiveFileNotice & { file: File };

function trackSensitiveCount(
  name: "sensitive_warning_shown" | "sensitive_warning_confirmed" | "sensitive_warning_cancelled",
  count: number,
) {
  if (count <= 0) return;
  try {
    trackEvent(name, { count });
  } catch {
    // A tracking failure must not block the upload.
  }
}

export default function EvidenceManager({
  achievementId,
  onCountChange,
}: {
  achievementId: string;
  onCountChange?: (count: number) => void;
}) {
  const [files, setFiles] = useState<EvidenceFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploads, setUploads] = useState<UploadJob[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [sensitiveHold, setSensitiveHold] = useState<SensitiveHold[] | null>(null);
  const sensitiveHoldRef = useRef<SensitiveHold[] | null>(null);

  const uploading = uploads.some((job) => job.status === "uploading");
  const reviewingSensitive = sensitiveHold !== null;

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const nextFiles = await listEvidence(achievementId);
        if (!active) return;
        setFiles(nextFiles);
        onCountChange?.(nextFiles.length);
        setError(null);
      } catch (cause) {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : "Could not load evidence files.");
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [achievementId, onCountChange, reloadKey]);

  async function refresh() {
    const nextFiles = await listEvidence(achievementId);
    setFiles(nextFiles);
    onCountChange?.(nextFiles.length);
  }

  function rememberCancelled(jobs: { id: string; name: string }[]) {
    const ids = new Set(jobs.map((job) => job.id));
    setUploads((current) => [
      ...jobs.map((job) => ({
        id: job.id,
        name: job.name,
        status: "cancelled" as const,
        message: "Upload cancelled",
      })),
      ...current.filter((job) => !ids.has(job.id)),
    ]);
  }

  function takeSensitiveHold(): SensitiveHold[] | null {
    const pending = sensitiveHoldRef.current;
    if (!pending) return null;
    sensitiveHoldRef.current = null;
    setSensitiveHold(null);
    return pending;
  }

  async function uploadJobs(jobs: { id: string; name: string; file: File }[]) {
    if (jobs.length === 0) return;

    setUploads((current) => {
      const starting = new Set(jobs.map((job) => job.id));
      // Keep in-flight and cancelled rows. Clear files upload while flagged
      // files are still waiting in the dialog.
      return [
        ...jobs.map((job) => ({ id: job.id, name: job.name, status: "uploading" as const })),
        ...current.filter((job) => !starting.has(job.id)),
      ];
    });

    await Promise.all(
      jobs.map(async (job) => {
        try {
          await uploadEvidence(achievementId, job.file);
          trackEvent("evidence_uploaded", { file_type: /pdf$/i.test(job.file.type) || /\.pdf$/i.test(job.file.name) ? "pdf" : /png$/i.test(job.file.type) || /\.png$/i.test(job.file.name) ? "png" : /jpe?g$/i.test(job.file.type) || /\.jpe?g$/i.test(job.file.name) ? "jpeg" : "other", size_kb: Math.round(job.file.size / 1024) }); // FEAT-7
          setUploads((current) => current.filter((item) => item.id !== job.id));
        } catch (cause) {
          const message = cause instanceof Error ? cause.message : `Could not upload ${job.name}.`;
          setUploads((current) =>
            current.map((item) =>
              item.id === job.id ? { ...item, status: "error", message } : item,
            ),
          );
        }
      }),
    );

    try {
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The upload finished, but the list could not be refreshed.");
    }
  }

  async function handleFiles(incoming: File[]) {
    if (incoming.length === 0 || sensitiveHoldRef.current) return;
    setError(null);

    const jobs = incoming.map((file) => ({
      id: crypto.randomUUID(),
      name: file.name || "Untitled file",
      file,
    }));

    // FEAT-8: clear files upload now. Flagged names wait for confirmation.
    const clear: typeof jobs = [];
    const flagged: SensitiveHold[] = [];
    for (const job of jobs) {
      const check = checkFileNameSensitivity(job.file.name || "");
      if (check.flagged) {
        flagged.push({ id: job.id, name: job.name, reasons: check.reasons, file: job.file });
      }
      else clear.push(job);
    }

    if (flagged.length > 0) {
      sensitiveHoldRef.current = flagged;
      setSensitiveHold(flagged);
      trackSensitiveCount("sensitive_warning_shown", flagged.length);
    }

    await uploadJobs(clear);
  }

  function cancelSensitive() {
    const pending = takeSensitiveHold();
    if (!pending) return;
    trackSensitiveCount("sensitive_warning_cancelled", pending.length);
    rememberCancelled(pending);
  }

  async function confirmSensitive(selectedIds: string[]) {
    const pending = takeSensitiveHold();
    if (!pending) return;
    const selected = new Set(selectedIds);
    const approved = pending.filter((job) => selected.has(job.id));
    const skipped = pending.filter((job) => !selected.has(job.id));
    if (approved.length > 0) trackSensitiveCount("sensitive_warning_confirmed", approved.length);
    if (skipped.length > 0) {
      trackSensitiveCount("sensitive_warning_cancelled", skipped.length);
      rememberCancelled(skipped);
    }
    await uploadJobs(approved);
  }

  async function preview(file: EvidenceFile) {
    setPendingId(file.id);
    setError(null);
    try {
      const url = await getEvidenceSignedUrl(file.file_path);
      const opened = window.open(url, "_blank", "noopener,noreferrer");
      if (!opened) {
        setError("The preview was blocked. Allow pop-ups for this site and try again.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not open a preview for this file.");
    } finally {
      setPendingId(null);
    }
  }

  async function confirmDelete(file: EvidenceFile) {
    setPendingId(file.id);
    setError(null);
    try {
      await deleteEvidence(file);
      setConfirmingId(null);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete this file.");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <section className="space-y-3 border-t border-line pt-4" aria-label="Evidence files">
      <div>
        <h3 className="text-sm font-semibold">Evidence</h3>
        <p className="text-sm text-muted">PDF, JPEG, or PNG. 5 MB maximum for each file.</p>
        <UploadCompressionNote /> {/* FEAT-12 */}
      </div>

      <SensitiveWarning
        pending={sensitiveHold}
        onCancel={cancelSensitive}
        onConfirm={(selectedIds) => void confirmSensitive(selectedIds)}
      >
        <label
          className={`block cursor-pointer rounded-md border border-dashed px-4 py-5 text-center text-sm ${
            dragOver ? "border-accent bg-accent-soft" : "border-line bg-[#fffdf9]"
          } ${uploading || reviewingSensitive ? "cursor-wait opacity-70" : ""}`}
          onDragOver={(event) => {
            event.preventDefault();
            if (!uploading && !reviewingSensitive) setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragOver(false);
            if (uploading || reviewingSensitive) return;
            void handleFiles(Array.from(event.dataTransfer.files));
          }}
        >
          <span className="block font-semibold">Drop files here or choose files</span>
          <span className="mt-1 block text-muted">You can upload more than one file at a time.</span>
          <input
            className="sr-only"
            type="file"
            multiple
            accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
            disabled={uploading || reviewingSensitive}
            onChange={(event) => {
              const selected = event.target.files ? Array.from(event.target.files) : [];
              event.target.value = "";
              void handleFiles(selected);
            }}
          />
        </label>
      </SensitiveWarning>

      {uploads.length > 0 ? (
        <ul className="space-y-2" aria-live="polite">
          {uploads.map((job) => (
            <li key={job.id} className="rounded-md border border-line px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">{job.name}</span>
                <span className={job.status === "error" ? "text-danger" : "text-muted"}>
                  {job.status === "uploading"
                    ? "Uploading…"
                    : job.status === "cancelled"
                      ? "Upload cancelled"
                      : "Not uploaded"}
                </span>
              </div>
              {job.status === "uploading" ? (
                <div className="mt-2 h-1 overflow-hidden rounded bg-line" aria-hidden="true">
                  <div className="h-full w-1/2 animate-pulse bg-accent" />
                </div>
              ) : null}
              {job.status === "error" && job.message ? (
                <p className="mt-1 text-danger">{job.message}</p>
              ) : null}
              {job.status === "error" || job.status === "cancelled" ? (
                <button
                  type="button"
                  className="btn btn-ghost mt-1"
                  onClick={() => setUploads((current) => current.filter((item) => item.id !== job.id))}
                >
                  Dismiss
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {loading ? <StatusMessage tone="info">Loading evidence…</StatusMessage> : null}
      {error ? (
        <div className="space-y-2">
          <StatusMessage tone="error">{error}</StatusMessage>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setLoading(true);
              setReloadKey((value) => value + 1);
            }}
            disabled={loading}
          >
            {loading ? "Loading…" : "Try again"}
          </button>
        </div>
      ) : null}

      {!loading ? (
        <EvidenceList
          files={files}
          pendingId={pendingId}
          confirmingId={confirmingId}
          onPreview={(file) => void preview(file)}
          onAskDelete={(file) => setConfirmingId(file.id)}
          onConfirmDelete={(file) => void confirmDelete(file)}
          onCancelDelete={() => setConfirmingId(null)}
        />
      ) : null}
    </section>
  );
}
