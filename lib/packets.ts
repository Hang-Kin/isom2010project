import { isAnswerStyle, isPresetId, PRESETS, type AnswerStyle, type PresetId } from "@/lib/presets";
import { friendlySupabaseError } from "@/lib/supabase/errors";
import { createClient } from "@/lib/supabase/client";

/** Fields the export page can round-trip. Optional keys stay optional so older packets still load. */
export type PacketSettings = {
  applicationName: string;
  preset?: string;
  style?: string;
  maxItems?: number | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  wordLimit?: number | null;
  /** "words" or "chars". Missing on packets saved before the answer limit existed. */
  wordUnit?: string;
};

/** Settings after missing or unrecognised values fall back to the export page defaults. */
export type PacketPageSettings = {
  applicationName: string;
  preset: PresetId;
  style: AnswerStyle;
  maxItems: number | null;
  dateFrom: string | null;
  dateTo: string | null;
  wordLimit: number | null;
  wordUnit: "words" | "chars";
};

export type Packet = {
  id: string;
  user_id: string;
  name: string;
  settings: PacketSettings;
  /** Json keys this build does not interpret. Saved back unchanged. */
  extraSettings: Record<string, unknown>;
  achievementIds: string[];
  created_at: string;
  updated_at: string;
};

export type PacketSnapshot = {
  settings: PacketSettings;
  achievementIds: string[];
};

export type PacketLoadResult = {
  dropped: number;
  achievementIds: string[];
};

export type PacketSaveInput = {
  id?: string;
  name: string;
  settings: PacketSettings;
  achievementIds: string[];
  extraSettings?: Record<string, unknown>;
};

export type PacketTargetHandlers = {
  getCurrent: () => PacketSnapshot;
  onLoad: (settings: PacketSettings, achievementIds: string[]) => number | PacketLoadResult;
  hasLocalEdits: () => boolean;
  blockReason: () => string | null;
};

const WORD_UNITS = new Set(["words", "chars"]);

/** Fill preset, style, word limit, and unit when an older packet omitted them. */
export function normalizePacketSettings(settings: PacketSettings): PacketPageSettings {
  const preset = settings.preset && isPresetId(settings.preset) ? settings.preset : "general";
  const style =
    settings.style && isAnswerStyle(settings.style) ? settings.style : PRESETS[preset].defaultStyle;
  const wordUnit = settings.wordUnit === "chars" ? "chars" : "words";
  return {
    applicationName: settings.applicationName ?? "",
    preset,
    style,
    maxItems: settings.maxItems ?? null,
    dateFrom: settings.dateFrom ?? null,
    dateTo: settings.dateTo ?? null,
    wordLimit: settings.wordLimit ?? null,
    wordUnit,
  };
}

export const EMPTY_PACKET_SNAPSHOT: PacketSnapshot = {
  settings: normalizePacketSettings({ applicationName: "" }),
  achievementIds: [],
};

const PACKET_NAME_MAX = 80;
const COPY_SUFFIX = " (copy)";
const APPLICATION_NAME_MAX = 180;
const SHORT_MAX = 80;
const LIMIT_MAX = 5000;
const SETTINGS_JSON_MAX = 16000;
const STRING_VALUE_MAX = 8000;
const ACHIEVEMENT_CAP = 200;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAFE_KEY = /^[A-Za-z][A-Za-z0-9_]{0,40}$/;
const DATE_VALUE = /^\d{4}-\d{2}-\d{2}$/;
const PACKET_COLUMNS =
  "id, user_id, name, settings, achievement_ids, created_at, updated_at";

const KNOWN_KEYS = new Set<string>([
  "applicationName",
  "preset",
  "style",
  "maxItems",
  "dateFrom",
  "dateTo",
  "wordLimit",
  "wordUnit",
]);

type PacketTarget = PacketTargetHandlers;

let packetTarget: PacketTarget | null = null;
const packetTargetListeners = new Set<() => void>();

function notifyPacketTarget(): void {
  for (const listener of [...packetTargetListeners]) listener();
}

