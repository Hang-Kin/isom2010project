/* eslint-disable @typescript-eslint/triple-slash-reference -- papaparse has no shipped types. */
/// <reference path="./papaparse.d.ts" />
/* eslint-enable @typescript-eslint/triple-slash-reference */
import Papa from "papaparse";
import {
  achievementSaveError,
  validateAchievement,
  type AchievementWrite,
} from "@/lib/achievements";
import { friendlySupabaseError } from "@/lib/supabase/errors";
import { createClient } from "@/lib/supabase/client";
import type { Category } from "@/lib/types";

export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 200;
export const IMPORT_BATCH_SIZE = 50;

const EXCEL_UNIX_SERIAL = 25569;
const EXCEL_SERIAL_MIN = 18264;
const EXCEL_SERIAL_MAX = 73415;

export const IMPORT_FIELDS = [
  "title",
  "category",
  "organizer",
  "role",
  "start_date",
  "end_date",
  "hours",
  "description",
] as const;

export type ImportField = (typeof IMPORT_FIELDS)[number];

export const FIELD_LABELS: Record<ImportField, string> = {
  title: "Title",
  category: "Category",
  organizer: "Organizer",
  role: "Role",
  start_date: "Start date",
  end_date: "End date",
  hours: "Hours",
  description: "Description",
};

export type ColumnChoice = ImportField | "skip";

export type RowStatus = "ok" | "warning" | "error";

export type DuplicateKind = "existing" | "file" | null;

export type ImportCellField =
  | "title"
  | "category"
  | "organizer"
  | "role"
  | "startDate"
  | "endDate"
  | "hours"
  | "description";

export type ParsedRow = {
  sourceRow: number;
  cells: string[];
};

export type ParsedSheet = {
  headers: string[];
  rows: ParsedRow[];
};

export type ImportPreviewRow = {
  sourceRow: number;
  included: boolean;
  includeTouched: boolean;
  title: string;
  category: Category | "";
  categorySource: string;
  categoryEdited: boolean;
  organizer: string;
  role: string;
  startDate: string;
  endDate: string;
  hours: string;
  description: string;
  status: RowStatus;
  errors: string[];
  warnings: string[];
  fieldErrors: Partial<Record<ImportCellField, string>>;
  duplicate: DuplicateKind;
  write: AchievementWrite | null;
};

export type ImportFailure = {
  sourceRow: number;
  title: string;
  reason: string;
};

export type ImportSummary = {
  imported: number;
  skipped: ImportFailure[];
  failed: ImportFailure[];
};

export type ImportProgress = {
  completed: number;
  total: number;
};

export class ImportFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportFileError";
  }
}

const TEMPLATE_HEADERS = [
  "title",
  "category",
  "organizer",
  "role",
  "start_date",
  "end_date",
  "hours",
  "description",
] as const;

const TEMPLATE_SAMPLE_ROWS = [
  [
    "Dean's List",
    "award",
    "Example University",
    "Student",
    "2024-09-01",
    "2025-05-31",
    "",
    "Named on the example faculty list for the year.",
  ],
  [
    "Campus tutoring",
    "volunteering",
    "Example Community Centre",
    "Tutor",
    "2024-10-01",
    "2025-03-31",
    "40",
    "Tutored secondary students in mathematics.",
  ],
];

const HEADER_ALIASES: Record<ImportField, readonly string[]> = {
  title: ["title", "name", "event", "activity", "achievement", "entry"],
  category: ["category", "type", "kind"],
  organizer: ["organizer", "organiser", "organisation", "organization", "org"],
  role: ["role", "position"],
  start_date: ["start date", "start", "from", "date", "begin"],
  end_date: ["end date", "end", "to", "until", "finish"],
  hours: ["hours", "hour", "hrs", "duration"],
  description: ["description", "details", "notes", "summary", "desc"],
};

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

