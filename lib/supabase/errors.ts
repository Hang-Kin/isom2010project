type SupabaseErrorLike = {
  message?: string;
  code?: string;
};

export function friendlySupabaseError(
  error: SupabaseErrorLike | null | undefined,
  fallback: string,
): string {
  const message = error?.message?.trim() || fallback;

  if (
    /relation .* does not exist|schema cache|could not find the table|could not find the/i.test(
      message,
    )
  ) {
    return `${message} Paste supabase/schema.sql into the Supabase SQL editor, then try again.`;
  }

  return message;
}