/** Registers the open export page. PacketBar reads this when the page cannot pass callbacks. */
export function bindExportPacketTarget(target: PacketTarget): () => void {
  packetTarget = target;
  notifyPacketTarget();
  return () => {
    if (packetTarget !== target) return;
    packetTarget = null;
    notifyPacketTarget();
  };
}

export function getExportPacketTarget(): PacketTarget | null {
  return packetTarget;
}

export function subscribeExportPacketTarget(listener: () => void): () => void {
  packetTargetListeners.add(listener);
  return () => {
    packetTargetListeners.delete(listener);
  };
}

export function validatePacketName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Enter a name for this packet.");
  if (trimmed.length > PACKET_NAME_MAX) {
    throw new Error(`Packet name must be ${PACKET_NAME_MAX} characters or fewer.`);
  }
  return trimmed;
}

export function packetCopyName(name: string): string {
  const trimmed = name.trim() || "Packet";
  const maxBase = PACKET_NAME_MAX - COPY_SUFFIX.length;
  const base = trimmed.length <= maxBase ? trimmed : trimmed.slice(0, maxBase).trimEnd();
  return `${base || "Packet"}${COPY_SUFFIX}`;
}

export function removedEntryNotice(count: number): string | null {
  if (!Number.isFinite(count) || count <= 0) return null;
  const total = Math.floor(count);
  if (total === 1) return "1 entry from this packet was deleted and removed.";
  return `${total} entries from this packet were deleted and removed.`;
}

export function keepExistingIds(
  requested: string[],
  existing: string[],
): { kept: string[]; dropped: number } {
  const known = new Map(existing.map((id) => [id.toLowerCase(), id]));
  const kept: string[] = [];
  const seen = new Set<string>();
  const missing = new Set<string>();

  for (const id of requested) {
    if (typeof id !== "string") continue;
    const trimmed = id.trim();
    if (!trimmed) continue;
    const canonical = known.get(trimmed.toLowerCase());
    if (!canonical) {
      missing.add(trimmed.toLowerCase());
      continue;
    }
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    kept.push(canonical);
  }

  return { kept, dropped: missing.size };
}

export function readPacketLoadResult(
  result: number | PacketLoadResult,
  requestedIds: string[],
): PacketLoadResult {
  if (typeof result === "number") {
    return {
      dropped: Number.isFinite(result) ? Math.max(0, Math.floor(result)) : 0,
      achievementIds: requestedIds,
    };
  }
  const dropped = Number.isFinite(result.dropped) ? Math.max(0, Math.floor(result.dropped)) : 0;
  return {
    dropped,
    achievementIds: result.achievementIds,
  };
}

export function uiPacketSnapshot(
  settings: PacketSettings,
  achievementIds: string[],
): PacketSnapshot {
  return {
    settings: normalizePacketSettings(settings),
    achievementIds,
  };
}

function settingToken(value: PacketSettings[keyof PacketSettings]): string {
  if (typeof value === "string") return value.trim();
  if (value === null || value === undefined) return "";
  return String(value);
}

/** Compares the keys the export page currently reports. Unset optional fields are not treated as edits. */
export function packetSnapshotIsDirty(current: PacketSnapshot, baseline: PacketSnapshot): boolean {
  if (current.achievementIds.length !== baseline.achievementIds.length) return true;
  for (let index = 0; index < current.achievementIds.length; index += 1) {
    if (current.achievementIds[index] !== baseline.achievementIds[index]) return true;
  }

  const keys = Object.keys(current.settings) as (keyof PacketSettings)[];
  for (const key of keys) {
    if (settingToken(current.settings[key]) !== settingToken(baseline.settings[key])) return true;
  }
  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function looksLikeFilePayload(value: string): boolean {
  if (value.startsWith("data:") || value.startsWith("%PDF")) return true;
  return value.length > 500 && /^[A-Za-z0-9+/=\s]+$/.test(value);
}

function isSafeJsonValue(value: unknown, depth: number): boolean {
  if (value === null) return true;
  if (typeof value === "string") {
    return value.length <= STRING_VALUE_MAX && !looksLikeFilePayload(value);
  }
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "boolean") return true;
  if (depth >= 5) return false;
  if (Array.isArray(value)) {
    return value.length <= 100 && value.every((item) => isSafeJsonValue(item, depth + 1));
  }
  if (!isRecord(value)) return false;
  const entries = Object.entries(value);
  return (
    entries.length <= 40 &&
    entries.every(([key, item]) => SAFE_KEY.test(key) && isSafeJsonValue(item, depth + 1))
  );
}