const CATEGORY_SYNONYMS: Record<string, Category> = {
  award: "award",
  awards: "award",
  prize: "award",
  prizes: "award",
  competition: "award",
  competitions: "award",
  contest: "award",
  contests: "award",
  honor: "award",
  honour: "award",
  honors: "award",
  honours: "award",
  medal: "award",
  medals: "award",
  championship: "award",
  championships: "award",
  activity: "activity",
  activities: "activity",
  club: "activity",
  clubs: "activity",
  sport: "activity",
  sports: "activity",
  society: "activity",
  societies: "activity",
  event: "activity",
  events: "activity",
  extracurricular: "activity",
  volunteering: "volunteering",
  volunteer: "volunteering",
  volunteers: "volunteering",
  voluntary: "volunteering",
  "community service": "volunteering",
  scholarship: "scholarship",
  scholarships: "scholarship",
  bursary: "scholarship",
  bursaries: "scholarship",
  grant: "scholarship",
  grants: "scholarship",
  fellowship: "scholarship",
  fellowships: "scholarship",
  internship: "internship",
  internships: "internship",
  intern: "internship",
  interns: "internship",
  placement: "internship",
  placements: "internship",
  "work experience": "internship",
  "co op": "internship",
  coop: "internship",
  other: "other",
  others: "other",
  misc: "other",
  miscellaneous: "other",
};

const PLAIN_NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)$/;
const DATE_HINT = "Use YYYY-MM-DD, DD/MM/YYYY, MM/YYYY, or a month and year such as Jan 2025.";

export function templateCsv(): string {
  return `\uFEFF${Papa.unparse({
    fields: [...TEMPLATE_HEADERS],
    data: TEMPLATE_SAMPLE_ROWS,
  })}`;
}

