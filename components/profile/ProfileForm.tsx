"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { TagInput, type TagInputHandle } from "@/components/profile/TagInput";
import { Field, PageHeader, StatusMessage } from "@/components/ui";
import { normalizeHobbyTags, savedHobbyTagsError } from "@/lib/hobby-presets";
import { isYearOfStudy, profileSaveError } from "@/lib/profile";
import { friendlySupabaseError } from "@/lib/supabase/errors";
import { createClient } from "@/lib/supabase/client";
import { YEAR_OF_STUDY_OPTIONS, type YearOfStudy } from "@/lib/types";

const USERNAME_LIMIT = 40;
const MAJOR_LIMIT = 120;

const HOBBY_COLUMN_MESSAGE =
  "Hobby tags are not in the database yet. Run the hobby_tags SQL in the Supabase SQL editor, then try again.";

type SavedProfile = {
  username: string;
  yearOfStudy: YearOfStudy | "";
  major: string;
  hobbyTags: string[];
};

function columnMessage(error: { message?: string } | null | undefined, fallback: string): string {
  if (/hobby_tags/i.test(error?.message ?? "")) return HOBBY_COLUMN_MESSAGE;
  return fallback;
}

function summaryValue(value: string): string {
  return value.trim() ? value : "Not set";
}

