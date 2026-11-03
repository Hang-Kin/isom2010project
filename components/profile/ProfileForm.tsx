"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { Field, PageHeader, StatusMessage } from "@/components/ui";
import { isYearOfStudy, profileSaveError } from "@/lib/profile";
import { friendlySupabaseError } from "@/lib/supabase/errors";
import { createClient } from "@/lib/supabase/client";
import { YEAR_OF_STUDY_OPTIONS, type YearOfStudy } from "@/lib/types";

const USERNAME_LIMIT = 40;
const MAJOR_LIMIT = 120;
const HOBBIES_LIMIT = 2000;

export function ProfileForm() {
  const [email, setEmail] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [yearOfStudy, setYearOfStudy] = useState<YearOfStudy | "">("");
  const [major, setMajor] = useState("");
  const [hobbies, setHobbies] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ username?: string; major?: string; hobbies?: string }>({});
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
          .select("username, year_of_study, major, hobbies")
          .eq("id", userData.user.id)
          .maybeSingle();

        if (!active) return;

        if (error) {
          setFormError(friendlySupabaseError(error, "Could not load your profile."));
        } else if (data) {
          setUsername(data.username ?? "");
          setYearOfStudy(data.year_of_study && isYearOfStudy(data.year_of_study) ? data.year_of_study : "");
          setMajor(data.major ?? "");
          setHobbies(data.hobbies ?? "");
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

    const nextErrors: { username?: string; major?: string; hobbies?: string } = {};
    const trimmedUsername = username.trim();
    const trimmedMajor = major.trim();
    const trimmedHobbies = hobbies.trim();

    if (trimmedUsername.length > USERNAME_LIMIT) {
      nextErrors.username = `Username must be ${USERNAME_LIMIT} characters or fewer.`;
    }
    if (trimmedMajor.length > MAJOR_LIMIT) {
      nextErrors.major = `Major must be ${MAJOR_LIMIT} characters or fewer.`;
    }
    if (trimmedHobbies.length > HOBBIES_LIMIT) {
      nextErrors.hobbies = `Hobbies must be ${HOBBIES_LIMIT} characters or fewer.`;
    }

    setFieldErrors(nextErrors);
    if (nextErrors.username || nextErrors.major || nextErrors.hobbies) return;

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
          hobbies: trimmedHobbies || null,
        },
        { onConflict: "id" },
      );

      if (error) {
        setFormError(profileSaveError(error));
        setPending(false);
        return;
      }

      setUsername(trimmedUsername);
      setMajor(trimmedMajor);
      setHobbies(trimmedHobbies);
      setSaved(true);
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Could not save your profile.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
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

        <Field label="Hobbies" htmlFor="hobbies" hint="Optional." error={fieldErrors.hobbies}>
          <textarea
            id="hobbies"
            name="hobbies"
            className="field-input min-h-32 resize-y"
            value={hobbies}
            maxLength={HOBBIES_LIMIT}
            onChange={(event) => setHobbies(event.target.value)}
            disabled={loading || pending}
            aria-invalid={fieldErrors.hobbies ? true : undefined}
            aria-describedby={fieldErrors.hobbies ? "hobbies-error" : undefined}
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
