import JSZip from "jszip";
import { friendlySupabaseError } from "@/lib/supabase/errors";
import { createClient } from "@/lib/supabase/client";

export const BACKUP_FILE_CAP = 100;

const PAGE_SIZE = 1000;
const MAX_PAGES = 50;
const NAME_LIMIT = 80;

const CSV_HEADERS = [
  "title",
  "category",
  "organizer",
  "role",
  "start_date",
  "end_date",
  "hours",
  "description",
  "evidence_count",
  "evidence_files",
] as const;

const FORMULA_LEAD = /^[\t\r\n ]*[=+\-@]/;

export type BackupProfile = {
  username: string | null;
  year_of_study: string | null;
  major: string | null;
  hobby_tags: string[];
};

export type BackupAchievement = {
  id: string;
  user_id: string;
  title: string;
  category: string;
  organizer: string | null;
  role: string | null;
  start_date: string | null;
  end_date: string | null;
  hours: number | null;
  description: string | null;
  created_at: string;
  updated_at: string;
};

export type BackupEvidenceFile = {
  id: string;
  achievement_id: string;
  user_id: string;
  file_name: string;
  file_path: string;
  file_type: string;
  file_size: number | null;
  created_at: string;
};

export type BackupPacket = Record<string, unknown>;

export type BackupData = {
  profile: BackupProfile;
  achievements: BackupAchievement[];
  evidenceFiles: BackupEvidenceFile[];
  packets?: BackupPacket[];
};

export type BackupCounts = {
  entries: number;
  evidenceFiles: number;
  bytes: number;
  unknownSizes: number;
};

export type BackupZipFailure = {
  fileName: string;
  zipPath: string;
  reason: string;
};

export type BackupZipProgress = {
  current: number;
  total: number;
  fileName: string;
};

export type BackupZipResult = {
  cancelled: boolean;
  blob: Blob | null;
  fileName: string;
  failures: BackupZipFailure[];
  omitted: BackupZipFailure[];
};

type QueryError = {
  code?: string;
  message?: string;
};

type QueryResult = {
  data: unknown;
  error: QueryError | null;
};

type EvidenceDownload = (path: string, signal: AbortSignal) => Promise<Blob>;

const EMPTY_PROFILE: BackupProfile = {
  username: null,
  year_of_study: null,
  major: null,
  hobby_tags: [],
};

export function formatBackupDay(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function backupEntriesFileName(date: Date): string {
  return `evidence-vault-entries-${formatBackupDay(date)}.csv`;
}

export function backupJsonFileName(date: Date): string {
  return `evidence-vault-backup-${formatBackupDay(date)}.json`;
}

export function backupZipFileName(date: Date): string {
  return `evidence-vault-backup-${formatBackupDay(date)}.zip`;
}

export function backupProgressLabel(progress: BackupZipProgress): string {
  return `Downloading file ${progress.current} of ${progress.total}`;
}

export function isBackupEmpty(data: BackupData): boolean {
  return (
    data.achievements.length === 0 &&
    data.evidenceFiles.length === 0 &&
    (data.packets?.length ?? 0) === 0
  );
}

export function backupCounts(data: BackupData): BackupCounts {
  let bytes = 0;
  let unknownSizes = 0;

  for (const file of data.evidenceFiles) {
    if (file.file_size === null) unknownSizes += 1;
    else bytes += file.file_size;
  }

  return {
    entries: data.achievements.length,
    evidenceFiles: data.evidenceFiles.length,
    bytes,
    unknownSizes,
  };
}

export function formatApproximateSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "about 0 bytes";
  if (bytes < 1024) {
    const rounded = Math.round(bytes);
    return rounded === 1 ? "about 1 byte" : `about ${rounded} bytes`;
  }

  const units = ["KB", "MB", "GB"] as const;
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const rounded = value >= 10 || Number.isInteger(value) ? Math.round(value) : Math.round(value * 10) / 10;
  return `about ${rounded} ${units[unitIndex]}`;
}

export function formatBackupCounts(counts: BackupCounts): string {
  const entries = counts.entries === 1 ? "1 entry" : `${counts.entries} entries`;
  const files =
    counts.evidenceFiles === 1 ? "1 evidence file" : `${counts.evidenceFiles} evidence files`;
  const unknown = counts.unknownSizes > 0 ? " (some file sizes were not recorded)" : "";
  return `${entries}, ${files}, ${formatApproximateSize(counts.bytes)}${unknown}`;
}

