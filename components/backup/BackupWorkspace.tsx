"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { PageHeader, StatusMessage } from "@/components/ui";
import {
  BACKUP_FILE_CAP,
  backupCounts,
  backupEntriesFileName,
  backupJsonFileName,
  backupProgressLabel,
  backupToJson,
  backupZipFileName,
  createBackupZip,
  entriesToCsv,
  formatBackupCounts,
  isBackupEmpty,
  loadBackupData,
  zipResultMessage,
  type BackupData,
  type BackupZipResult,
} from "@/lib/backup";
import { trackEvent } from "@/lib/events"; // FEAT-7

type Notice = {
  tone: "error" | "success" | "info" | "warning";
  message: string;
};

type ActiveAction = "csv" | "json" | "zip" | null;

export function BackupWorkspace() {
  const [data, setData] = useState<BackupData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const next = await loadBackupData();
        if (!active) return;
        setData(next);
        setLoadError(null);
      } catch (cause) {
        if (!active) return;
        setData(null);
        setLoadError(cause instanceof Error ? cause.message : "Could not load your backup.");
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [reloadKey]);

  return (
    <BackupScreen
      key={reloadKey}
      data={data}
      loading={loading}
      loadError={loadError}
      onRetry={() => {
        setLoading(true);
        setLoadError(null);
        setData(null);
        setReloadKey((value) => value + 1);
      }}
    />
  );
}