function readOptionalShort(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > SHORT_MAX || looksLikeFilePayload(trimmed)) return undefined;
  return trimmed;
}

function readOptionalLimit(value: unknown): number | null {
  if (value === null || value === "") return null;
  if (typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= LIMIT_MAX) {
    return value;
  }
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const parsed = Number(value.trim());
    if (parsed >= 1 && parsed <= LIMIT_MAX) return parsed;
  }
  return null;
}

function readOptionalDate(value: unknown): string | null {
  if (value === null || value === "") return null;
  if (typeof value === "string" && DATE_VALUE.test(value)) return value;
  return null;
}

export function readStoredSettings(value: unknown): {
  settings: PacketSettings;
  extraSettings: Record<string, unknown>;
} {
  if (!isRecord(value)) {
    return { settings: { applicationName: "" }, extraSettings: {} };
  }

  const settings: PacketSettings = {
    applicationName:
      typeof value.applicationName === "string"
        ? value.applicationName.trim().slice(0, APPLICATION_NAME_MAX)
        : "",
  };
  const preset = readOptionalShort(value.preset);
  const style = readOptionalShort(value.style);
  if (preset) settings.preset = preset;
  if (style) settings.style = style;
  if ("maxItems" in value) settings.maxItems = readOptionalLimit(value.maxItems);
  if ("dateFrom" in value) settings.dateFrom = readOptionalDate(value.dateFrom);
  if ("dateTo" in value) settings.dateTo = readOptionalDate(value.dateTo);
  if ("wordLimit" in value) settings.wordLimit = readOptionalLimit(value.wordLimit);
  if (typeof value.wordUnit === "string" && WORD_UNITS.has(value.wordUnit)) {
    settings.wordUnit = value.wordUnit;
  }

  const extraSettings: Record<string, unknown> = {};
  for (const [key, extra] of Object.entries(value)) {
    if (KNOWN_KEYS.has(key) || !SAFE_KEY.test(key) || !isSafeJsonValue(extra, 0)) continue;
    extraSettings[key] = extra;
  }

  return { settings, extraSettings };
}

function assignSettings(target: Record<string, unknown>, settings: PacketSettings): void {
  (Object.keys(settings) as (keyof PacketSettings)[]).forEach((key) => {
    const value = settings[key];
    if (value !== undefined) target[key] = value;
  });
}

export function mergePacketSettings(
  previous: PacketSettings | null,
  previousExtras: Record<string, unknown>,
  current: PacketSettings,
  currentExtras: Record<string, unknown> = {},
): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  if (previous) assignSettings(merged, previous);
  Object.entries(previousExtras).forEach(([key, value]) => {
    merged[key] = value;
  });
  Object.entries(currentExtras).forEach(([key, value]) => {
    merged[key] = value;
  });
  assignSettings(merged, current);
  if (typeof merged.applicationName !== "string") merged.applicationName = "";
  return merged;
}

function cleanShort(value: unknown, label: string): string | null {
  if (value === null || value === "") return null;
  if (typeof value !== "string" || looksLikeFilePayload(value)) {
    throw new Error("Packets store settings and selected entries only, not files or PDFs.");
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > SHORT_MAX) {
    throw new Error(`${label} must be ${SHORT_MAX} characters or fewer.`);
  }
  return trimmed;
}

