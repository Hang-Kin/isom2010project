"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { Field, PageHeader, StatusMessage } from "@/components/ui";
import { useFormDraft } from "@/lib/form-draft"; // FEAT-12
import {
  achievementSaveError,
  draftFromAchievement,
  emptyDraft,
  normalizeAchievement,
  validateAchievement,
  type AchievementDraft,
} from "@/lib/achievements";
import { friendlySupabaseError } from "@/lib/supabase/errors";
import { createClient } from "@/lib/supabase/client";
import { CATEGORIES } from "@/lib/categories";

export function AchievementForm({
  mode,
  achievementId,
}: {
  mode: "create" | "edit";
  achievementId?: string;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<AchievementDraft>(emptyDraft);
  const [errors, setErrors] = useState<Partial<Record<keyof AchievementDraft, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(mode === "edit");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (mode !== "edit" || !achievementId) return;

    let active = true;

    async function load() {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("achievements")
          .select(
            "id, user_id, title, category, organizer, role, start_date, end_date, hours, description, created_at, updated_at",
          )
          .eq("id", achievementId)
          .maybeSingle();

        if (!active) return;

        if (error) {
          setFormError(friendlySupabaseError(error, "Could not load this achievement."));
          return;
        }

        const achievement = data ? normalizeAchievement(data) : null;
        if (!achievement) {
          setFormError("That achievement could not be found.");
          return;
        }

        setDraft(draftFromAchievement(achievement));
      } catch (cause) {
        if (!active) return;
        setFormError(cause instanceof Error ? cause.message : "Could not load this achievement.");
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [achievementId, mode]);

  function update<Key extends keyof AchievementDraft>(key: Key, value: AchievementDraft[Key]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const result = validateAchievement(draft);
    setErrors(result.errors);
    if (!result.value) return;

    setPending(true);

    try {
      const supabase = createClient();
      const { data: userData, error: userError } = await supabase.auth.getUser();

      if (userError || !userData.user) {
        setFormError(userError?.message || "You need to log in before saving an achievement.");
        setPending(false);
        return;
      }

      if (mode === "create") {
        const { error } = await supabase.from("achievements").insert({
          user_id: userData.user.id,
          ...result.value,
        });

        if (error) {
          setFormError(achievementSaveError(error));
          setPending(false);
          return;
        }
      } else {
        const { error } = await supabase
          .from("achievements")
          .update(result.value)
          .eq("id", achievementId);

        if (error) {
          setFormError(achievementSaveError(error));
          setPending(false);
          return;
        }
      }

      router.push(
        `/dashboard/achievements?saved=${mode === "create" ? "created" : "updated"}`,
      );
      router.refresh();
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Could not save this achievement.");
      setPending(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title={mode === "create" ? "Add achievement" : "Edit achievement"}
        lede="Record an award, activity, volunteering role, scholarship, internship, or other entry. Evidence can be attached after you save."
      />
      {useFormDraft(mode === "create" ? "achievement-new" : null, draft, setDraft) /* FEAT-12 */}

      {loading ? <StatusMessage tone="info">Loading achievement…</StatusMessage> : null}
      {formError ? <StatusMessage tone="error">{formError}</StatusMessage> : null}

      <form className="card space-y-4" onSubmit={onSubmit} noValidate>
        <Field label="Title" htmlFor="title" error={errors.title}>
          <input
            id="title"
            name="title"
            className="field-input"
            value={draft.title}
            onChange={(event) => update("title", event.target.value)}
            disabled={loading || pending}
            aria-invalid={errors.title ? true : undefined}
            aria-describedby={errors.title ? "title-error" : undefined}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category" htmlFor="category" error={errors.category}>
            <select
              id="category"
              name="category"
              className="field-input"
              value={draft.category}
              onChange={(event) => update("category", event.target.value as AchievementDraft["category"])}
              disabled={loading || pending}
              aria-invalid={errors.category ? true : undefined}
              aria-describedby={errors.category ? "category-error" : undefined}
            >
              <option value="">Select a category</option>
              {CATEGORIES.map((category) => (
                <option key={category.value} value={category.value}>
                  {category.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Hours" htmlFor="hours" hint="Optional. Use 0 or more." error={errors.hours}>
            <input
              id="hours"
              name="hours"
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              className="field-input"
              value={draft.hours}
              onChange={(event) => update("hours", event.target.value)}
              disabled={loading || pending}
              aria-invalid={errors.hours ? true : undefined}
              aria-describedby={errors.hours ? "hours-error" : undefined}
            />
          </Field>
          <Field label="Organizer" htmlFor="organizer" hint="Optional." error={errors.organizer}>
            <input
              id="organizer"
              name="organizer"
              className="field-input"
              value={draft.organizer}
              onChange={(event) => update("organizer", event.target.value)}
              disabled={loading || pending}
              aria-invalid={errors.organizer ? true : undefined}
              aria-describedby={errors.organizer ? "organizer-error" : undefined}
            />
          </Field>
          <Field label="Role" htmlFor="role" hint="Optional." error={errors.role}>
            <input
              id="role"
              name="role"
              className="field-input"
              value={draft.role}
              onChange={(event) => update("role", event.target.value)}
              disabled={loading || pending}
              aria-invalid={errors.role ? true : undefined}
              aria-describedby={errors.role ? "role-error" : undefined}
            />
          </Field>
          <Field label="Start date" htmlFor="start-date" hint="Optional." error={errors.startDate}>
            <input
              id="start-date"
              name="start-date"
              type="date"
              className="field-input"
              value={draft.startDate}
              onChange={(event) => update("startDate", event.target.value)}
              disabled={loading || pending}
            />
          </Field>
          <Field label="End date" htmlFor="end-date" hint="Optional." error={errors.endDate}>
            <input
              id="end-date"
              name="end-date"
              type="date"
              className="field-input"
              value={draft.endDate}
              onChange={(event) => update("endDate", event.target.value)}
              disabled={loading || pending}
              aria-invalid={errors.endDate ? true : undefined}
              aria-describedby={errors.endDate ? "end-date-error" : undefined}
            />
          </Field>
        </div>

        <Field label="Description" htmlFor="description" hint="Optional." error={errors.description}>
          <textarea
            id="description"
            name="description"
            className="field-input min-h-36 resize-y"
            value={draft.description}
            onChange={(event) => update("description", event.target.value)}
            disabled={loading || pending}
            aria-invalid={errors.description ? true : undefined}
            aria-describedby={errors.description ? "description-error" : undefined}
          />
        </Field>

        <div className="flex flex-wrap gap-3 pt-2">
          <button type="submit" className="btn btn-primary" disabled={loading || pending}>
            {pending ? "Saving…" : mode === "create" ? "Save achievement" : "Save changes"}
          </button>
          <Link href="/dashboard/achievements" className="btn btn-secondary">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
