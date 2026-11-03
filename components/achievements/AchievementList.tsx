"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AchievementCard } from "@/components/achievements/AchievementCard";
import { PageHeader, StatusMessage } from "@/components/ui";
import {
  normalizeAchievement,
  type AchievementCardModel,
} from "@/lib/achievements";
import { friendlySupabaseError } from "@/lib/supabase/errors";
import { createClient } from "@/lib/supabase/client";
import { CATEGORIES, categoryLabel, type Category } from "@/lib/types";

export function AchievementList() {
  const searchParams = useSearchParams();
  const saved = searchParams.get("saved");
  const [items, setItems] = useState<AchievementCardModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category | "all">("all");
  const [notice, setNotice] = useState<string | null>(
    saved === "created"
      ? "Achievement saved."
      : saved === "updated"
        ? "Achievement updated."
        : saved === "deleted"
          ? "Achievement deleted."
          : null,
  );
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const supabase = createClient();
        const { data, error: queryError } = await supabase
          .from("achievements")
          .select(
            "id, user_id, title, category, organizer, role, start_date, end_date, hours, description, created_at, updated_at, evidence_files(id)",
          )
          .order("created_at", { ascending: false });

        if (!active) return;

        if (queryError) {
          setError(friendlySupabaseError(queryError, "Could not load achievements."));
          return;
        }

        const nextItems = (data ?? [])
          .map((row) => normalizeAchievement(row))
          .filter((row): row is AchievementCardModel => row !== null);

        setItems(nextItems);
        setError(null);
      } catch (cause) {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : "Could not load achievements.");
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [reloadKey]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => {
      if (category !== "all" && item.category !== category) return false;
      if (!needle) return true;
      const haystack = `${item.title} ${item.organizer ?? ""}`.toLowerCase();
      return haystack.includes(needle);
    });
  }, [category, items, query]);

  function retry() {
    setLoading(true);
    setError(null);
    setReloadKey((value) => value + 1);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Achievements"
        lede="Awards, activities, volunteering, and scholarships you may want to reuse."
        actions={
          <Link href="/dashboard/achievements/new" className="btn btn-primary">
            Add achievement
          </Link>
        }
      />

      {notice ? (
        <StatusMessage tone="success">
          <span className="flex flex-wrap items-center justify-between gap-3">
            {notice}
            <button type="button" className="btn btn-ghost" onClick={() => setNotice(null)}>
              Dismiss
            </button>
          </span>
        </StatusMessage>
      ) : null}

      {error ? (
        <div className="space-y-3">
          <StatusMessage tone="error">{error}</StatusMessage>
          <button type="button" className="btn btn-secondary" onClick={retry} disabled={loading}>
            {loading ? "Loading…" : "Try again"}
          </button>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_14rem]">
        <label className="space-y-1.5 text-sm font-semibold" htmlFor="achievement-search">
          Search
          <input
            id="achievement-search"
            className="field-input font-normal"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Title or organizer"
            type="search"
          />
        </label>
        <label className="space-y-1.5 text-sm font-semibold" htmlFor="category-filter">
          Category
          <select
            id="category-filter"
            className="field-input font-normal"
            value={category}
            onChange={(event) => setCategory(event.target.value as Category | "all")}
          >
            <option value="all">All categories</option>
            {CATEGORIES.map((item) => (
              <option key={item} value={item}>
                {categoryLabel(item)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading ? <StatusMessage tone="info">Loading achievements…</StatusMessage> : null}

      {!loading && !error && items.length === 0 ? (
        <div className="card space-y-3">
          <p>No entries yet. Add your first award or activity.</p>
          <Link href="/dashboard/achievements/new" className="btn btn-primary">
            Add achievement
          </Link>
        </div>
      ) : null}

      {!loading && items.length > 0 && filtered.length === 0 ? (
        <StatusMessage tone="info">No entries match your search.</StatusMessage>
      ) : null}

      <div className="space-y-4">
        {filtered.map((achievement) => (
          <AchievementCard
            key={achievement.id}
            achievement={achievement}
            onDeleted={(id) => {
              setItems((current) => current.filter((item) => item.id !== id));
              setNotice("Achievement deleted.");
            }}
          />
        ))}
      </div>
    </div>
  );
}
