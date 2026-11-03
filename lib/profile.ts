import { YEAR_OF_STUDY_OPTIONS, type YearOfStudy } from "@/lib/types";
import { friendlySupabaseError } from "@/lib/supabase/errors";

export function isYearOfStudy(value: string): value is YearOfStudy {
  return (YEAR_OF_STUDY_OPTIONS as readonly string[]).includes(value);
}

export function profileSaveError(error: { message?: string; code?: string }): string {
  const message = error.message ?? "";

  if (error.code === "23505" || /profiles_username_key|duplicate key value/i.test(message)) {
    return "That username is already taken. Choose a different one.";
  }

  if (/profiles_username_present_check/i.test(message)) {
    return "Username cannot be blank. Leave the field empty or enter a name.";
  }

  if (/profiles_year_of_study_check/i.test(message)) {
    return "Choose a year of study from the list, or leave it blank.";
  }

  return friendlySupabaseError(error, "Could not save your profile.");
}
