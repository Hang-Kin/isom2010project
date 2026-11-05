"use client";

import Link from "next/link";
import { DragEvent, useRef, useState } from "react";
import { PreviewTable, type PreviewPatch } from "@/components/import/PreviewTable";
import { PageHeader, StatusMessage } from "@/components/ui";
import {
  MAX_IMPORT_ROWS,
  columnSample,
  downloadTemplateCsv,
  guessColumnMap,
  importAchievementRows,
  importFileError,
  loadExistingEntryKeys,
  mappingProblems,
  parseSpreadsheetFile,
  partitionForImport,
  previewRowsFromSheet,
  revalidatePreviewRows,
  type ColumnChoice,
  type ImportPreviewRow,
  type ImportProgress,
  type ImportSummary,
  type ParsedSheet,
  FIELD_LABELS,
  IMPORT_FIELDS,
} from "@/lib/import";
import { trackEvent } from "@/lib/events"; // FEAT-7

type Phase = "upload" | "map" | "preview" | "importing" | "result";

const STEPS: Array<{ id: Phase; label: string }> = [
  { id: "upload", label: "Upload" },
  { id: "map", label: "Map columns" },
  { id: "preview", label: "Preview" },
  { id: "importing", label: "Import" },
  { id: "result", label: "Result" },
];

