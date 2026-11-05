import { CATEGORIES } from "@/lib/categories";
import { friendlySupabaseError } from "@/lib/supabase/errors";
import { verifierFieldsFromRow } from "@/lib/verifier"; // FEAT-9
import {
  type Achievement,
  type AchievementWithEvidence,
  type Category,
  type EvidenceFile,
} from "@/lib/types";

export type AchievementCardModel = Achievement & {
  evidenceCount: number;
};

export type AchievementDraft = {
  title: string;
  category: Category | "";
  organizer: string;
  role: string;
  startDate: string;
  endDate: string;
  hours: string;
  description: string;
};

export type AchievementWrite = {
  title: string;
  category: Category;
  organizer: string | null;
  role: string | null;
  start_date: string | null;
  end_date: string | null;
  hours: number | null;
  description: string | null;
};

type AchievementRow = {
  id: string;
  user_id: string;
  title: string;
  category: string;
  organizer: string | null;
  role: string | null;
  start_date: string | null;
  end_date: string | null;
  hours: number | string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
  evidence_files?: { id: string }[] | null;
};

const TITLE_LIMIT = 180;
const SHORT_TEXT_LIMIT = 160;
const DESCRIPTION_LIMIT = 5000;

export function isCategory(value: string): value is Category {
  return CATEGORIES.some((item) => item.value === value);
}

export function emptyDraft(): AchievementDraft {
  return {
    title: "",
    category: "",
    organizer: "",
    role: "",
    startDate: "",
    endDate: "",
    hours: "",
    description: "",
  };
}

export function draftFromAchievement(achievement: Achievement): AchievementDraft {
  return {
    title: achievement.title,
    category: achievement.category,
    organizer: achievement.organizer ?? "",
    role: achievement.role ?? "",
    startDate: achievement.start_date ?? "",
    endDate: achievement.end_date ?? "",
    hours: achievement.hours === null ? "" : String(achievement.hours),
    description: achievement.description ?? "",
  };
}

export function normalizeAchievementWithEvidence(
  row: AchievementRow & {
    evidence_files?: Array<EvidenceFile | { id: string }> | null;
  },
): AchievementWithEvidence | null {
  const card = normalizeAchievement(row);
  if (!card) return null;

  const files = (row.evidence_files ?? []).filter((file): file is EvidenceFile => {
    return "file_path" in file && "file_name" in file;
  });

  files.sort((left, right) => left.created_at.localeCompare(right.created_at));

  return {
    id: card.id,
    user_id: card.user_id,
    title: card.title,
    category: card.category,
    organizer: card.organizer,
    role: card.role,
    start_date: card.start_date,
    end_date: card.end_date,
    hours: card.hours,
    description: card.description,
    created_at: card.created_at,
    updated_at: card.updated_at,
    ...verifierFieldsFromRow(card), // FEAT-9
    evidence_files: files.map((file) => ({
      ...file,
      file_size: file.file_size === null ? null : Number(file.file_size),
    })),
  };
}

export function normalizeAchievement(row: AchievementRow): AchievementCardModel | null {
  if (!isCategory(row.category)) return null;

  const hours =
    row.hours === null || row.hours === ""
      ? null
      : Number(row.hours);

  return {
    id: row.id,
    user_id: row.user_id,
    title: row.title,
    category: row.category,
    organizer: row.organizer,
    role: row.role,
    start_date: row.start_date,
    end_date: row.end_date,
    hours: hours !== null && Number.isFinite(hours) ? hours : null,
    description: row.description,
    created_at: row.created_at,
    updated_at: row.updated_at,
    ...verifierFieldsFromRow(row), // FEAT-9
    evidenceCount: row.evidence_files?.length ?? 0,
  };
}

export function validateAchievement(draft: AchievementDraft): {
  errors: Partial<Record<keyof AchievementDraft, string>>;
  value?: AchievementWrite;
} {
  const errors: Partial<Record<keyof AchievementDraft, string>> = {};
  const title = draft.title.trim();
  const organizer = draft.organizer.trim();
  const role = draft.role.trim();
  const description = draft.description.trim();

  if (!title) errors.title = "Title is required.";
  else if (title.length > TITLE_LIMIT) {
    errors.title = `Title must be ${TITLE_LIMIT} characters or fewer.`;
  }

  if (!isCategory(draft.category)) errors.category = "Choose a category.";

  if (organizer.length > SHORT_TEXT_LIMIT) {
    errors.organizer = `Organizer must be ${SHORT_TEXT_LIMIT} characters or fewer.`;
  }
  if (role.length > SHORT_TEXT_LIMIT) {
    errors.role = `Role must be ${SHORT_TEXT_LIMIT} characters or fewer.`;
  }
  if (description.length > DESCRIPTION_LIMIT) {
    errors.description = `Description must be ${DESCRIPTION_LIMIT} characters or fewer.`;
  }

  if (draft.startDate && draft.endDate && draft.endDate < draft.startDate) {
    errors.endDate = "End date cannot be before the start date.";
  }

  let hours: number | null = null;
  if (draft.hours.trim() !== "") {
    const parsed = Number(draft.hours);
    if (!Number.isFinite(parsed)) errors.hours = "Hours must be a number.";
    else if (parsed < 0) errors.hours = "Hours cannot be negative.";
    else hours = parsed;
  }

  if (Object.keys(errors).length > 0 || !isCategory(draft.category)) {
    return { errors };
  }

  return {
    errors,
    value: {
      title,
      category: draft.category,
      organizer: organizer || null,
      role: role || null,
      start_date: draft.startDate || null,
      end_date: draft.endDate || null,
      hours,
      description: description || null,
    },
  };
}

export function achievementSaveError(error: { message?: string; code?: string }): string {
  const message = error.message ?? "";
  if (/achievements_date_order_check/i.test(message)) {
    return "End date cannot be before the start date.";
  }
  if (/achievements_hours_check/i.test(message)) {
    return "Hours cannot be negative.";
  }
  if (/achievements_verifier_lengths_check/i.test(message)) {
    return "Verifier name and title must be 80 characters or fewer, and contact must be 120 characters or fewer.";
  }
  if (/achievements_category_check/i.test(message)) {
    return "Choose a category.";
  }
  return friendlySupabaseError(error, "Could not save this achievement.");
}

export function formatIsoDate(iso: string | null): string | null {
  if (!iso) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function formatDateRange(start: string | null, end: string | null): string | null {
  const startLabel = formatIsoDate(start);
  const endLabel = formatIsoDate(end);
  if (startLabel && endLabel) return `${startLabel} – ${endLabel}`;
  if (startLabel) return `From ${startLabel}`;
  if (endLabel) return `Until ${endLabel}`;
  return null;
}

export function formatHours(hours: number): string {
  const rounded = Math.round(hours * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/0$/, "");
}

export function evidenceCountLabel(count: number): string {
  if (count === 0) return "No evidence yet";
  if (count === 1) return "1 evidence file";
  return `${count} evidence files`;
}
