import type { Category } from "@/lib/types";

export type PresetId = "scholarship" | "internship_cv" | "exchange" | "general";

export type AnswerStyle = "bullet" | "paragraph";

export type PresetChoice = {
  preset: PresetId;
  style: AnswerStyle;
};

export type Preset = {
  label: string;
  description: string;
  defaultStyle: AnswerStyle;
  defaultMaxItems: number | null;
  defaultWordLimit: number | null;
  pdfTitle: string;
  preferredCategoriesOrder: readonly Category[];
};

export const PRESET_IDS: readonly PresetId[] = [
  "scholarship",
  "internship_cv",
  "exchange",
  "general",
];

export const PRESETS: Record<PresetId, Preset> = {
  scholarship: {
    label: "Scholarship",
    description: "Awards and scholarships first, written for a scholarship form.",
    defaultStyle: "paragraph",
    defaultMaxItems: 5,
    defaultWordLimit: 250,
    pdfTitle: "Scholarship Evidence Portfolio",
    preferredCategoriesOrder: [
      "award",
      "scholarship",
      "activity",
      "volunteering",
      "internship",
      "other",
    ],
  },
  internship_cv: {
    label: "Internship / CV",
    description: "Internships and activities first, in short lines for a CV or internship form.",
    defaultStyle: "bullet",
    defaultMaxItems: null,
    defaultWordLimit: null,
    pdfTitle: "Internship Evidence Portfolio",
    preferredCategoriesOrder: [
      "internship",
      "activity",
      "award",
      "volunteering",
      "scholarship",
      "other",
    ],
  },
  exchange: {
    label: "Exchange",
    description: "Activities and volunteering first, for an exchange application.",
    defaultStyle: "paragraph",
    defaultMaxItems: 6,
    defaultWordLimit: 200,
    pdfTitle: "Exchange Application Evidence Portfolio",
    preferredCategoriesOrder: [
      "activity",
      "volunteering",
      "internship",
      "award",
      "scholarship",
      "other",
    ],
  },
  general: {
    label: "General",
    description: "A neutral evidence portfolio with paragraph answers.",
    defaultStyle: "paragraph",
    defaultMaxItems: null,
    defaultWordLimit: null,
    pdfTitle: "Evidence Portfolio",
    preferredCategoriesOrder: [
      "award",
      "activity",
      "volunteering",
      "scholarship",
      "internship",
      "other",
    ],
  },
};

const STYLE_IDS: readonly AnswerStyle[] = ["bullet", "paragraph"];

export function isPresetId(value: string): value is PresetId {
  return (PRESET_IDS as readonly string[]).includes(value);
}

export function isAnswerStyle(value: string): value is AnswerStyle {
  return (STYLE_IDS as readonly string[]).includes(value);
}

export function choiceForPreset(preset: PresetId, style?: AnswerStyle): PresetChoice {
  return { preset, style: style ?? PRESETS[preset].defaultStyle };
}

export function pdfTitleFor(preset: string | null | undefined): string {
  if (!preset || !isPresetId(preset)) return "Evidence Portfolio";
  return PRESETS[preset].pdfTitle;
}

type DatedAchievement = {
  id: string;
  category: string;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
};

function activityDate(item: DatedAchievement): string {
  return item.end_date || item.start_date || item.created_at || "";
}

/**
 * Selected ids only. Category follows the preset, then the newest date.
 * Ids that are not in `achievements` stay at the end, in their original order.
 */
export function orderIdsByPreset(
  ids: readonly string[],
  achievements: readonly DatedAchievement[],
  preset: PresetId,
): string[] {
  const byId = new Map(achievements.map((item) => [item.id, item]));
  const ranks = new Map<string, number>();
  const order = PRESETS[preset].preferredCategoriesOrder;
  order.forEach((category, index) => {
    ranks.set(category, index);
  });
  const unknownRank = order.length;

  return ids
    .map((id, index) => ({ id, index }))
    .sort((left, right) => {
      const a = byId.get(left.id);
      const b = byId.get(right.id);
      const aRank = a ? (ranks.get(a.category) ?? unknownRank) : unknownRank + 1;
      const bRank = b ? (ranks.get(b.category) ?? unknownRank) : unknownRank + 1;
      if (aRank !== bRank) return aRank - bRank;
      const aDate = a ? activityDate(a) : "";
      const bDate = b ? activityDate(b) : "";
      if (aDate !== bDate) return aDate < bDate ? 1 : -1;
      return left.index - right.index;
    })
    .map((entry) => entry.id);
}

let activeChoice: PresetChoice = choiceForPreset("general");

const requestListeners = new Set<(choice: PresetChoice) => void>();

export function getActiveChoice(): PresetChoice {
  return { ...activeChoice };
}

export function getActivePresetId(): PresetId {
  return activeChoice.preset;
}

export function publishPresetChoice(choice: PresetChoice): void {
  if (!isPresetId(choice.preset) || !isAnswerStyle(choice.style)) return;
  activeChoice = { preset: choice.preset, style: choice.style };
}

/**
 * Ask the mounted preset picker to apply a saved choice.
 * If the picker is not mounted, the active choice still updates so a later PDF uses it.
 * Returns false when preset or style is not recognised.
 */
export function requestPresetChoice(input: {
  preset?: string | null;
  style?: string | null;
}): boolean {
  if (!input.preset || !isPresetId(input.preset)) return false;
  const style =
    input.style == null || input.style === ""
      ? PRESETS[input.preset].defaultStyle
      : input.style;
  if (!isAnswerStyle(style)) return false;
  const next = { preset: input.preset, style };
  if (requestListeners.size === 0) {
    publishPresetChoice(next);
    return true;
  }
  for (const listener of requestListeners) listener({ ...next });
  return true;
}

export function subscribePresetRequest(
  listener: (choice: PresetChoice) => void,
): () => void {
  requestListeners.add(listener);
  return () => {
    requestListeners.delete(listener);
  };
}
