"use client";

import { useRef, useState } from "react";
import { StatusMessage } from "@/components/ui";
import { copyText, downloadCsv, toCsv, toTsv } from "@/lib/insights";

type Notice = {
  tone: "error" | "success" | "info";
  message: string;
};

export function TableActions({
  label,
  filename,
  rows,
  disabled,
}: {
  label: string;
  filename: string;
  rows: string[][];
  disabled?: boolean;
}) {
  const [pending, setPending] = useState<"copy" | "download" | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const busyRef = useRef(false);
  const busy = pending !== null || Boolean(disabled);

  async function copyTable() {
    if (busyRef.current || disabled) return;
    busyRef.current = true;
    setPending("copy");
    setNotice({ tone: "info", message: `Copying the ${label} table…` });
    await waitForPaint();
    try {
      await copyText(toTsv(rows));
      setNotice({ tone: "success", message: `Copied the ${label} table.` });
    } catch {
      setNotice({ tone: "error", message: `Could not copy the ${label} table.` });
    } finally {
      busyRef.current = false;
      setPending(null);
    }
  }

  async function download() {
    if (busyRef.current || disabled) return;
    busyRef.current = true;
    setPending("download");
    setNotice({ tone: "info", message: `Preparing the ${label} CSV…` });
    await waitForPaint();
    try {
      downloadCsv(filename, toCsv(rows));
      setNotice({ tone: "success", message: `Downloaded ${filename}.` });
    } catch {
      setNotice({ tone: "error", message: `Could not download the ${label} CSV.` });
    } finally {
      busyRef.current = false;
      setPending(null);
    }
  }

  return (
    <div className="space-y-3">
      {notice ? <StatusMessage tone={notice.tone}>{notice.message}</StatusMessage> : null}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-secondary" onClick={() => void copyTable()} disabled={busy}>
          {pending === "copy" ? "Copying…" : "Copy as table"}
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => void download()} disabled={busy}>
          {pending === "download" ? "Preparing CSV…" : "Download CSV"}
        </button>
      </div>
    </div>
  );
}

function waitForPaint(): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, 0);
  });
}
