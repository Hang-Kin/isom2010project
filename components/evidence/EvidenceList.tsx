"use client";

import type { EvidenceFile } from "@/lib/types";

function formatSize(size: number | null): string {
  if (size === null || !Number.isFinite(size)) return "Unknown size";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function typeLabel(type: string): string {
  if (type === "application/pdf") return "PDF";
  if (type === "image/png") return "PNG";
  if (type === "image/jpeg") return "JPEG";
  return type || "File";
}

export function EvidenceList({
  files,
  pendingId,
  confirmingId,
  onPreview,
  onAskDelete,
  onConfirmDelete,
  onCancelDelete,
}: {
  files: EvidenceFile[];
  pendingId: string | null;
  confirmingId: string | null;
  onPreview: (file: EvidenceFile) => void;
  onAskDelete: (file: EvidenceFile) => void;
  onConfirmDelete: (file: EvidenceFile) => void;
  onCancelDelete: () => void;
}) {
  if (files.length === 0) {
    return <p className="text-sm text-muted">No evidence uploaded yet.</p>;
  }

  return (
    <ul className="space-y-3">
      {files.map((file) => {
        const pending = pendingId === file.id;
        const confirming = confirmingId === file.id;

        return (
          <li key={file.id} className="rounded-md border border-line bg-[#fffdf9] p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold" title={file.file_name}>
                  {file.file_name}
                </p>
                <p className="text-xs text-muted">
                  {typeLabel(file.file_type)} · {formatSize(file.file_size)}
                </p>
              </div>
              {!confirming ? (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => onPreview(file)}
                    disabled={pending}
                  >
                    {pending ? "Opening…" : "Preview"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => onAskDelete(file)}
                    disabled={pending}
                  >
                    Delete
                  </button>
                </div>
              ) : null}
            </div>
            {confirming ? (
              <div className="mt-3 space-y-2">
                <p className="text-sm text-danger">
                  Delete {file.file_name}? This removes the file from your evidence.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() => onConfirmDelete(file)}
                    disabled={pending}
                  >
                    {pending ? "Deleting…" : "Delete"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={onCancelDelete}
                    disabled={pending}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