export function ProfileForm() {
  const tagInputRef = useRef<TagInputHandle>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [yearOfStudy, setYearOfStudy] = useState<YearOfStudy | "">("");
  const [major, setMajor] = useState("");
  const [hobbyTags, setHobbyTags] = useState<string[]>([]);
  const [savedProfile, setSavedProfile] = useState<SavedProfile | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ username?: string; major?: string }>({});
  const [hobbyError, setHobbyError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const supabase = createClient();
        const { data: userData, error: userError } = await supabase.auth.getUser();

        if (!active) return;

        if (userError || !userData.user) {
          setFormError(userError?.message || "You need to log in before editing your profile.");
          setLoading(false);
          return;
        }

        setEmail(userData.user.email ?? null);

        const { data, error } = await supabase
          .from("profiles")
          .select("username, year_of_study, major, hobby_tags")
          .eq("id", userData.user.id)
          .maybeSingle();

        if (!active) return;

        if (error) {
          setFormError(
            columnMessage(error, friendlySupabaseError(error, "Could not load your profile.")),
          );
        } else if (data) {
          const nextUsername = data.username ?? "";
          const nextYear =
            data.year_of_study && isYearOfStudy(data.year_of_study) ? data.year_of_study : "";
          const nextMajor = data.major ?? "";
          const nextTags = normalizeHobbyTags(
            Array.isArray(data.hobby_tags)
              ? data.hobby_tags.filter((tag): tag is string => typeof tag === "string")
              : [],
          );

          setUsername(nextUsername);
          setYearOfStudy(nextYear);
          setMajor(nextMajor);
          setHobbyTags(nextTags);
          setSavedProfile({
            username: nextUsername,
            yearOfStudy: nextYear,
            major: nextMajor,
            hobbyTags: nextTags,
          });
        } else {
          setSavedProfile({ username: "", yearOfStudy: "", major: "", hobbyTags: [] });
        }
      } catch (cause) {
        if (!active) return;
        setFormError(cause instanceof Error ? cause.message : "Could not load your profile.");
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaved(false);
    setFormError(null);

    const flushed = tagInputRef.current?.flushDraft() ?? {
      ok: false as const,
      error: "The hobby picker is still loading. Try again.",
    };
    const tagsToSave = flushed.ok ? normalizeHobbyTags(flushed.tags) : hobbyTags;
    const nextHobbyError = flushed.ok ? savedHobbyTagsError(tagsToSave) : flushed.error;

    const nextErrors: { username?: string; major?: string } = {};
    const trimmedUsername = username.trim();
    const trimmedMajor = major.trim();

    if (trimmedUsername.length > USERNAME_LIMIT) {
      nextErrors.username = `Username must be ${USERNAME_LIMIT} characters or fewer.`;
    }
    if (trimmedMajor.length > MAJOR_LIMIT) {
      nextErrors.major = `Major must be ${MAJOR_LIMIT} characters or fewer.`;
    }

    setFieldErrors(nextErrors);
    setHobbyError(nextHobbyError);
    if (nextErrors.username || nextErrors.major || nextHobbyError) return;

    setHobbyTags(tagsToSave);
    setPending(true);

    try {
      const supabase = createClient();
      const { data: userData, error: userError } = await supabase.auth.getUser();

      if (userError || !userData.user) {
        setFormError(userError?.message || "You need to log in before editing your profile.");
        setPending(false);
        return;
      }

      const { error } = await supabase.from("profiles").upsert(
        {
          id: userData.user.id,
          username: trimmedUsername || null,
          year_of_study: yearOfStudy || null,
          major: trimmedMajor || null,
          hobby_tags: tagsToSave,
        },
        { onConflict: "id" },
      );

      if (error) {
        setFormError(columnMessage(error, profileSaveError(error)));
        setPending(false);
        return;
      }

      setUsername(trimmedUsername);
      setMajor(trimmedMajor);
      setHobbyTags(tagsToSave);
      setSavedProfile({
        username: trimmedUsername,
        yearOfStudy,
        major: trimmedMajor,
        hobbyTags: tagsToSave,
      });
      setSaved(true);
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Could not save your profile.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Your profile"
        lede="Every field is optional. Add a username if you want it on your evidence PDF, or go straight to the dashboard."
      />

      <p className="text-sm text-muted">
        Signed in as {email ?? "your account"}. You can come back to this page from Profile in the header.
      </p>

      {loading ? <StatusMessage tone="info">Loading your profile…</StatusMessage> : null}
      {formError ? <StatusMessage tone="error">{formError}</StatusMessage> : null}
      {saved ? <StatusMessage tone="success">Profile saved.</StatusMessage> : null}

      {savedProfile ? (
        <section className="card space-y-4" aria-labelledby="profile-summary-heading">
          <h2 id="profile-summary-heading" className="font-serif text-2xl">
            Profile summary
          </h2>
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted">Username</dt>
              <dd className="font-medium">{summaryValue(savedProfile.username)}</dd>
            </div>
            <div>
              <dt className="text-muted">Year of study</dt>
              <dd className="font-medium">{summaryValue(savedProfile.yearOfStudy)}</dd>
            </div>
            <div>
              <dt className="text-muted">Major</dt>
              <dd className="font-medium">{summaryValue(savedProfile.major)}</dd>
            </div>
          </dl>
          <div>
            <h3 className="text-sm text-muted">Hobbies</h3>
            {savedProfile.hobbyTags.length > 0 ? (
              <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Saved hobbies">
                {savedProfile.hobbyTags.map((tag) => (
                  <li
                    key={tag}
                    className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent-strong"
                  >
                    {tag}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-sm">No hobbies selected yet.</p>
            )}
          </div>
        </section>
      ) : null}

      <form className="card space-y-4" onSubmit={onSubmit} noValidate>
        <Field
          label="Username"
          htmlFor="username"
          hint="Optional. Must be unique if you choose one. It is printed on the PDF cover."
          error={fieldErrors.username}
        >
          <input
            id="username"
            name="username"
            type="text"
            autoComplete="username"
            className="field-input"
            value={username}
            maxLength={USERNAME_LIMIT}
            onChange={(event) => setUsername(event.target.value)}
            disabled={loading || pending}
            aria-invalid={fieldErrors.username ? true : undefined}
            aria-describedby={fieldErrors.username ? "username-error" : undefined}
          />
        </Field>

        <Field label="Year of study" htmlFor="year-of-study" hint="Optional.">
          <select
            id="year-of-study"
            name="year-of-study"
            className="field-input"
            value={yearOfStudy}
            onChange={(event) => {
              const value = event.target.value;
              setYearOfStudy(isYearOfStudy(value) ? value : "");
            }}
            disabled={loading || pending}
          >
            <option value="">Leave blank</option>
            {YEAR_OF_STUDY_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Major" htmlFor="major" hint="Optional." error={fieldErrors.major}>
          <input
            id="major"
            name="major"
            type="text"
            className="field-input"
            value={major}
            maxLength={MAJOR_LIMIT}
            onChange={(event) => setMajor(event.target.value)}
            disabled={loading || pending}
            aria-invalid={fieldErrors.major ? true : undefined}
            aria-describedby={fieldErrors.major ? "major-error" : undefined}
          />
        </Field>

        <Field
          label="Hobbies"
          htmlFor="hobby-tags"
          hint="Optional. Choose presets or add your own. Press Enter or comma to add a custom hobby."
        >
          <TagInput
            ref={tagInputRef}
            inputId="hobby-tags"
            selected={hobbyTags}
            onChange={setHobbyTags}
            onError={setHobbyError}
            disabled={loading || pending}
            error={hobbyError}
          />
        </Field>

        <div className="flex flex-wrap gap-3 pt-2">
          <button type="submit" className="btn btn-primary" disabled={loading || pending}>
            {pending ? "Saving…" : "Save profile"}
          </button>
          <Link href="/dashboard" className="btn btn-secondary">
            Go to dashboard
          </Link>
        </div>
      </form>
    </div>
  );
}
