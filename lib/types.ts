export type Category = "award" | "activity" | "volunteering" | "scholarship";

export type Achievement = {
  id: string;
  user_id: string;
  title: string;
  category: Category;
  organizer: string | null;
  role: string | null;
  start_date: string | null;
  end_date: string | null;
  hours: number | null;
  description: string | null;
  created_at: string;
  updated_at: string;
};

export type EvidenceFile = {
  id: string;
  achievement_id: string;
  user_id: string;
  file_name: string;
  file_path: string;
  file_type: string;
  file_size: number | null;
  created_at: string;
};

export type AchievementWithEvidence = Achievement & {
  evidence_files: EvidenceFile[];
};

export const YEAR_OF_STUDY_OPTIONS = [
  "Year 1",
  "Year 2",
  "Year 3",
  "Year 4",
  "Postgraduate",
  "Other",
] as const;

export type YearOfStudy = (typeof YEAR_OF_STUDY_OPTIONS)[number];

export type Profile = {
  id: string;
  username: string | null;
  year_of_study: YearOfStudy | null;
  major: string | null;
  hobbies: string | null;
  hobby_tags: string[];
  created_at: string;
};

export const CATEGORIES: Category[] = [
  "award",
  "activity",
  "volunteering",
  "scholarship",
];

export function categoryLabel(category: Category): string {
  switch (category) {
    case "award":
      return "Award";
    case "activity":
      return "Activity";
    case "volunteering":
      return "Volunteering";
    case "scholarship":
      return "Scholarship";
  }
}