export function BackupScreen({
  data,
  loading,
  loadError,
  onRetry,
}: {
  data: BackupData | null;
  loading: boolean;
  loadError: string | null;
  onRetry: () => void;
}) {
  const [activeAction, setActiveAction] = useState<ActiveAction>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const busyRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  const empty = data ? isBackupEmpty(data) : false;
  const counts = data ? formatBackupCounts(backupCounts(data)) : "";
  const overCap = (data?.evidenceFiles.length ?? 0) > BACKUP_FILE_CAP;
  const busy = activeAction !== null;
  const exampleName = backupZipFileName(new Date());
  const packetCount = data?.packets?.length ?? 0;

  async function runDownload(action: Exclude<ActiveAction, null>, work: () => Promise<void>) {
    if (!data || busyRef.current) return;
    busyRef.current = true;
    setActiveAction(action);
    setNotice(action === "zip" ? { tone: "info", message: "Preparing your backup…" } : null);
    await waitForPaint();
    if (!mountedRef.current) {
      busyRef.current = false;
      return;
    }

    try {
      await work();
    } finally {
      busyRef.current = false;
      if (abortRef.current && action === "zip") abortRef.current = null;
      if (mountedRef.current) setActiveAction(null);
    }
  }

  function downloadCsv() {
    if (!data || busyRef.current) return;
    const snapshot = data;
    void runDownload("csv", async () => {
      try {
        const generatedAt = new Date();
        const fileName = backupEntriesFileName(generatedAt);
        downloadBlob(new Blob([entriesToCsv(snapshot)], { type: "text/csv;charset=utf-8" }), fileName);
        trackEvent("backup_downloaded", { kind: "csv" }); // FEAT-7
        setNotice({ tone: "success", message: `Downloaded ${fileName}.` });
      } catch (cause) {
        setNotice({
          tone: "error",
          message: cause instanceof Error ? cause.message : "Could not create the CSV backup.",
        });
      }
    });
  }

  function downloadJson() {
    if (!data || busyRef.current) return;
    const snapshot = data;
    void runDownload("json", async () => {
      try {
        const generatedAt = new Date();
        const fileName = backupJsonFileName(generatedAt);
        downloadBlob(
          new Blob([backupToJson(snapshot, generatedAt)], { type: "application/json;charset=utf-8" }),
          fileName,
        );
        trackEvent("backup_downloaded", { kind: "json" }); // FEAT-7
        setNotice({ tone: "success", message: `Downloaded ${fileName}.` });
      } catch (cause) {
        setNotice({
          tone: "error",
          message: cause instanceof Error ? cause.message : "Could not create the JSON backup.",
        });
      }
    });
  }

  function downloadZip() {
    if (!data || busyRef.current) return;
    const snapshot = data;
    const controller = new AbortController();
    abortRef.current = controller;
    void runDownload("zip", async () => {
      const generatedAt = new Date();
      try {
        const result = await createBackupZip(snapshot, {
          generatedAt,
          signal: controller.signal,
          onProgress: (progress) => {
            if (!mountedRef.current || controller.signal.aborted) return;
            setNotice({ tone: "info", message: backupProgressLabel(progress) });
          },
        });

        if (!mountedRef.current) return;
        if (result.cancelled || controller.signal.aborted) {
          setNotice({ tone: "info", message: "Download cancelled." });
          return;
        }
        if (!result.blob) {
          setNotice({ tone: "error", message: "Could not create the ZIP backup." });
          return;
        }

        downloadBlob(result.blob, result.fileName);
        trackEvent("backup_downloaded", { kind: "zip" }); // FEAT-7
        setNotice(finishedZipNotice(result));
      } catch (cause) {
        if (!mountedRef.current) return;
        if (controller.signal.aborted) {
          setNotice({ tone: "info", message: "Download cancelled." });
          return;
        }
        setNotice({
          tone: "error",
          message: cause instanceof Error ? cause.message : "Could not create the ZIP backup.",
        });
      }
    });
  }

  function cancelZip() {
    abortRef.current?.abort();
    setNotice({ tone: "info", message: "Cancelling download…" });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Backup"
        lede="Download a copy of everything stored in your vault. You can take it with you at any time."
      />

      <section className="card space-y-3">
        <h2 className="font-serif text-2xl">What is included</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed">
          <li>Your profile: username, year of study, major, and hobby tags.</li>
          <li>Every achievement: category, organizer, role, dates, hours, and description.</li>
          <li>Evidence file names in the CSV, file details in the JSON, and the files themselves in the ZIP.</li>
          <li>Saved packets, when you have any.</li>
        </ul>
        <p className="text-sm leading-relaxed text-muted">
          Evidence files stay private. This page only reads data your account can already open, and the
          CSV, JSON, and ZIP are generated in this browser. They are not uploaded. The CSV is UTF-8 so
          Excel keeps Chinese text.
        </p>
      </section>

      {loading ? <StatusMessage tone="info">Loading your backup…</StatusMessage> : null}

      {!loading && loadError ? (
        <div className="space-y-3">
          <StatusMessage tone="error">{loadError}</StatusMessage>
          <button type="button" className="btn btn-secondary" onClick={onRetry}>
            Try again
          </button>
        </div>
      ) : null}

      {!loading && !loadError && empty ? (
        <div className="card space-y-3">
          <p>Nothing to back up yet.</p>
          <Link href="/dashboard/achievements/new" className="btn btn-primary">
            Add achievement
          </Link>
        </div>
      ) : null}

      {!loading && !loadError && data && !empty ? (
        <section className="card space-y-4" aria-busy={busy}>
          <h2 className="font-serif text-2xl">Download</h2>
          <p className="text-sm font-semibold">{counts}</p>
          {packetCount > 0 ? (
            <p className="text-sm text-muted">
              {packetCount === 1
                ? "1 saved packet is included in the JSON and the ZIP."
                : `${packetCount} saved packets are included in the JSON and the ZIP.`}
            </p>
          ) : null}
          <p className="text-sm text-muted">
            File names include the date, for example {exampleName}. A full backup contains at most{" "}
            {BACKUP_FILE_CAP} evidence files.
          </p>
          {overCap ? (
            <StatusMessage tone="warning">
              A full backup includes at most {BACKUP_FILE_CAP} evidence files. You have{" "}
              {data.evidenceFiles.length}, so the ZIP keeps the first {BACKUP_FILE_CAP} and lists the
              rest in README.txt.
            </StatusMessage>
          ) : null}
          {notice ? <StatusMessage tone={notice.tone}>{notice.message}</StatusMessage> : null}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary" onClick={downloadCsv} disabled={busy}>
              {activeAction === "csv" ? "Preparing CSV…" : "Download entries (CSV)"}
            </button>
            <button type="button" className="btn btn-secondary" onClick={downloadJson} disabled={busy}>
              {activeAction === "json" ? "Preparing JSON…" : "Download everything (JSON)"}
            </button>
            <button type="button" className="btn btn-secondary" onClick={downloadZip} disabled={busy}>
              {activeAction === "zip" ? "Downloading…" : "Download full backup (ZIP)"}
            </button>
            {activeAction === "zip" ? (
              <button type="button" className="btn btn-secondary" onClick={cancelZip}>
                Cancel
              </button>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function finishedZipNotice(result: BackupZipResult): Notice {
  const message = zipResultMessage(result.fileName, result);
  if (result.failures.length > 0 || result.omitted.length > 0) {
    return { tone: "error", message };
  }
  return { tone: "success", message };
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function waitForPaint(): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, 0);
  });
}