function cleanLimit(value: unknown, label: string): number | null {
  if (value === null || value === "") return null;
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^\d+$/.test(value.trim())
        ? Number(value.trim())
        : Number.NaN;
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > LIMIT_MAX) {
    throw new Error(`${label} must be a whole number from 1 to ${LIMIT_MAX}, or empty.`);
  }
  return parsed;
}

function cleanDate(value: unknown, label: string): string | null {
  if (value === null || value === "") return null;
  if (typeof value !== "string" || !DATE_VALUE.test(value)) {
    throw new Error(`${label} must be a valid date or empty.`);
  }
  return value;
}

function cleanWordUnit(value: unknown): "words" | "chars" | null {
  if (value === null || value === "") return null;
  if (value === "words" || value === "chars") return value;
  throw new Error("Word limit unit must be words or characters.");
}

export function sanitizeSettingsPayload(input: Record<string, unknown>): Record<string, unknown> {
  const applicationName =
    typeof input.applicationName === "string" ? input.applicationName.trim() : "";
  if (looksLikeFilePayload(applicationName)) {
    throw new Error("Packets store settings and selected entries only, not files or PDFs.");
  }
  if (applicationName.length > APPLICATION_NAME_MAX) {
    throw new Error(`Application name must be ${APPLICATION_NAME_MAX} characters or fewer.`);
  }

  const next: Record<string, unknown> = { applicationName };
  if ("preset" in input) next.preset = cleanShort(input.preset, "Preset");
  if ("style" in input) next.style = cleanShort(input.style, "Style");
  if ("maxItems" in input) next.maxItems = cleanLimit(input.maxItems, "Max items");
  if ("dateFrom" in input) next.dateFrom = cleanDate(input.dateFrom, "Start date");
  if ("dateTo" in input) next.dateTo = cleanDate(input.dateTo, "End date");
  if ("wordLimit" in input) next.wordLimit = cleanLimit(input.wordLimit, "Word limit");
  if ("wordUnit" in input) next.wordUnit = cleanWordUnit(input.wordUnit);

  for (const [key, value] of Object.entries(input)) {
    if (KNOWN_KEYS.has(key)) continue;
    if (!SAFE_KEY.test(key)) continue;
    if (!isSafeJsonValue(value, 0)) {
      throw new Error("Packets store settings and selected entries only, not files or PDFs.");
    }
    next[key] = value;
  }

  if (JSON.stringify(next).length > SETTINGS_JSON_MAX) {
    throw new Error("Packet settings are too large to save.");
  }
  return next;
}

export function settingsPayloadForSave(
  previous: PacketSettings | null,
  previousExtras: Record<string, unknown>,
  current: PacketSettings,
  currentExtras: Record<string, unknown> = {},
): Record<string, unknown> {
  return sanitizeSettingsPayload(
    mergePacketSettings(previous, previousExtras, current, currentExtras),
  );
}

export function cleanAchievementIds(ids: string[]): string[] {
  if (!Array.isArray(ids)) throw new Error("Choose the entries to include in this packet.");
  const seen = new Set<string>();
  const next: string[] = [];
  for (const id of ids) {
    if (typeof id !== "string" || !UUID.test(id.trim())) {
      throw new Error("A selected entry could not be saved.");
    }
    const key = id.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(id.trim());
  }
  if (next.length > ACHIEVEMENT_CAP) {
    throw new Error(`A packet can include at most ${ACHIEVEMENT_CAP} entries.`);
  }
  return next;
}

function readAchievementIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const next: string[] = [];
  for (const id of value) {
    if (typeof id !== "string" || !UUID.test(id.trim())) continue;
    const key = id.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(id.trim());
  }
  return next;
}

function parsePacketRow(value: unknown): Packet | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string" || typeof value.user_id !== "string") return null;
  if (typeof value.name !== "string" || typeof value.created_at !== "string") return null;
  if (typeof value.updated_at !== "string") return null;
  const { settings, extraSettings } = readStoredSettings(value.settings);
  return {
    id: value.id,
    user_id: value.user_id,
    name: value.name,
    settings,
    extraSettings,
    achievementIds: readAchievementIds(value.achievement_ids),
    created_at: value.created_at,
    updated_at: value.updated_at,
  };
}

