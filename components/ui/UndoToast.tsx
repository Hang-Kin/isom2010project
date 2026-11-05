"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import type { AchievementCardModel } from "@/lib/achievements";
import { deleteEvidence, listEvidence } from "@/lib/evidence";
import { formatLayeredError } from "@/lib/supabase/errors";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/client";
import type { EvidenceFile } from "@/lib/types";

const UNDO_MS = 8000;
const TITLE_LIMIT = 180;
const COPY_SUFFIX = " (copy)";
const BUCKET = "evidence";

type Phase = "pending" | "deleting";

type PendingDelete = {
  achievement: AchievementCardModel;
  files: EvidenceFile[] | null;
  timer: number;
  phase: Phase;
};

type FailureNotice = {
  id: string;
  message: string;
};

const pending = new Map<string, PendingDelete>();
const failures: FailureNotice[] = [];
const listeners = new Set<() => void>();
let setter: Dispatch<SetStateAction<AchievementCardModel[]>> | null = null;
let hosts = 0;
let accessToken: string | null = null;
let restoredVisible = false;
let restoredTimer: number | null = null;

function emit() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function hiddenIds(): Set<string> {
  return new Set(pending.keys());
}

async function rememberAccessToken() {
  try {
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    accessToken = data.session?.access_token ?? null;
  } catch {
    accessToken = null;
  }
}

function insertAchievement(
  current: AchievementCardModel[],
  achievement: AchievementCardModel,
): AchievementCardModel[] {
  if (current.some((item) => item.id === achievement.id)) return current;
  const next = [...current, achievement];
  next.sort((left, right) => right.created_at.localeCompare(left.created_at));
  return next;
}

export function copyTitle(title: string): string {
  if (title.length + COPY_SUFFIX.length <= TITLE_LIMIT) return `${title}${COPY_SUFFIX}`;
  const stem = title.slice(0, Math.max(0, TITLE_LIMIT - COPY_SUFFIX.length)).trimEnd();
  return `${stem}${COPY_SUFFIX}`;
}

export function deferAchievementDelete(achievement: AchievementCardModel): boolean {
  if (typeof window === "undefined" || !setter || pending.has(achievement.id)) return pending.has(achievement.id);
  setter((current) => current.filter((item) => item.id !== achievement.id));
  const timer = window.setTimeout(() => {
    void commitDelete(achievement.id);
  }, UNDO_MS);
  pending.set(achievement.id, { achievement, files: null, timer, phase: "pending" });
  emit();
  void rememberAccessToken();
  void cacheFiles(achievement.id);
  return true;
}

async function cacheFiles(id: string) {
  try {
    const files = await listEvidence(id);
    const current = pending.get(id);
    if (current && current.phase === "pending") current.files = files;
  } catch {
    const current = pending.get(id);
    if (current && current.files === null) current.files = [];
  }
}

export function undoAchievementDelete(id: string) {
  const entry = pending.get(id);
  if (!entry || entry.phase === "deleting") return;
  window.clearTimeout(entry.timer);
  pending.delete(id);
  setter?.((current) => insertAchievement(current, entry.achievement));
  restoredVisible = true;
  if (restoredTimer !== null) window.clearTimeout(restoredTimer);
  restoredTimer = window.setTimeout(() => {
    restoredVisible = false;
    restoredTimer = null;
    emit();
  }, 2500);
  emit();
}

async function commitDelete(id: string) {
  const entry = pending.get(id);
  if (!entry || entry.phase === "deleting") return;
  window.clearTimeout(entry.timer);
  entry.phase = "deleting";
  emit();
  try {
    await deleteAchievement(entry);
    pending.delete(id);
    emit();
  } catch (cause) {
    pending.delete(id);
    failures.push({ id, message: formatLayeredError("Could not delete this entry", cause) });
    setter?.((current) => insertAchievement(current, entry.achievement));
    emit();
  }
}

async function deleteAchievement(entry: PendingDelete) {
  const files = entry.files ?? (await listEvidence(entry.achievement.id));
  for (const file of files) {
    await deleteEvidence(file);
  }
  const supabase = createClient();
  const { error } = await supabase.from("achievements").delete().eq("id", entry.achievement.id);
  if (error) throw error;
}

function fireKeepaliveDelete(entry: PendingDelete) {
  let url = "";
  let key = "";
  try {
    const env = getSupabaseEnv();
    url = env.url;
    key = env.key;
  } catch {
    return;
  }
  const headers: Record<string, string> = {
    apikey: key,
    Authorization: `Bearer ${accessToken || key}`,
    "Content-Type": "application/json",
  };
  const files = entry.files ?? [];
  if (files.length > 0) {
    void fetch(`${url}/storage/v1/object/${BUCKET}`, {
      method: "DELETE",
      keepalive: true,
      headers,
      body: JSON.stringify({ prefixes: files.map((file) => file.file_path) }),
    }).catch(() => undefined);
  }
  void fetch(`${url}/rest/v1/achievements?id=eq.${encodeURIComponent(entry.achievement.id)}`, {
    method: "DELETE",
    keepalive: true,
    headers: { ...headers, Prefer: "return=minimal" },
  }).catch(() => undefined);
}

