export const MAX_HOBBY_TAGS = 15;
export const MAX_HOBBY_TAG_LENGTH = 30;

export const HOBBY_GROUPS = [
  {
    label: "Sports and fitness",
    hobbies: [
      "Basketball",
      "Football",
      "Badminton",
      "Table tennis",
      "Swimming",
      "Running",
      "Cycling",
      "Hiking",
      "Gym",
      "Yoga",
      "Tennis",
      "Volleyball",
      "Climbing",
    ],
  },
  {
    label: "Arts and music",
    hobbies: [
      "Singing",
      "Guitar",
      "Piano",
      "Dance",
      "Drawing",
      "Photography",
      "Video editing",
      "Writing",
      "Theatre",
      "K-pop",
      "Calligraphy",
    ],
  },
  {
    label: "Tech and games",
    hobbies: [
      "Coding",
      "Gaming",
      "Anime",
      "Board games",
      "Chess",
      "Robotics",
      "Podcasts",
      "Movies",
      "Web design",
    ],
  },
  {
    label: "Learning and community",
    hobbies: [
      "Reading",
      "Debating",
      "Investing",
      "Entrepreneurship",
      "Language learning",
      "Volunteering",
      "Public speaking",
      "Tutoring",
    ],
  },
  {
    label: "Lifestyle",
    hobbies: [
      "Cooking",
      "Baking",
      "Travelling",
      "Fashion",
      "Coffee",
      "Meditation",
      "Pets",
      "Gardening",
      "Journaling",
    ],
  },
] as const;

export type HobbyPreset = (typeof HOBBY_GROUPS)[number]["hobbies"][number];

export const HOBBY_PRESETS: readonly HobbyPreset[] = HOBBY_GROUPS.flatMap((group) => [
  ...group.hobbies,
]);

const PRESET_BY_KEY = new Map<string, HobbyPreset>(
  HOBBY_PRESETS.map((hobby) => [hobby.toLowerCase(), hobby]),
);

export function hobbyKey(tag: string): string {
  return tag.trim().toLowerCase();
}

export function isPresetHobby(tag: string): boolean {
  return PRESET_BY_KEY.has(hobbyKey(tag));
}

/** Preset names keep their list spelling. Anything else keeps the trimmed text. */
export function canonicalHobby(tag: string): string {
  const trimmed = tag.trim();
  return PRESET_BY_KEY.get(trimmed.toLowerCase()) ?? trimmed;
}

export function normalizeHobbyTags(tags: readonly string[]): string[] {
  const result: string[] = [];

  for (const tag of tags) {
    if (typeof tag !== "string") continue;
    const trimmed = tag.trim();
    if (!trimmed) continue;
    const canonical = canonicalHobby(trimmed);
    if (result.some((item) => hobbyKey(item) === hobbyKey(canonical))) continue;
    result.push(canonical);
  }

  return result;
}

export function hobbyAddError(raw: string, selected: readonly string[]): string | null {
  const trimmed = raw.trim();

  if (!trimmed) {
    return "Enter a hobby, then press Enter.";
  }

  if (trimmed.length > MAX_HOBBY_TAG_LENGTH) {
    return `That hobby is too long. Use ${MAX_HOBBY_TAG_LENGTH} characters or fewer.`;
  }

  const existing = selected.find((item) => hobbyKey(item) === hobbyKey(trimmed));
  if (existing) {
    return `${existing} is already selected.`;
  }

  if (selected.length >= MAX_HOBBY_TAGS) {
    return `You can select up to ${MAX_HOBBY_TAGS} hobbies. Remove one to add another.`;
  }

  return null;
}

export function savedHobbyTagsError(tags: readonly string[]): string | null {
  if (tags.length > MAX_HOBBY_TAGS) {
    return `You can select up to ${MAX_HOBBY_TAGS} hobbies. Remove one to add another.`;
  }

  for (const tag of tags) {
    if (tag.trim().length > MAX_HOBBY_TAG_LENGTH) {
      return `"${tag}" is too long. Use ${MAX_HOBBY_TAG_LENGTH} characters or fewer.`;
    }
  }

  return null;
}

/**
 * Add comma-separated hobbies.
 * "completed" commits every token except the text after the last comma (the in-progress word).
 * "all" commits every token. Used for Enter and for saving.
 */
export function addHobbyText(
  selected: readonly string[],
  raw: string,
  mode: "all" | "completed",
): { tags: string[]; error: string | null; remainder: string } {
  if (mode === "all" && raw.trim() === "") {
    return { tags: [...selected], error: null, remainder: "" };
  }

  const parts = raw.split(",");
  const tokens = mode === "completed" ? parts.slice(0, -1) : parts;
  const pending = mode === "completed" ? (parts[parts.length - 1] ?? "") : "";
  let tags = [...selected];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index] ?? "";
    if (!token.trim()) continue;

    const error = hobbyAddError(token, tags);
    if (error) {
      const leftover =
        mode === "completed"
          ? [...tokens.slice(index), parts[parts.length - 1] ?? ""].join(",")
          : tokens.slice(index).join(",");
      return { tags, error, remainder: leftover };
    }

    tags = [...tags, canonicalHobby(token)];
  }

  return {
    tags,
    error: null,
    remainder: mode === "completed" ? pending.replace(/^\s+/, "") : "",
  };
}

export function toggleHobbyPreset(
  selected: readonly string[],
  preset: string,
): { tags: string[]; error: string | null } {
  const key = hobbyKey(preset);

  if (selected.some((item) => hobbyKey(item) === key)) {
    return { tags: selected.filter((item) => hobbyKey(item) !== key), error: null };
  }

  const error = hobbyAddError(preset, selected);
  if (error) return { tags: [...selected], error };
  return { tags: [...selected, canonicalHobby(preset)], error: null };
}

export function removeHobbyTag(selected: readonly string[], tag: string): string[] {
  const key = hobbyKey(tag);
  return selected.filter((item) => hobbyKey(item) !== key);
}