function packetActionError(error: { message?: string; code?: string }, fallback: string): string {
  const message = error.message ?? "";
  if (error.code === "42501" || /row-level security/i.test(message)) {
    return "You can only use your own packets.";
  }
  if (/packets_name_check|char_length\(btrim\(name\)\)/i.test(message)) {
    return "Enter a name for this packet.";
  }
  return friendlySupabaseError(error, fallback);
}

async function requireUser(): Promise<{
  supabase: ReturnType<typeof createClient>;
  userId: string;
}> {
  const supabase = createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    throw new Error(error?.message || "You need to log in before using saved packets.");
  }
  return { supabase, userId: data.user.id };
}

export async function listPackets(): Promise<Packet[]> {
  const { supabase, userId } = await requireUser();
  const { data, error } = await supabase
    .from("packets")
    .select(PACKET_COLUMNS)
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error) throw new Error(packetActionError(error, "Could not load saved packets."));
  return (Array.isArray(data) ? data : [])
    .map((row) => parsePacketRow(row))
    .filter((row): row is Packet => row !== null);
}

export async function loadPacket(id: string): Promise<Packet | null> {
  if (!UUID.test(id.trim())) return null;
  const { supabase, userId } = await requireUser();
  const { data, error } = await supabase
    .from("packets")
    .select(PACKET_COLUMNS)
    .eq("id", id.trim())
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(packetActionError(error, "Could not load that packet."));
  return parsePacketRow(data);
}

export async function savePacket(input: PacketSaveInput): Promise<Packet> {
  const name = validatePacketName(input.name);
  const achievementIds = cleanAchievementIds(input.achievementIds);
  const { supabase, userId } = await requireUser();

  let previous: Packet | null = null;
  if (input.id) {
    if (!UUID.test(input.id.trim())) throw new Error("That packet could not be found.");
    previous = await loadPacket(input.id);
    if (!previous || previous.user_id !== userId) {
      throw new Error("That packet could not be found.");
    }
  }

  const settings = settingsPayloadForSave(
    previous?.settings ?? null,
    previous?.extraSettings ?? {},
    input.settings,
    input.extraSettings,
  );

  if (input.id && previous) {
    const { data, error } = await supabase
      .from("packets")
      .update({
        name,
        settings,
        achievement_ids: achievementIds,
      })
      .eq("id", previous.id)
      .eq("user_id", userId)
      .select(PACKET_COLUMNS)
      .maybeSingle();

    if (error) throw new Error(packetActionError(error, "Could not save this packet."));
    const packet = parsePacketRow(data);
    if (!packet) throw new Error("That packet could not be found.");
    return packet;
  }

  const { data, error } = await supabase
    .from("packets")
    .insert({
      user_id: userId,
      name,
      settings,
      achievement_ids: achievementIds,
    })
    .select(PACKET_COLUMNS)
    .maybeSingle();

  if (error) throw new Error(packetActionError(error, "Could not save this packet."));
  const packet = parsePacketRow(data);
  if (!packet) throw new Error("Could not save this packet.");
  return packet;
}

export async function duplicatePacket(id: string): Promise<Packet> {
  const existing = await loadPacket(id);
  if (!existing) throw new Error("That packet could not be found.");
  return savePacket({
    name: packetCopyName(existing.name),
    settings: existing.settings,
    extraSettings: existing.extraSettings,
    achievementIds: existing.achievementIds,
  });
}

export async function deletePacket(id: string): Promise<void> {
  if (!UUID.test(id.trim())) throw new Error("That packet could not be found.");
  const { supabase, userId } = await requireUser();
  const { data, error } = await supabase
    .from("packets")
    .delete()
    .eq("id", id.trim())
    .eq("user_id", userId)
    .select("id");

  if (error) throw new Error(packetActionError(error, "Could not delete that packet."));
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error("That packet could not be found.");
  }
}