export function ImportWizard() {
  const inputRef = useRef<HTMLInputElement>(null);
  const runId = useRef(0);
  const [phase, setPhase] = useState<Phase>("upload");
  const [dragging, setDragging] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [checking, setChecking] = useState(false);
  const [fileName, setFileName] = useState("");
  const [sheet, setSheet] = useState<ParsedSheet | null>(null);
  const [sheetId, setSheetId] = useState(0);
  const [mapping, setMapping] = useState<ColumnChoice[]>([]);
  const [rows, setRows] = useState<ImportPreviewRow[]>([]);
  const [existingKeys, setExistingKeys] = useState<Set<string>>(new Set());
  const [previewSignature, setPreviewSignature] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [mapProblems, setMapProblems] = useState<string[]>([]);
  const [templateNote, setTemplateNote] = useState<string | null>(null);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ImportProgress>({ completed: 0, total: 0 });
  const [importError, setImportError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  function onDownloadTemplate() {
    try {
      downloadTemplateCsv();
      setTemplateNote("Template downloaded.");
      setTemplateError(null);
    } catch (cause) {
      setTemplateNote(null);
      setTemplateError(cause instanceof Error ? cause.message : "Could not download the template.");
    }
  }

  async function acceptFile(file: File | undefined) {
    if (!file) return;
    setTemplateNote(null);
    const rejection = importFileError(file);
    if (rejection) {
      setFileError(rejection);
      return;
    }

    setParsing(true);
    setFileError(null);
    try {
      const parsed = await parseSpreadsheetFile(file);
      setSheet(parsed);
      setFileName(file.name);
      setSheetId((current) => current + 1);
      setMapping(guessColumnMap(parsed.headers));
      setMapProblems([]);
      setMapError(null);
      setPreviewSignature("");
      setRows([]);
      setPhase("map");
    } catch (cause) {
      setFileError(cause instanceof Error ? cause.message : "This file could not be read.");
    } finally {
      setParsing(false);
    }
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (parsing) return;
    const files = Array.from(event.dataTransfer.files);
    const file = files[0];
    if (files.length !== 1 || !file) {
      setFileError(files.length > 1 ? "Import one file at a time." : "Drop a .csv or .xlsx file.");
      return;
    }
    void acceptFile(file);
  }

  function updateMapping(index: number, value: ColumnChoice) {
    setMapping((current) => {
      const next = current.slice();
      if (value !== "skip") {
        for (let column = 0; column < next.length; column += 1) {
          if (column !== index && next[column] === value) next[column] = "skip";
        }
      }
      next[index] = value;
      return next;
    });
    setMapProblems([]);
  }

  async function continueToPreview() {
    if (!sheet || checking) return;
    const problems = mappingProblems(mapping);
    setMapProblems(problems);
    if (problems.length > 0) return;

    setChecking(true);
    setMapError(null);
    try {
      const keys = await loadExistingEntryKeys();
      const signature = `${sheetId}:${mapping.join(",")}`;
      setExistingKeys(keys);
      setRows((current) =>
        signature === previewSignature && current.length > 0
          ? revalidatePreviewRows(current, keys)
          : previewRowsFromSheet(sheet, mapping, keys),
      );
      setPreviewSignature(signature);
      setPhase("preview");
    } catch (cause) {
      setMapError(cause instanceof Error ? cause.message : "Could not check existing entries.");
    } finally {
      setChecking(false);
    }
  }

  function editRow(sourceRow: number, patch: PreviewPatch) {
    setRows((current) =>
      revalidatePreviewRows(
        current.map((row) => (row.sourceRow === sourceRow ? { ...row, ...patch } : row)),
        existingKeys,
      ),
    );
  }

  function toggleAll(included: boolean) {
    setRows((current) =>
      revalidatePreviewRows(
        current.map((row) => ({ ...row, included, includeTouched: true })),
        existingKeys,
      ),
    );
  }

  async function startImport() {
    if (importBlockReason(rows)) return;

    const parts = partitionForImport(rows);
    const id = runId.current + 1;
    runId.current = id;
    setImportError(null);
    setProgress({ completed: 0, total: parts.ready.length });
    setPhase("importing");

    try {
      const outcome = await importAchievementRows(parts.ready, (next) => {
        if (runId.current === id) setProgress(next);
      });
      if (runId.current !== id) return;
      setSummary({
        imported: outcome.imported,
        skipped: parts.skipped,
        failed: [...parts.failed, ...outcome.failed],
      });
      setPhase("result");
      trackEvent("import_completed", { imported: outcome.imported, skipped: parts.skipped.length }); // FEAT-7
    } catch (cause) {
      if (runId.current !== id) return;
      setImportError(cause instanceof Error ? cause.message : "Could not import these rows.");
    }
  }

  function startOver() {
    runId.current += 1;
    setPhase("upload");
    setSheet(null);
    setFileName("");
    setMapping([]);
    setRows([]);
    setSummary(null);
    setImportError(null);
    setFileError(null);
    setMapError(null);
    setMapProblems([]);
    setPreviewSignature("");
    setProgress({ completed: 0, total: 0 });
    if (inputRef.current) inputRef.current.value = "";
  }

  const readyCount = rows.filter((row) => row.included && row.write && row.errors.length === 0).length;
  const blockReason = importBlockReason(rows);
  const percent = progress.total === 0 ? 0 : Math.round((progress.completed / progress.total) * 100);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Import"
        lede="Bring in awards and activities you already keep in a spreadsheet. Map the columns, check each row, then import the ones you want."
        actions={
          <button type="button" className="btn btn-secondary" onClick={onDownloadTemplate}>
            Download template CSV
          </button>
        }
      />

      {templateNote ? <StatusMessage tone="success">{templateNote}</StatusMessage> : null}
      {templateError ? <StatusMessage tone="error">{templateError}</StatusMessage> : null}

      <ol className="flex flex-wrap gap-x-4 gap-y-2 text-sm" aria-label="Import steps">
        {STEPS.map((step, index) => {
          const active = step.id === phase;
          return (
            <li key={step.id} className={active ? "font-semibold text-accent-strong" : "text-muted"}>
              <span aria-current={active ? "step" : undefined}>
                {index + 1}. {step.label}
              </span>
            </li>
          );
        })}
      </ol>

      {phase === "upload" ? (
        <div
          className={`card space-y-4 border-dashed ${dragging ? "border-accent" : ""}`}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <p id="import-file-help" className="text-sm leading-relaxed text-muted">
            Upload a .csv or .xlsx file up to 2 MB and {MAX_IMPORT_ROWS} rows. The first row should be the column
            names. Cells are read as text, and spreadsheet formulas are not run.
          </p>
          <input
            ref={inputRef}
            id="import-file"
            type="file"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-accent file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white"
            aria-describedby="import-file-help"
            disabled={parsing}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              void acceptFile(file);
            }}
          />
          {parsing ? <StatusMessage tone="info">Reading your spreadsheet…</StatusMessage> : null}
          {fileError ? <StatusMessage tone="error">{fileError}</StatusMessage> : null}
        </div>
      ) : null}

      {phase === "map" && sheet ? (
        <div className="space-y-4">
          <StatusMessage tone="success">
            Loaded {fileName} with {sheet.rows.length} data {sheet.rows.length === 1 ? "row" : "rows"}.
          </StatusMessage>
          <p className="text-sm text-muted">
            Match each spreadsheet column to an Evidence Vault field. Title and category are required. Choosing a field
            for a second column clears it from the first.
          </p>
          {mapProblems.length > 0 ? (
            <StatusMessage tone="error">
              {mapProblems.map((problem) => (
                <p key={problem}>{problem}</p>
              ))}
            </StatusMessage>
          ) : null}
          {mapError ? <StatusMessage tone="error">{mapError}</StatusMessage> : null}
          {checking ? <StatusMessage tone="info">Checking your existing entries…</StatusMessage> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            {sheet.headers.map((header, index) => {
              const sample = columnSample(sheet, index);
              return (
                <div key={`${header}-${index}`} className="space-y-1.5">
                  <label htmlFor={`map-${index}`} className="block text-sm font-semibold">
                    {header}
                  </label>
                  <p className="text-sm text-muted">{sample ? `Example: ${sample}` : "Example: empty"}</p>
                  <select
                    id={`map-${index}`}
                    className="field-input"
                    value={mapping[index] ?? "skip"}
                    disabled={checking}
                    onChange={(event) => updateMapping(index, event.target.value as ColumnChoice)}
                  >
                    <option value="skip">Don&apos;t import</option>
                    {IMPORT_FIELDS.map((field) => (
                      <option key={field} value={field}>
                        {FIELD_LABELS[field]}
                        {field === "title" || field === "category" ? " (required)" : ""}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-3">
            <button type="button" className="btn btn-secondary" onClick={() => setPhase("upload")} disabled={checking}>
              Back
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void continueToPreview()} disabled={checking}>
              {checking ? "Checking entries…" : "Continue"}
            </button>
          </div>
        </div>
      ) : null}

      {phase === "preview" ? (
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-muted">
            {readyCount} {readyCount === 1 ? "row is" : "rows are"} ready to import from {fileName}. Rows that match a
            saved entry with the same title and start date are unchecked. Fix a cell or uncheck a row to skip it.
            Checked rows that still have errors are not saved.
          </p>
          {blockReason ? <StatusMessage tone="error">{blockReason}</StatusMessage> : null}
          <PreviewTable rows={rows} onEdit={editRow} onToggleAll={toggleAll} />
          <div className="flex flex-wrap gap-3">
            <button type="button" className="btn btn-secondary" onClick={() => setPhase("map")}>
              Back
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void startImport()} disabled={readyCount === 0}>
              {readyCount === 0 ? "Import" : `Import ${readyCount} ${readyCount === 1 ? "row" : "rows"}`}
            </button>
          </div>
        </div>
      ) : null}

      {phase === "importing" ? (
        <div className="card space-y-3">
          {importError ? (
            <>
              <StatusMessage tone="error">{importError}</StatusMessage>
              <button type="button" className="btn btn-secondary" onClick={() => setPhase("preview")}>
                Back to preview
              </button>
            </>
          ) : (
            <>
              <StatusMessage tone="info">
                Importing {progress.completed} of {progress.total}…
              </StatusMessage>
              <div
                className="h-2 overflow-hidden rounded bg-line"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={progress.total}
                aria-valuenow={progress.completed}
                aria-label="Import progress"
              >
                <div className="h-full bg-accent" style={{ width: `${percent}%` }} />
              </div>
              <p className="text-sm text-muted">Keep this page open until the import finishes.</p>
            </>
          )}
        </div>
      ) : null}

      {phase === "result" && summary ? (
        <div className="space-y-4">
          <StatusMessage tone={resultTone(summary)}>
            Imported {summary.imported}. Skipped {summary.skipped.length}. Failed {summary.failed.length}.
          </StatusMessage>
          <StatusMessage tone="info">
            Evidence files are not imported; open each entry to attach its certificate.
          </StatusMessage>
          <OutcomeList title="Failed" items={summary.failed} empty="No rows failed." />
          <OutcomeList title="Skipped" items={summary.skipped} empty="No rows were skipped." />
          <div className="flex flex-wrap gap-3">
            <Link href="/dashboard/achievements" className="btn btn-primary">
              View achievements
            </Link>
            <button type="button" className="btn btn-secondary" onClick={startOver}>
              Import another file
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function OutcomeList({
  title,
  items,
  empty,
}: {
  title: string;
  items: ImportSummary["failed"];
  empty: string;
}) {
  return (
    <section className="card space-y-2">
      <h2 className="font-serif text-2xl">{title}</h2>
      {items.length === 0 ? (
        <p className="text-sm text-muted">{empty}</p>
      ) : (
        <ul className="max-h-64 space-y-2 overflow-y-auto text-sm">
          {items.map((item) => (
            <li key={`${title}-${item.sourceRow}-${item.reason}`}>
              Row {item.sourceRow} ({item.title}): {item.reason}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function resultTone(summary: ImportSummary): "success" | "warning" | "info" {
  if (summary.failed.length > 0) return "warning";
  if (summary.imported > 0) return "success";
  return "info";
}

function importBlockReason(rows: readonly ImportPreviewRow[]): string | null {
  const ready = rows.filter((row) => row.included && row.write && row.errors.length === 0).length;
  if (ready > 0) return null;
  if (rows.some((row) => row.included && row.errors.length > 0)) {
    return "Selected rows still have problems. Fix them or uncheck them to skip.";
  }
  if (rows.length > 0 && rows.every((row) => row.errors.length > 0)) {
    return "Every row still has a problem. Fix the cells, or leave them unchecked if you do not want them.";
  }
  return "Select at least one row to import.";
}
