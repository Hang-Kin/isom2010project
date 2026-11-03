"use client";

import { useEffect, useRef } from "react";
import { CATEGORIES } from "@/lib/categories";
import type { Category } from "@/lib/types";
import type { ImportCellField, ImportPreviewRow, RowStatus } from "@/lib/import";

export function PreviewTable({
  rows,
  onEdit,
  onToggleAll,
}: {
  rows: ImportPreviewRow[];
  onEdit: (sourceRow: number, patch: PreviewPatch) => void;
  onToggleAll: (included: boolean) => void;
}) {
  const allRef = useRef<HTMLInputElement>(null);
  const allIncluded = rows.length > 0 && rows.every((row) => row.included);
  const someIncluded = rows.some((row) => row.included);

  useEffect(() => {
    if (allRef.current) allRef.current.indeterminate = someIncluded && !allIncluded;
  }, [allIncluded, someIncluded]);

  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[76rem] border-collapse text-left text-sm">
        <caption className="sr-only">Preview of rows to import</caption>
        <thead>
          <tr className="border-b border-line text-muted">
            <th scope="col" className="px-2 py-2 font-semibold">
              <input
                ref={allRef}
                type="checkbox"
                className="h-4 w-4"
                checked={allIncluded}
                onChange={(event) => onToggleAll(event.target.checked)}
                aria-label="Include all rows"
              />
            </th>
            <th scope="col" className="px-2 py-2 font-semibold">Row</th>
            <th scope="col" className="px-2 py-2 font-semibold">Status</th>
            <th scope="col" className="px-2 py-2 font-semibold">Problems</th>
            <th scope="col" className="px-2 py-2 font-semibold">Title</th>
            <th scope="col" className="px-2 py-2 font-semibold">Category</th>
            <th scope="col" className="px-2 py-2 font-semibold">Organizer</th>
            <th scope="col" className="px-2 py-2 font-semibold">Role</th>
            <th scope="col" className="px-2 py-2 font-semibold">Start date</th>
            <th scope="col" className="px-2 py-2 font-semibold">End date</th>
            <th scope="col" className="px-2 py-2 font-semibold">Hours</th>
            <th scope="col" className="px-2 py-2 font-semibold">Description</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.sourceRow} className="border-b border-line align-top">
              <td className="px-2 py-2">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={row.included}
                  onChange={(event) =>
                    onEdit(row.sourceRow, { included: event.target.checked, includeTouched: true })
                  }
                  aria-label={`Include row ${row.sourceRow}`}
                />
              </td>
              <th scope="row" className="px-2 py-2 font-semibold">{row.sourceRow}</th>
              <td className="px-2 py-2">
                <span className={`inline-flex rounded px-2 py-0.5 text-xs font-semibold ${statusClass(row.status)}`}>
                  {statusLabel(row.status)}
                </span>
              </td>
              <td className="min-w-56 px-2 py-2">
                {row.errors.length === 0 && row.warnings.length === 0 ? (
                  <span className="text-muted">None</span>
                ) : (
                  <div className="space-y-1">
                    {row.errors.map((message, index) => (
                      <p key={`${index}-${message}`} className="text-danger">{message}</p>
                    ))}
                    {row.warnings.map((message, index) => (
                      <p key={`${index}-${message}`} className="text-warning">{message}</p>
                    ))}
                  </div>
                )}
              </td>
              <td className="px-2 py-2">
                <Cell
                  label={`Title for row ${row.sourceRow}`}
                  value={row.title}
                  invalid={Boolean(row.fieldErrors.title)}
                  onChange={(value) => onEdit(row.sourceRow, { title: value })}
                />
              </td>
              <td className="px-2 py-2">
                <select
                  className="field-input min-w-36"
                  value={row.category}
                  aria-label={`Category for row ${row.sourceRow}`}
                  aria-invalid={row.fieldErrors.category ? true : undefined}
                  onChange={(event) =>
                    onEdit(row.sourceRow, {
                      category: event.target.value as Category | "",
                      categoryEdited: true,
                    })
                  }
                >
                  <option value="">Select a category</option>
                  {CATEGORIES.map((category) => (
                    <option key={category.value} value={category.value}>
                      {category.label}
                    </option>
                  ))}
                </select>
              </td>
              <td className="px-2 py-2">
                <Cell
                  label={`Organizer for row ${row.sourceRow}`}
                  value={row.organizer}
                  invalid={Boolean(row.fieldErrors.organizer)}
                  onChange={(value) => onEdit(row.sourceRow, { organizer: value })}
                />
              </td>
              <td className="px-2 py-2">
                <Cell
                  label={`Role for row ${row.sourceRow}`}
                  value={row.role}
                  invalid={Boolean(row.fieldErrors.role)}
                  onChange={(value) => onEdit(row.sourceRow, { role: value })}
                />
              </td>
              <td className="px-2 py-2">
                <Cell
                  label={`Start date for row ${row.sourceRow}`}
                  value={row.startDate}
                  invalid={Boolean(row.fieldErrors.startDate)}
                  placeholder="YYYY-MM-DD"
                  onChange={(value) => onEdit(row.sourceRow, { startDate: value })}
                />
              </td>
              <td className="px-2 py-2">
                <Cell
                  label={`End date for row ${row.sourceRow}`}
                  value={row.endDate}
                  invalid={Boolean(row.fieldErrors.endDate)}
                  placeholder="YYYY-MM-DD"
                  onChange={(value) => onEdit(row.sourceRow, { endDate: value })}
                />
              </td>
              <td className="px-2 py-2">
                <Cell
                  label={`Hours for row ${row.sourceRow}`}
                  value={row.hours}
                  invalid={Boolean(row.fieldErrors.hours)}
                  inputMode="decimal"
                  onChange={(value) => onEdit(row.sourceRow, { hours: value })}
                />
              </td>
              <td className="px-2 py-2">
                <textarea
                  className="field-input min-h-20 min-w-56 resize-y"
                  value={row.description}
                  aria-label={`Description for row ${row.sourceRow}`}
                  aria-invalid={row.fieldErrors.description ? true : undefined}
                  onChange={(event) => onEdit(row.sourceRow, { description: event.target.value })}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export type PreviewPatch = Partial<Pick<ImportPreviewRow, ImportCellField | "included" | "includeTouched" | "categoryEdited">>;

function Cell({
  label,
  value,
  invalid,
  placeholder,
  inputMode,
  onChange,
}: {
  label: string;
  value: string;
  invalid: boolean;
  placeholder?: string;
  inputMode?: "decimal" | "text";
  onChange: (value: string) => void;
}) {
  return (
    <input
      className="field-input min-w-36"
      value={value}
      placeholder={placeholder}
      inputMode={inputMode}
      aria-label={label}
      aria-invalid={invalid ? true : undefined}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function statusLabel(status: RowStatus): string {
  if (status === "ok") return "OK";
  if (status === "warning") return "Warning";
  return "Error";
}

function statusClass(status: RowStatus): string {
  if (status === "error") return "bg-danger-soft text-danger";
  if (status === "warning") return "bg-warning-soft text-warning";
  return "bg-accent-soft text-accent-strong";
}