export function flushPendingDeletes(mode: "pagehide" | "route" = "route") {
  const entries = [...pending.values()];
  if (entries.length === 0) return;
  for (const entry of entries) window.clearTimeout(entry.timer);
  pending.clear();
  emit();
  if (mode === "pagehide") {
    for (const entry of entries) fireKeepaliveDelete(entry);
    return;
  }
  for (const entry of entries) {
    void deleteAchievement(entry).catch(() => undefined);
  }
}

export function dismissDeleteFailure(id: string) {
  const index = failures.findIndex((failure) => failure.id === id);
  if (index < 0) return;
  failures.splice(index, 1);
  emit();
}

export function useUndoDelete(
  items: AchievementCardModel[],
  setItems: Dispatch<SetStateAction<AchievementCardModel[]>>,
): ReactNode {
  const [view, setView] = useState<{
    entries: PendingDelete[];
    notices: FailureNotice[];
    restored: boolean;
  }>({ entries: [], notices: [], restored: false });

  useEffect(() => {
    setter = setItems;
    return () => {
      if (setter === setItems) setter = null;
    };
  }, [setItems]);

  useEffect(() => {
    void rememberAccessToken();
    return subscribe(() => {
      setView({
        entries: [...pending.values()],
        notices: [...failures],
        restored: restoredVisible,
      });
    });
  }, []);

  useEffect(() => {
    const ids = hiddenIds();
    if (ids.size === 0) return;
    setItems((current) => {
      const next = current.filter((item) => !ids.has(item.id));
      return next.length === current.length ? current : next;
    });
  }, [items, setItems]);

  useEffect(() => {
    hosts += 1;
    const onPageHide = () => flushPendingDeletes("pagehide");
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      hosts -= 1;
      if (hosts === 0) flushPendingDeletes("route");
    };
  }, []);

  const { entries, notices, restored } = view;
  if (entries.length === 0 && notices.length === 0 && !restored) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
      data-feat12="undo-toast"
    >
      {entries.map((entry) => (
        <div key={entry.achievement.id} className="card space-y-2 py-3 shadow-lg" role="status" aria-live="polite">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm">{entry.phase === "deleting" ? "Deleting…" : "Entry deleted. Undo"}</p>
            {entry.phase === "pending" ? (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => undoAchievementDelete(entry.achievement.id)}
              >
                Undo
              </button>
            ) : null}
          </div>
          {entry.phase === "pending" ? (
            <div className="h-1 overflow-hidden rounded bg-line" aria-hidden="true">
              <div className="h-full bg-accent" style={{ animation: "feat12-undo 8s linear forwards" }} />
            </div>
          ) : null}
        </div>
      ))}
      {restored ? (
        <div className="card py-3 shadow-lg" role="status">
          <p className="text-sm">Entry restored.</p>
        </div>
      ) : null}
      {notices.map((failure) => (
        <div key={failure.id} className="card space-y-2 py-3 shadow-lg" role="alert">
          <p className="text-sm text-danger">{failure.message}</p>
          <button type="button" className="btn btn-ghost" onClick={() => dismissDeleteFailure(failure.id)}>
            Dismiss
          </button>
        </div>
      ))}
      <style>{`@keyframes feat12-undo { from { width: 100%; } to { width: 0%; } }`}</style>
    </div>
  );
}

export function DuplicateAchievementButton({
  achievement,
}: {
  achievement: AchievementCardModel;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [opened, setOpened] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function duplicate() {
    setPending(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data, error: insertError } = await supabase
        .from("achievements")
        .insert({
          // user_id uses the auth.uid() default. Evidence files and verifier fields are not copied.
          title: copyTitle(achievement.title),
          category: achievement.category,
          organizer: achievement.organizer,
          role: achievement.role,
          start_date: achievement.start_date,
          end_date: achievement.end_date,
          hours: achievement.hours,
          description: achievement.description,
        })
        .select("id")
        .single();

      if (insertError || !data || typeof data.id !== "string") {
        setError(formatLayeredError("Could not duplicate this entry", insertError ?? { message: "The copy was not created.", status: 500 }));
        setPending(false);
        return;
      }

      setOpened(true);
      router.push(`/dashboard/achievements/${data.id}/edit`);
    } catch (cause) {
      setError(formatLayeredError("Could not duplicate this entry", cause));
      setPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-ghost"
        onClick={() => void duplicate()}
        disabled={pending || opened}
        aria-busy={pending || undefined}
      >
        {opened ? "Opening the copy…" : pending ? "Duplicating…" : "Duplicate"}
      </button>
      {error ? (
        <p className="basis-full text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}