export function neutralizeSpreadsheetFormula(value: string): string {
  if (FORMULA_LEAD.test(value)) return `'${value}`;
  return value;
}

export function csvCell(value: string): string {
  const safe = neutralizeSpreadsheetFormula(value);
  if (/[",\r\n]/.test(safe)) return `"${safe.replace(/"/g, '""')}"`;
  return safe;
}

export function entriesToCsv(data: BackupData): string {
  const filesByAchievement = new Map<string, BackupEvidenceFile[]>();
  for (const file of data.evidenceFiles) {
    const list = filesByAchievement.get(file.achievement_id) ?? [];
    list.push(file);
    filesByAchievement.set(file.achievement_id, list);
  }

  const lines = [CSV_HEADERS.join(",")];
  for (const achievement of data.achievements) {
    const files = [...(filesByAchievement.get(achievement.id) ?? [])].sort((left, right) => {
      const byCreated = left.created_at.localeCompare(right.created_at);
      if (byCreated !== 0) return byCreated;
      return left.id.localeCompare(right.id);
    });
    const row = [
      achievement.title,
      achievement.category,
      achievement.organizer ?? "",
      achievement.role ?? "",
      achievement.start_date ?? "",
      achievement.end_date ?? "",
      formatHours(achievement.hours),
      achievement.description ?? "",
      String(files.length),
      files.map((file) => file.file_name).join(";"),
    ];
    lines.push(row.map((value) => csvCell(value)).join(","));
  }

  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export function backupToJson(data: BackupData, exportedAt: Date): string {
  const body: Record<string, unknown> = {
    exported_at: exportedAt.toISOString(),
    profile: {
      username: data.profile.username,
      year_of_study: data.profile.year_of_study,
      major: data.profile.major,
      hobby_tags: data.profile.hobby_tags,
    },
    achievements: data.achievements,
    evidence_files: data.evidenceFiles,
  };

  if (data.packets) body.packets = data.packets;
  return `${JSON.stringify(body, null, 2)}\n`;
}

export function sanitizeBackupName(name: string): string {
  let cleaned = name
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[<>:"/\\|?*]/g, "_")
    .replace(/\.{2,}/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[.\s_]+|[.\s_]+$/g, "")
    .slice(0, NAME_LIMIT);

  if (!cleaned) return "untitled";
  const stem = cleaned.replace(/\.[^.]+$/, "");
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(stem)) {
    cleaned = `_${cleaned}`.slice(0, NAME_LIMIT);
  }
  return cleaned;
}

export function uniqueBackupName(name: string, used: Set<string>, kind: "file" | "folder"): string {
  const safe = sanitizeBackupName(name);
  const taken = (candidate: string) => used.has(candidate.toLowerCase());

  if (!taken(safe)) {
    used.add(safe.toLowerCase());
    return safe;
  }

  let n = 2;
  let candidate = safe;
  while (taken(candidate) && n < 10000) {
    const suffix = ` (${n})`;
    if (kind === "folder") {
      candidate = `${safe.slice(0, Math.max(1, NAME_LIMIT - suffix.length))}${suffix}`;
    } else {
      const dot = safe.lastIndexOf(".");
      const hasExtension = dot > 0 && safe.length - dot <= 12;
      const stem = hasExtension ? safe.slice(0, dot) : safe;
      const extension = hasExtension ? safe.slice(dot) : "";
      const trimmedStem = stem.slice(0, Math.max(1, NAME_LIMIT - suffix.length - extension.length));
      candidate = `${trimmedStem}${suffix}${extension}`;
    }
    n += 1;
  }

  used.add(candidate.toLowerCase());
  return candidate;
}

export type PlannedEvidenceFile = {
  file: BackupEvidenceFile;
  zipPath: string;
};

export function planEvidenceZipEntries(data: BackupData): PlannedEvidenceFile[] {
  const achievementOrder = new Map<string, { sort: string; title: string }>();
  data.achievements.forEach((achievement, index) => {
    achievementOrder.set(achievement.id, {
      sort: `${achievement.created_at}\u0000${String(index).padStart(6, "0")}\u0000${achievement.id}`,
      title: achievement.title,
    });
  });

  const files = [...data.evidenceFiles].sort((left, right) => {
    const leftAchievement = achievementOrder.get(left.achievement_id);
    const rightAchievement = achievementOrder.get(right.achievement_id);
    const leftSort = leftAchievement?.sort ?? `\uffff\u0000${left.achievement_id}`;
    const rightSort = rightAchievement?.sort ?? `\uffff\u0000${right.achievement_id}`;
    if (leftSort !== rightSort) return leftSort.localeCompare(rightSort);
    const byCreated = left.created_at.localeCompare(right.created_at);
    if (byCreated !== 0) return byCreated;
    return left.id.localeCompare(right.id);
  });

  const folderNames = new Map<string, string>();
  const usedFolders = new Set<string>();
  const usedFileNames = new Map<string, Set<string>>();

  return files.map((file) => {
    let folder = folderNames.get(file.achievement_id);
    if (!folder) {
      const title = achievementOrder.get(file.achievement_id)?.title || "Untitled entry";
      folder = uniqueBackupName(title, usedFolders, "folder");
      folderNames.set(file.achievement_id, folder);
    }

    let names = usedFileNames.get(folder);
    if (!names) {
      names = new Set<string>();
      usedFileNames.set(folder, names);
    }

    const fileName = uniqueBackupName(file.file_name || "file", names, "file");
    return { file, zipPath: `evidence/${folder}/${fileName}` };
  });
}

export function isMissingPacketsTable(error: QueryError): boolean {
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  const message = error.message ?? "";
  return /could not find the table|relation ["'][\w.]*packets["'] does not exist/i.test(message);
}

export async function loadBackupData(): Promise<BackupData> {
  const supabase = createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    throw new Error(userError?.message || "You need to log in before downloading a backup.");
  }

  const userId = userData.user.id;
  const [achievementsResult, evidenceResult, packetsResult, profileResult] = await Promise.all([
    fetchPages((from, to) =>
      supabase
        .from("achievements")
        .select(
          "id, user_id, title, category, organizer, role, start_date, end_date, hours, description, created_at, updated_at",
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    ),
    fetchPages((from, to) =>
      supabase
        .from("evidence_files")
        .select("id, achievement_id, user_id, file_name, file_path, file_type, file_size, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    ),
    fetchPages((from, to) =>
      supabase.from("packets").select("*").order("id", { ascending: true }).range(from, to),
    ),
    supabase
      .from("profiles")
      .select("username, year_of_study, major, hobby_tags")
      .eq("id", userId)
      .maybeSingle(),
  ]);

  if (achievementsResult.error) {
    throw new Error(friendlySupabaseError(achievementsResult.error, "Could not load achievements."));
  }
  if (evidenceResult.error) {
    throw new Error(friendlySupabaseError(evidenceResult.error, "Could not load evidence files."));
  }

  const profile = await profileFromResult(supabase, userId, profileResult);
  const packets = packetsFromResult(packetsResult.error, packetsResult.rows, userId);

  return {
    profile,
    achievements: achievementsResult.rows.map((row) => normalizeAchievement(row)),
    evidenceFiles: evidenceResult.rows.map((row) => normalizeEvidence(row)),
    ...(packets ? { packets } : {}),
  };
}

export async function buildBackupZip(
  data: BackupData,
  download: EvidenceDownload,
  options: {
    generatedAt?: Date;
    signal?: AbortSignal;
    onProgress?: (progress: BackupZipProgress) => void;
  } = {},
): Promise<BackupZipResult> {
  const generatedAt = options.generatedAt ?? new Date();
  const fileName = backupZipFileName(generatedAt);
  const signal = options.signal ?? new AbortController().signal;
  const planned = planEvidenceZipEntries(data);
  const included = planned.slice(0, BACKUP_FILE_CAP);
  const omitted = planned.slice(BACKUP_FILE_CAP).map((item) => ({
    fileName: item.file.file_name,
    zipPath: item.zipPath,
    reason: `Left out because a full backup includes at most ${BACKUP_FILE_CAP} evidence files.`,
  }));

  if (signal.aborted) {
    return { cancelled: true, blob: null, fileName, failures: [], omitted };
  }

  const zip = new JSZip();
  zip.file(backupEntriesFileName(generatedAt), entriesToCsv(data));
  zip.file(backupJsonFileName(generatedAt), backupToJson(data, generatedAt));

  const failures: BackupZipFailure[] = [];

  for (let index = 0; index < included.length; index += 1) {
    if (signal.aborted) {
      return { cancelled: true, blob: null, fileName, failures, omitted };
    }

    const item = included[index];
    options.onProgress?.({
      current: index + 1,
      total: included.length,
      fileName: item.file.file_name,
    });

    try {
      if (!item.file.file_path.trim()) {
        throw new Error("This evidence file has no storage path.");
      }
      const blob = await download(item.file.file_path, signal);
      if (signal.aborted) {
        return { cancelled: true, blob: null, fileName, failures, omitted };
      }
      zip.file(item.zipPath, new Uint8Array(await blob.arrayBuffer()), { compression: "STORE" });
    } catch (cause) {
      if (signal.aborted || isAbortError(cause)) {
        return { cancelled: true, blob: null, fileName, failures, omitted };
      }
      failures.push({
        fileName: item.file.file_name,
        zipPath: item.zipPath,
        reason: cause instanceof Error ? cause.message : "Could not download this evidence file.",
      });
    }
  }

  if (signal.aborted) {
    return { cancelled: true, blob: null, fileName, failures, omitted };
  }

  if (failures.length > 0 || omitted.length > 0) {
    zip.file("README.txt", readmeText(generatedAt, failures, omitted));
  }

  return {
    cancelled: false,
    blob: await zipToBlob(zip),
    fileName,
    failures,
    omitted,
  };
}

export async function createBackupZip(
  data: BackupData,
  options: {
    generatedAt?: Date;
    signal?: AbortSignal;
    onProgress?: (progress: BackupZipProgress) => void;
  } = {},
): Promise<BackupZipResult> {
  let supabase: ReturnType<typeof createClient> | null = null;

  return buildBackupZip(
    data,
    async (path, signal) => {
      if (!supabase) supabase = createClient();
      const { data: file, error } = await supabase.storage
        .from("evidence")
        .download(path, {}, { signal });

      if (signal.aborted || isAbortError(error)) {
        throw new DOMException("The download was cancelled.", "AbortError");
      }
      if (error || !file) {
        throw new Error(error?.message || "Could not download this evidence file.");
      }
      return file;
    },
    options,
  );
}

export function zipResultMessage(fileName: string, result: BackupZipResult): string {
  if (result.failures.length === 0 && result.omitted.length === 0) {
    return `Downloaded ${fileName}.`;
  }

  const parts = [`Downloaded ${fileName}.`];
  if (result.failures.length === 1) {
    parts.push(
      `${result.failures[0].fileName} could not be downloaded (${result.failures[0].reason}).`,
    );
  } else if (result.failures.length > 1) {
    parts.push(`${result.failures.length} evidence files could not be downloaded.`);
  }
  if (result.omitted.length > 0) {
    parts.push(
      `${result.omitted.length} evidence ${result.omitted.length === 1 ? "file was" : "files were"} left out because a full backup includes at most ${BACKUP_FILE_CAP} files.`,
    );
  }
  parts.push("Details are in README.txt inside the ZIP.");
  return parts.join(" ");
}

function formatHours(hours: number | null): string {
  if (hours === null || !Number.isFinite(hours)) return "";
  const rounded = Math.round(hours * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

function readmeText(
  generatedAt: Date,
  failures: BackupZipFailure[],
  omitted: BackupZipFailure[],
): string {
  const lines = [
    "Evidence Vault backup",
    `Generated: ${formatBackupDay(generatedAt)}`,
    "",
    "The CSV and JSON in this ZIP were still created.",
    "",
  ];

  if (failures.length > 0) {
    lines.push("These evidence files could not be downloaded:", "");
    for (const failure of failures) {
      lines.push(`- ${failure.zipPath}: ${failure.reason}`);
    }
    lines.push("");
  }

  if (omitted.length > 0) {
    lines.push(
      `A full backup includes at most ${BACKUP_FILE_CAP} evidence files. These files were left out:`,
      "",
    );
    for (const item of omitted) {
      lines.push(`- ${item.zipPath}: ${item.fileName}`);
    }
    lines.push("");
  }

  return lines.join("\r\n");
}

async function zipToBlob(zip: JSZip): Promise<Blob> {
  if (JSZip.support.blob) return zip.generateAsync({ type: "blob" });
  const buffer = await zip.generateAsync({ type: "nodebuffer" });
  return new Blob([new Uint8Array(buffer)]);
}

function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = "name" in error ? String(error.name) : "";
  if (name === "AbortError") return true;
  const message = "message" in error ? String(error.message) : "";
  return /^(the user aborted|the operation was aborted|aborted)/i.test(message);
}

async function fetchPages(
  loadPage: (from: number, to: number) => PromiseLike<QueryResult>,
): Promise<{ rows: unknown[]; error: QueryError | null }> {
  const rows: unknown[] = [];

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * PAGE_SIZE;
    const { data, error } = await loadPage(from, from + PAGE_SIZE - 1);
    if (error) return { rows, error };
    const chunk = Array.isArray(data) ? data : [];
    rows.push(...chunk);
    if (chunk.length < PAGE_SIZE) return { rows, error: null };
  }

  throw new Error("This backup has too many rows to download in one file.");
}

async function profileFromResult(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  result: QueryResult,
): Promise<BackupProfile> {
  if (result.error && isMissingHobbyTagsColumn(result.error)) {
    const basic = await supabase
      .from("profiles")
      .select("username, year_of_study, major")
      .eq("id", userId)
      .maybeSingle();
    if (basic.error) {
      throw new Error(friendlySupabaseError(basic.error, "Could not load your profile."));
    }
    return normalizeProfile(basic.data, []);
  }

  if (result.error) {
    throw new Error(friendlySupabaseError(result.error, "Could not load your profile."));
  }

  return normalizeProfile(result.data, hobbyTagsFrom(result.data));
}

function packetsFromResult(
  error: QueryError | null,
  rows: unknown[],
  userId: string,
): BackupPacket[] | undefined {
  if (error) {
    if (isMissingPacketsTable(error)) return undefined;
    throw new Error(friendlySupabaseError(error, "Could not load saved packets."));
  }

  const packets = rows
    .map((row) => plainRow(row))
    .filter((row): row is BackupPacket => row !== null && belongsToUser(row, userId));

  packets.sort((left, right) => {
    const leftUpdated = typeof left.updated_at === "string" ? left.updated_at : "";
    const rightUpdated = typeof right.updated_at === "string" ? right.updated_at : "";
    if (leftUpdated !== rightUpdated) return rightUpdated.localeCompare(leftUpdated);
    const leftId = typeof left.id === "string" ? left.id : "";
    const rightId = typeof right.id === "string" ? right.id : "";
    return leftId.localeCompare(rightId);
  });

  return packets;
}

function isMissingHobbyTagsColumn(error: QueryError): boolean {
  const message = error.message ?? "";
  if (!/hobby_tags/i.test(message)) return false;
  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    /could not find the .+ column|does not exist|schema cache/i.test(message)
  );
}

function normalizeProfile(value: unknown, hobbyTags: string[]): BackupProfile {
  const row = plainRow(value);
  if (!row) return { ...EMPTY_PROFILE, hobby_tags: hobbyTags };
  return {
    username: nullableText(row.username),
    year_of_study: nullableText(row.year_of_study),
    major: nullableText(row.major),
    hobby_tags: hobbyTags,
  };
}

function hobbyTagsFrom(value: unknown): string[] {
  const row = plainRow(value);
  const tags = row?.hobby_tags;
  if (!Array.isArray(tags)) return [];
  return tags.filter((tag): tag is string => typeof tag === "string");
}

function normalizeAchievement(value: unknown): BackupAchievement {
  const row = plainRow(value);
  if (!row) throw new Error("Could not read an achievement.");
  return {
    id: requiredText(row.id, "an achievement id"),
    user_id: requiredText(row.user_id, "an achievement owner"),
    title: nullableText(row.title) ?? "",
    category: nullableText(row.category) ?? "",
    organizer: nullableText(row.organizer),
    role: nullableText(row.role),
    start_date: nullableText(row.start_date),
    end_date: nullableText(row.end_date),
    hours: normalizeHours(row.hours),
    description: nullableText(row.description),
    created_at: nullableText(row.created_at) ?? "",
    updated_at: nullableText(row.updated_at) ?? "",
  };
}

function normalizeEvidence(value: unknown): BackupEvidenceFile {
  const row = plainRow(value);
  if (!row) throw new Error("Could not read an evidence file.");
  return {
    id: requiredText(row.id, "an evidence file id"),
    achievement_id: requiredText(row.achievement_id, "an evidence achievement"),
    user_id: requiredText(row.user_id, "an evidence file owner"),
    file_name: nullableText(row.file_name) ?? "file",
    file_path: nullableText(row.file_path) ?? "",
    file_type: nullableText(row.file_type) ?? "",
    file_size: normalizeSize(row.file_size),
    created_at: nullableText(row.created_at) ?? "",
  };
}

function normalizeHours(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeSize(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

function requiredText(value: unknown, label: string): string {
  if (typeof value === "string" && value.trim()) return value;
  throw new Error(`Could not read ${label}.`);
}

function nullableText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

function plainRow(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return { ...(value as Record<string, unknown>) };
}

function belongsToUser(row: BackupPacket, userId: string): boolean {
  if (!("user_id" in row)) return true;
  return row.user_id === userId;
}
