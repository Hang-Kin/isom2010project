"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import EvidenceManager from "@/components/evidence/EvidenceManager";
import { StatusMessage } from "@/components/ui";
import {
  evidenceCountLabel,
  formatDateRange,
  formatHours,
  type AchievementCardModel,
} from "@/lib/achievements";
import { deleteEvidence, listEvidence } from "@/lib/evidence";
import { friendlySupabaseError } from "@/lib/supabase/errors";
import { createClient } from "@/lib/supabase/client";
import { categoryLabel, type Category } from "@/lib/types";

const badgeClass: Record<Category, string> = {
  award: "bg-accent-soft text-accent-strong",
  activity: "bg-[#e7eef6] text-[#1e3a5f]",
  volunteering: "bg-warning-soft text-warning",
  scholarship: "bg-[#f3e8ee] text-[#5c3b4a]",
};

export function AchievementCard({
  achievement,
  onDeleted,
}: {
  achievement: AchievementCardModel;
  onDeleted: (id: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [evidenceCount, setEvidenceCount] = useState(achievement.evidenceCount);
  const dateRange = formatDateRange(achievement.start_date, achievement.end_date);
  const handleEvidenceCount = useCallback((count: number) => {
    setEvidenceCount(count);
  }, []);

  async function remove() {
    setPending(true);
    setError(null);

    try {
      const files = await listEvidence(achievement.id);
      for (const file of files) {
        await deleteEvidence(file);
      }

      const supabase = createClient();
      const { error: deleteError } = await supabase
        .from("achievements")
        .delete()
        .eq("id", achievement.id);

      if (deleteError) {
        setError(friendlySupabaseError(deleteError, "Could not delete this achievement."));
        setPending(false);
        return;
      }

      onDeleted(achievement.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete this achievement.");
      setPending(false);
    }
  }

  return (
    <article className="card space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <h2 className="font-serif text-2xl leading-tight">{achievement.title}</h2>
          <span
            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${badgeClass[achievement.category]}`}
          >
            {categoryLabel(achievement.category)}
          </span>
        </div>
        <p className="text-sm text-muted">{evidenceCountLabel(evidenceCount)}</p>
      </div>

      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="font-semibold">Organizer</dt>
          <dd className="text-muted">{achievement.organizer || "—"}</dd>
        </div>
        <div>
          <dt className="font-semibold">Role</dt>
          <dd className="text-muted">{achievement.role || "—"}</dd>
        </div>
        <div>
          <dt className="font-semibold">Dates</dt>
          <dd className="text-muted">{dateRange || "—"}</dd>
        </div>
        <div>
          <dt className="font-semibold">Hours</dt>
          <dd className="text-muted">
            {achievement.hours === null ? "—" : `${formatHours(achievement.hours)} hours`}
          </dd>
        </div>
      </dl>

      {achievement.description ? (
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{achievement.description}</p>
      ) : null}

      <EvidenceManager achievementId={achievement.id} onCountChange={handleEvidenceCount} />

      {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}

      {confirming ? (
        <div className="space-y-3 rounded-md border border-danger/30 bg-danger-soft p-3">
          <p className="text-sm text-danger">
            Delete this achievement and its evidence files? This cannot be undone.
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-danger" onClick={remove} disabled={pending}>
              {pending ? "Deleting…" : "Delete achievement"}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setConfirming(false)}
              disabled={pending}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Link href={`/dashboard/achievements/${achievement.id}/edit`} className="btn btn-secondary">
            Edit
          </Link>
          <button type="button" className="btn btn-ghost" onClick={() => setConfirming(true)}>
            Delete
          </button>
        </div>
      )}
    </article>
  );
}