export function downloadTemplateCsv(): void {
  const blob = new Blob([templateCsv()], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "evidence-vault-template.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function fileExtension(name: string): string {
  const base = name.trim().toLowerCase();
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return "";
  return base.slice(dot + 1);
}

export function importFileError(file: Pick<File, "name" | "size">): string | null {
  const extension = fileExtension(file.name);
  if (extension === "xls") {
    return "Older .xls files are not supported. Save the spreadsheet as .xlsx and try again.";
  }
  if (extension !== "csv" && extension !== "xlsx") {
    const shown = extension ? `.${extension}` : "a file with no extension";
    return `Only .csv and .xlsx files can be imported. ${shown} is not supported.`;
  }
  if (file.size === 0) return "This file is empty.";
  if (file.size > MAX_IMPORT_BYTES) {
    return "This file is larger than 2 MB. Split it or remove extra rows and try again.";
  }
  return null;
}

/**
 * Spreadsheet formula markers are not evaluated. A leading "=", "+", "-", or "@"
 * is removed only when the cell is not a plain number and would be treated as a
 * formula if opened in a spreadsheet. Signed numbers stay intact so negative hours
 * can still be flagged. React escapes the text on render.
 */
export function sanitizeCellText(value: string): string {
  let text = value.replace(/\u0000/g, "").replace(/^[\t\r\n]+/, "").trim();
  if (!text) return "";

  while (text.length > 0 && "=+@-".includes(text[0] ?? "")) {
    const marker = text[0];
    if ((marker === "+" || marker === "-") && PLAIN_NUMBER.test(text)) break;
    if (
      marker === "@" &&
      !/^@[=+\-@]/.test(text) &&
      !/^@[A-Za-z][A-Za-z0-9.]*\s*\(/.test(text)
    ) {
      break;
    }
    text = text.slice(1).trim();
  }

  return text;
}

export function cellToText(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "";
    return formatYmd(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "";
    return String(value);
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  return sanitizeCellText(String(value));
}

export function sheetFromMatrix(matrix: unknown[][]): ParsedSheet {
  const rows = matrix.map((row) => row.map((cell) => cellToText(cell)));
  if (rows.length === 0 || rows.every((row) => row.every((cell) => cell.trim() === ""))) {
    throw new ImportFileError("This file has no rows.");
  }

  const width = rows.reduce((max, row) => Math.max(max, row.length), 0);
  const headerRow = rows[0] ?? [];
  const headers = Array.from({ length: width }, (_, index) => {
    const text = (headerRow[index] ?? "").trim();
    return text || `Column ${index + 1}`;
  });

  if (headers.every((header) => /^Column \d+$/.test(header))) {
    throw new ImportFileError("The first row must be column names.");
  }

  const dataRows = rows
    .slice(1)
    .map((cells, index) => ({
      sourceRow: index + 2,
      cells: Array.from({ length: width }, (_, column) => cells[column] ?? ""),
    }))
    .filter((row) => row.cells.some((cell) => cell.trim() !== ""));

  if (dataRows.length === 0) {
    throw new ImportFileError("This file has no data rows to import.");
  }
  if (dataRows.length > MAX_IMPORT_ROWS) {
    throw new ImportFileError(
      `This file has ${dataRows.length} data rows. Import accepts at most ${MAX_IMPORT_ROWS} rows.`,
    );
  }

  return { headers, rows: dataRows };
}

export function parseCsvText(text: string): ParsedSheet {
  const source = text.replace(/^\uFEFF/, "");
  if (source.includes("\u0000")) {
    throw new ImportFileError("This file does not look like a CSV. Save it as .csv or .xlsx and try again.");
  }

  const parsed = Papa.parse<string[]>(source, {
    header: false,
    skipEmptyLines: false,
    dynamicTyping: false,
    worker: false,
  });

  const fatal = parsed.errors.find((error) => error.code === "MissingQuotes" || error.code === "InvalidQuotes");
  if (fatal) {
    const row = typeof fatal.row === "number" ? ` on row ${fatal.row + 1}` : "";
    throw new ImportFileError(`This CSV has an unmatched quote${row}. Close the quote and try again.`);
  }

  const matrix = parsed.data.map((row) => (Array.isArray(row) ? row.map((cell) => String(cell ?? "")) : []));
  return sheetFromMatrix(matrix);
}

export async function parseSpreadsheetFile(file: File): Promise<ParsedSheet> {
  const rejection = importFileError(file);
  if (rejection) throw new ImportFileError(rejection);

  const extension = fileExtension(file.name);
  if (extension === "csv") {
    const bytes = new Uint8Array(await file.slice(0, 4).arrayBuffer());
    if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
      throw new ImportFileError(
        "This file looks like an Excel workbook. Rename it to .xlsx, or export a real CSV.",
      );
    }
    return parseCsvText(await file.text());
  }

  try {
    // Cached formula results are read as text or numbers. The formula itself is never run.
    const excel = await import("read-excel-file/browser");
    const matrix = await excel.readSheet<string>(file, {
      trim: false,
      parseNumber: (value) => value,
    });
    return sheetFromMatrix(matrix);
  } catch (cause) {
    if (cause instanceof ImportFileError) throw cause;
    if (cause instanceof Error && cause.name === "InvalidInputError") {
      const code = "code" in cause ? String(cause.code) : "";
      if (code === "XLS_FILE_NOT_SUPPORTED") {
        throw new ImportFileError("Older .xls files are not supported. Save the spreadsheet as .xlsx and try again.");
      }
      throw new ImportFileError("This file could not be read as an Excel workbook. Save it as .xlsx and try again.");
    }
    const message = cause instanceof Error ? cause.message : "";
    throw new ImportFileError(message || "This Excel file could not be read.");
  }
}

export function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[_./-]+/g, " ")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeLabel(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function guessColumnMap(headers: readonly string[]): ColumnChoice[] {
  const normalized = headers.map((header) => normalizeHeader(header));
  const map: ColumnChoice[] = headers.map(() => "skip");
  const usedColumns = new Set<number>();
  const usedFields = new Set<ImportField>();

  const assign = (field: ImportField, alias: string) => {
    if (usedFields.has(field)) return;
    const index = normalized.findIndex((header, column) => header === alias && !usedColumns.has(column));
    if (index < 0) return;
    map[index] = field;
    usedColumns.add(index);
    usedFields.add(field);
  };

  for (const field of IMPORT_FIELDS) {
    const canonical = HEADER_ALIASES[field][0];
    if (canonical) assign(field, normalizeHeader(canonical));
  }

  const synonyms = IMPORT_FIELDS.flatMap((field, fieldIndex) =>
    HEADER_ALIASES[field].slice(1).map((alias, aliasIndex) => ({
      field,
      alias: normalizeHeader(alias),
      order: fieldIndex * 20 + aliasIndex,
    })),
  ).sort((left, right) => right.alias.length - left.alias.length || left.order - right.order);

  for (const synonym of synonyms) assign(synonym.field, synonym.alias);
  return map;
}

export function mappingProblems(mapping: readonly ColumnChoice[]): string[] {
  const problems: string[] = [];
  if (!mapping.includes("title")) problems.push("Map one column to Title. Title is required.");
  if (!mapping.includes("category")) problems.push("Map one column to Category. Category is required.");

  const seen = new Set<ImportField>();
  for (const field of mapping) {
    if (field === "skip") continue;
    if (seen.has(field)) {
      problems.push(`${FIELD_LABELS[field]} is mapped more than once. Choose it for only one column.`);
    }
    seen.add(field);
  }
  return problems;
}

export function columnSample(sheet: ParsedSheet, column: number): string {
  for (const row of sheet.rows) {
    const value = row.cells[column]?.trim() ?? "";
    if (!value) continue;
    return value.length > 80 ? `${value.slice(0, 77)}…` : value;
  }
  return "";
}

export function normalizeCategory(raw: string): { category: Category | ""; warning: string | null } {
  const text = raw.trim();
  if (!text) return { category: "", warning: null };

  const mapped = CATEGORY_SYNONYMS[normalizeLabel(text)];
  if (mapped) return { category: mapped, warning: null };

  const shown = text.length > 80 ? `${text.slice(0, 77)}…` : text;
  return {
    category: "other",
    warning: `"${shown}" is not a known category, so this row will be imported as Other.`,
  };
}

export function excelSerialToIso(serial: number): string | null {
  if (!Number.isFinite(serial)) return null;
  const whole = Math.floor(serial);
  if (whole < EXCEL_SERIAL_MIN || whole > EXCEL_SERIAL_MAX) return null;
  const date = new Date((whole - EXCEL_UNIX_SERIAL) * 86400000);
  if (Number.isNaN(date.getTime())) return null;
  return formatYmd(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

export function parseImportDate(raw: string): { iso: string | null; error: string | null } {
  const text = raw.trim();
  if (!text) return { iso: null, error: null };

  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s]\d{2}:\d{2}(?::\d{2})?)?$/.exec(text);
  if (match) return finishDate(Number(match[1]), Number(match[2]), Number(match[3]));

  match = /^(\d{4})[/.](\d{1,2})[/.](\d{1,2})$/.exec(text);
  if (match) return finishDate(Number(match[1]), Number(match[2]), Number(match[3]));

  match = /^(\d{1,2})[/. -](\d{1,2})[/. -](\d{4})(?:\s+\d{2}:\d{2}(?::\d{2})?)?$/.exec(text);
  if (match) return finishDate(Number(match[3]), Number(match[2]), Number(match[1]));

  match = /^(\d{1,2})[/. -](\d{4})$/.exec(text);
  if (match) return finishDate(Number(match[2]), Number(match[1]), 1);

  const named = text.replace(/,/g, " ").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  match = /^([a-z]+)\s+(\d{4})$/i.exec(named);
  if (match) {
    const month = MONTHS[match[1]?.toLowerCase() ?? ""];
    if (!month) return { iso: null, error: "invalid" };
    return finishDate(Number(match[2]), month, 1);
  }

  if (/^\d+(?:\.\d+)?$/.test(text)) {
    const iso = excelSerialToIso(Number(text));
    if (iso) return { iso, error: null };
  }

  return { iso: null, error: "invalid" };
}

export function entryKey(title: string, startDate: string | null): string {
  return `${title.trim().toLowerCase()}||${startDate ?? ""}`;
}

export function previewRowsFromSheet(
  sheet: ParsedSheet,
  mapping: readonly ColumnChoice[],
  existingKeys: ReadonlySet<string>,
): ImportPreviewRow[] {
  const seeds: ImportPreviewRow[] = sheet.rows.map((row) => {
    const read = (field: ImportField) => {
      const column = mapping.indexOf(field);
      if (column < 0) return "";
      return row.cells[column] ?? "";
    };
    const startRaw = read("start_date");
    const endRaw = read("end_date");
    const start = parseImportDate(startRaw);
    const end = parseImportDate(endRaw);
    const category = normalizeCategory(read("category"));

    return {
      sourceRow: row.sourceRow,
      included: true,
      includeTouched: false,
      title: read("title"),
      category: category.category,
      categorySource: read("category"),
      categoryEdited: false,
      organizer: read("organizer"),
      role: read("role"),
      startDate: start.iso ?? startRaw,
      endDate: end.iso ?? endRaw,
      hours: read("hours"),
      description: read("description"),
      status: "ok",
      errors: [],
      warnings: [],
      fieldErrors: {},
      duplicate: null,
      write: null,
    };
  });

  return revalidatePreviewRows(seeds, existingKeys);
}

export function revalidatePreviewRows(
  rows: readonly ImportPreviewRow[],
  existingKeys: ReadonlySet<string>,
): ImportPreviewRow[] {
  const seenInFile = new Set<string>();

  return rows.map((row) => {
    const category = row.categoryEdited
      ? { category: row.category, warning: null }
      : normalizeCategory(row.categorySource);
    const start = parseImportDate(row.startDate);
    const end = parseImportDate(row.endDate);
    const fieldErrors: Partial<Record<ImportCellField, string>> = {};
    const errors: string[] = [];
    const warnings: string[] = [];

    if (start.error) {
      fieldErrors.startDate = `Start date is not valid. ${DATE_HINT}`;
      errors.push(fieldErrors.startDate);
    }
    if (end.error) {
      fieldErrors.endDate = `End date is not valid. ${DATE_HINT}`;
      errors.push(fieldErrors.endDate);
    }
    if (category.warning) warnings.push(category.warning);

    const draftCategory = category.category;
    const validated = validateAchievement({
      title: row.title,
      category: draftCategory,
      organizer: row.organizer,
      role: row.role,
      startDate: start.iso ?? "",
      endDate: end.iso ?? "",
      hours: row.hours,
      description: row.description,
    });

    if (!draftCategory) {
      fieldErrors.category = "Category is required.";
    } else if (validated.errors.category) {
      fieldErrors.category = validated.errors.category;
    }
    if (validated.errors.title) fieldErrors.title = validated.errors.title;
    if (validated.errors.organizer) fieldErrors.organizer = validated.errors.organizer;
    if (validated.errors.role) fieldErrors.role = validated.errors.role;
    if (validated.errors.hours) fieldErrors.hours = validated.errors.hours;
    if (validated.errors.description) fieldErrors.description = validated.errors.description;
    if (validated.errors.endDate) fieldErrors.endDate = validated.errors.endDate;

    for (const message of Object.values(fieldErrors)) {
      if (message && !errors.includes(message)) errors.push(message);
    }

    let duplicate: DuplicateKind = null;
    const title = row.title.trim();
    if (title && !start.error) {
      const key = entryKey(title, start.iso);
      if (existingKeys.has(key)) duplicate = "existing";
      else if (seenInFile.has(key)) duplicate = "file";
      else seenInFile.add(key);
    }

    if (duplicate === "existing") {
      warnings.push("Same title and start date as an entry you already saved.");
    } else if (duplicate === "file") {
      warnings.push("Same title and start date as an earlier row in this file.");
    }

    const status: RowStatus = errors.length > 0 ? "error" : warnings.length > 0 ? "warning" : "ok";
    const included = row.includeTouched ? row.included : errors.length === 0 && duplicate === null;
    const write = errors.length === 0 && validated.value ? validated.value : null;

    return {
      ...row,
      category: draftCategory,
      status,
      errors,
      warnings,
      fieldErrors,
      duplicate,
      included,
      write,
    };
  });
}

export function partitionForImport(rows: readonly ImportPreviewRow[]): {
  ready: Array<{ sourceRow: number; title: string; write: AchievementWrite }>;
  skipped: ImportFailure[];
  failed: ImportFailure[];
} {
  const ready: Array<{ sourceRow: number; title: string; write: AchievementWrite }> = [];
  const skipped: ImportFailure[] = [];
  const failed: ImportFailure[] = [];

  for (const row of rows) {
    const title = row.title.trim() || "(no title)";
    if (!row.included) {
      skipped.push({ sourceRow: row.sourceRow, title, reason: skipReason(row) });
      continue;
    }
    if (!row.write || row.errors.length > 0) {
      failed.push({
        sourceRow: row.sourceRow,
        title,
        reason: row.errors.join(" ") || "This row still has problems.",
      });
      continue;
    }
    ready.push({ sourceRow: row.sourceRow, title, write: row.write });
  }

  return { ready, skipped, failed };
}

export async function loadExistingEntryKeys(): Promise<Set<string>> {
  const supabase = createClient();
  const keys = new Set<string>();
  const pageSize = 1000;

  for (let from = 0; from < pageSize * 100; from += pageSize) {
    const { data, error } = await supabase
      .from("achievements")
      .select("title, start_date")
      .range(from, from + pageSize - 1);

    if (error) {
      throw new ImportFileError(friendlySupabaseError(error, "Could not check existing entries."));
    }

    const page = data ?? [];
    for (const row of page) {
      const title = typeof row.title === "string" ? row.title : "";
      if (!title.trim()) continue;
      keys.add(entryKey(title, storedDate(row.start_date)));
    }

    if (page.length < pageSize) return keys;
  }

  throw new ImportFileError("Could not finish checking existing entries. Try again.");
}

export async function importAchievementRows(
  rows: readonly { sourceRow: number; title: string; write: AchievementWrite }[],
  onProgress: (progress: ImportProgress) => void,
): Promise<{ imported: number; failed: ImportFailure[] }> {
  const supabase = createClient();
  const failed: ImportFailure[] = [];
  let imported = 0;
  let completed = 0;
  const total = rows.length;
  onProgress({ completed, total });

  for (let offset = 0; offset < rows.length; offset += IMPORT_BATCH_SIZE) {
    const batch = rows.slice(offset, offset + IMPORT_BATCH_SIZE);
    const payload = batch.map((row) => achievementInsert(row.write));

    try {
      const { error } = await supabase.from("achievements").insert(payload);
      if (error) throw error;
      imported += batch.length;
      completed += batch.length;
      onProgress({ completed, total });
    } catch {
      for (const row of batch) {
        try {
          const { error } = await supabase.from("achievements").insert(achievementInsert(row.write));
          if (error) {
            failed.push({
              sourceRow: row.sourceRow,
              title: row.title,
              reason: importFailureReason(error),
            });
          } else {
            imported += 1;
          }
        } catch (cause) {
          failed.push({
            sourceRow: row.sourceRow,
            title: row.title,
            reason: cause instanceof Error ? cause.message : "Could not import this row.",
          });
        }
        completed += 1;
        onProgress({ completed, total });
      }
    }
  }

  return { imported, failed };
}

function achievementInsert(write: AchievementWrite): AchievementWrite {
  // user_id defaults to auth.uid() in the database. Do not set it here.
  return {
    title: write.title,
    category: write.category,
    organizer: write.organizer,
    role: write.role,
    start_date: write.start_date,
    end_date: write.end_date,
    hours: write.hours,
    description: write.description,
  };
}

function importFailureReason(error: { message?: string; code?: string }): string {
  const message = error.message ?? "";
  if (/row-level security|jwt|not authenticated/i.test(message)) {
    return "You need to log in again before importing.";
  }
  return achievementSaveError(error);
}

function skipReason(row: ImportPreviewRow): string {
  if (row.errors.length > 0) {
    return `Skipped because this row still has problems: ${row.errors.join(" ")}`;
  }
  if (row.duplicate === "existing") {
    return "Skipped because it matches an existing entry with the same title and start date.";
  }
  if (row.duplicate === "file") {
    return "Skipped because it repeats an earlier row in this file with the same title and start date.";
  }
  return "Skipped because the row was unchecked.";
}

function storedDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return match?.[1] ?? null;
}

function finishDate(year: number, month: number, day: number): { iso: string | null; error: string | null } {
  if (!isRealDate(year, month, day)) return { iso: null, error: "invalid" };
  return { iso: formatYmd(year, month, day), error: null };
}

function isRealDate(year: number, month: number, day: number): boolean {
  if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function formatYmd(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
