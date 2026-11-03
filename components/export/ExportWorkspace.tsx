"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { PdfChecklist } from "@/components/export/PdfChecklist";
import { PresetPicker } from "@/components/export/PresetPicker";
import { useBindPacketTarget } from "@/components/export/PacketBar";
import { RelevancePanel } from "@/components/export/RelevancePanel";
import { StatusMessage } from "@/components/ui";
import { formatAnswer } from "@/lib/answers";
import { normalizeAchievementWithEvidence } from "@/lib/achievements";
import { downloadEvidenceBytes } from "@/lib/evidence";
import { keepExistingIds, normalizePacketSettings, type PacketSettings } from "@/lib/packets";
import { buildEvidencePdf, type SkippedFile } from "@/lib/pdf";
import { getActiveChoice, publishPresetChoice, type PresetChoice } from "@/lib/presets";
import { friendlySupabaseError } from "@/lib/supabase/errors";
import { createClient } from "@/lib/supabase/client";
import {
  categoryLabel,
  type AchievementWithEvidence,
} from "@/lib/types";
// FEAT-3: counter
import { AnswerLimitControl, type AnswerLimitValue } from "@/components/export/AnswerLimitControl";
import { AnswerCountSummary, CopyLimitWarning, WordCounter } from "@/components/export/WordCounter";

function parseMaxItems(value: string): { limit: number | null; error: string | null } {
  const trimmed = value.trim();
  if (!trimmed) return { limit: null, error: null };
  if (!/^\d+$/.test(trimmed)) {
    return { limit: null, error: "Max items must be a whole number." };
  }
  const limit = Number(trimmed);
  if (limit < 1) return { limit: null, error: "Max items must be at least 1." };
  return { limit, error: null };
}

function outsideDateWindow(
  achievement: AchievementWithEvidence,
  from: string,
  to: string,
): boolean {
  if (!from && !to) return false;
  const start = achievement.start_date ?? achievement.end_date;
  const end = achievement.end_date ?? achievement.start_date;
  if (!start || !end) return true;
  if (from && end < from) return true;
  if (to && start > to) return true;
  return false;
}

function pdfDownloadName(applicationName: string): string {
  const slug = applicationName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${slug || "evidence-packet"}.pdf`;
}

function WarningBadge({ children }: { children: string }) {
  return (
    <span className="rounded-full bg-warning-soft px-2 py-0.5 text-xs font-semibold text-warning">
      {children}
    </span>
  );
}

export function ExportWorkspace() {
  const [items, setItems] = useState<AchievementWithEvidence[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [profileWarning, setProfileWarning] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [yearOfStudy, setYearOfStudy] = useState("");
  const [major, setMajor] = useState("");
  const [email, setEmail] = useState("");
  const [applicationName, setApplicationName] = useState("");
  const [maxItems, setMaxItems] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [choice, setChoice] = useState<PresetChoice>(() => getActiveChoice());
  const [presetRevision, setPresetRevision] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  // FEAT-3: counter
  const [answerLimit, setAnswerLimit] = useState<AnswerLimitValue>({ limit: null, unit: "words" });
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfBytes, setPdfBytes] = useState(0);
  const [achievementCount, setAchievementCount] = useState(0);
  const [evidencePageCount, setEvidencePageCount] = useState(0);
  const [skipped, setSkipped] = useState<SkippedFile[]>([]);
  const [replacedNonLatin, setReplacedNonLatin] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pdfUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current);
    };
  }, []);

  function replacePdf(url: string | null) {
    if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current);
    pdfUrlRef.current = url;
    setPdfUrl(url);
  }

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const supabase = createClient();
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (!active) return;
        if (userError || !userData.user) {
          setLoadError(userError?.message || "You need to log in before exporting.");
          return;
        }

        setEmail(userData.user.email ?? "");

        const [achievementResult, profileResult] = await Promise.all([
          supabase
            .from("achievements")
            .select(
              "id, user_id, title, category, organizer, role, start_date, end_date, hours, description, created_at, updated_at, evidence_files(id, achievement_id, user_id, file_name, file_path, file_type, file_size, created_at)",
            )
            .order("created_at", { ascending: false }),
          supabase
            .from("profiles")
            .select("username, year_of_study, major")
            .eq("id", userData.user.id)
            .maybeSingle(),
        ]);

        if (!active) return;

        if (achievementResult.error) {
          setLoadError(
            friendlySupabaseError(achievementResult.error, "Could not load achievements."),
          );
          return;
        }

        if (profileResult.error) {
          setProfileWarning(
            friendlySupabaseError(profileResult.error, "Could not load your profile."),
          );
        } else {
          setUsername(profileResult.data?.username ?? "");
          setYearOfStudy(profileResult.data?.year_of_study ?? "");
          setMajor(profileResult.data?.major ?? "");
          setProfileWarning(null);
        }
        setLoadError(null);

        const nextItems = (achievementResult.data ?? [])
          .map((row) => normalizeAchievementWithEvidence(row))
          .filter((row): row is AchievementWithEvidence => row !== null);

        setItems(nextItems);
        setSelectedIds((current) => current.filter((id) => nextItems.some((item) => item.id === id)));
        setDrafts((current) => {
          const allowed = new Set(nextItems.map((item) => item.id));
          return Object.fromEntries(Object.entries(current).filter(([id]) => allowed.has(id)));
        });
      } catch (cause) {
        if (!active) return;
        setLoadError(cause instanceof Error ? cause.message : "Could not load achievements.");
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [reloadKey]);

  const byId = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const max = parseMaxItems(maxItems);
  const windowError =
    dateFrom && dateTo && dateTo < dateFrom
      ? "The end of the date window cannot be before the start."
      : null;
  const selected = selectedIds
    .map((id) => byId.get(id))
    .filter((item): item is AchievementWithEvidence => Boolean(item));

  const answersEdited = selectedIds.some((id) => {
    if (!(id in drafts)) return false;
    const achievement = byId.get(id);
    if (!achievement) return false;
    return (drafts[id] ?? "") !== formatAnswer(achievement, choice);
  });

  function applyLoadedPacket(settings: PacketSettings, achievementIds: string[]) {
    if (loading) {
      throw new Error("Achievements are still loading. Try again in a moment.");
    }
    if (loadError) {
      throw new Error("Achievements could not be loaded, so this packet cannot be applied.");
    }

    const next = normalizePacketSettings(settings);
    const { kept, dropped } = keepExistingIds(
      achievementIds,
      items.map((item) => item.id),
    );
    const nextChoice: PresetChoice = { preset: next.preset, style: next.style };
    setApplicationName(next.applicationName);
    setMaxItems(next.maxItems == null ? "" : String(next.maxItems));
    setDateFrom(next.dateFrom ?? "");
    setDateTo(next.dateTo ?? "");
    setChoice(nextChoice);
    setPresetRevision((current) => current + 1);
    publishPresetChoice(nextChoice);
    setAnswerLimit({ limit: next.wordLimit, unit: next.wordUnit });
    setSelectedIds(kept);
    setDrafts(() => {
      const restored: Record<string, string> = {};
      for (const id of kept) {
        const achievement = items.find((item) => item.id === id);
        if (achievement) restored[id] = formatAnswer(achievement, nextChoice);
      }
      return restored;
    });
    setSkipped([]);
    setGenerateError(null);
    setCopyError(null);
    setReplacedNonLatin(false);
    setAchievementCount(0);
    setEvidencePageCount(0);
    setPdfBytes(0);
    replacePdf(null);
    return { dropped, achievementIds: kept };
  }

  // FEAT-2: packets — PacketBar on the export page reads this target.
  useBindPacketTarget({
    getCurrent: () => ({
      settings: normalizePacketSettings({
        applicationName,
        preset: choice.preset,
        style: choice.style,
        maxItems: max.limit,
        dateFrom: dateFrom || null,
        dateTo: dateTo || null,
        wordLimit: answerLimit.limit,
        wordUnit: answerLimit.unit,
      }),
      achievementIds: selectedIds,
    }),
    onLoad: (settings, achievementIds) => applyLoadedPacket(settings, achievementIds),
    hasLocalEdits: () => answersEdited,
    blockReason: () => max.error ?? windowError,
  });

  function flagsFor(achievement: AchievementWithEvidence, indexInSelection: number) {
    const flags: string[] = [];
    if (indexInSelection >= 0 && achievement.evidence_files.length === 0) {
      flags.push("Missing evidence");
    }
    if (!windowError && outsideDateWindow(achievement, dateFrom, dateTo)) {
      flags.push("Outside date window");
    }
    if (max.limit !== null && indexInSelection >= max.limit) {
      flags.push("Over max items");
    }
    return flags;
  }

  function toggle(id: string) {
    const selectedAlready = selectedIds.includes(id);
    setSelectedIds((current) =>
      selectedAlready ? current.filter((item) => item !== id) : [...current, id],
    );
    setDrafts((current) => {
      if (selectedAlready) {
        const next = { ...current };
        delete next[id];
        return next;
      }
      if (id in current) return current;
      const achievement = byId.get(id);
      return achievement ? { ...current, [id]: formatAnswer(achievement, choice) } : current;
    });
    replacePdf(null);
  }

  function move(id: string, direction: -1 | 1) {
    setSelectedIds((current) => {
      const index = current.indexOf(id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      const [item] = next.splice(index, 1);
      if (!item) return current;
      next.splice(target, 0, item);
      return next;
    });
    replacePdf(null);
  }

  function answerFor(id: string): string {
    if (id in drafts) return drafts[id] ?? "";
    const achievement = byId.get(id);
    return achievement ? formatAnswer(achievement, choice) : "";
  }

  async function copyText(id: string, text: string) {
    setCopyError(null);
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => {
        setCopiedId((current) => (current === id ? null : current));
      }, 2000);
    } catch {
      setCopyError("Could not copy to the clipboard.");
    }
  }

  async function generate() {
    if (selected.length === 0 || windowError || max.error) return;
    setGenerating(true);
    setGenerateError(null);
    setSkipped([]);
    setReplacedNonLatin(false);
    setAchievementCount(0);
    setEvidencePageCount(0);
    replacePdf(null);

    try {
      const entries = [];
      for (const achievement of selected) {
        const files = [];
        for (const file of achievement.evidence_files) {
          try {
            const bytes = await downloadEvidenceBytes(file.file_path);
            files.push({ file, bytes });
          } catch (cause) {
            files.push({
              file,
              error: cause instanceof Error ? cause.message : "The file could not be downloaded.",
            });
          }
        }
        entries.push({ achievement, files });
      }

      const result = await buildEvidencePdf({
        applicationName: applicationName.trim(),
        username: username.trim(),
        userEmail: email.trim(),
        yearOfStudy: yearOfStudy.trim() || null,
        major: major.trim() || null,
        generatedAt: new Date(),
        entries,
        preset: choice.preset,
      });

      const blob = new Blob([Uint8Array.from(result.bytes)], { type: "application/pdf" });
      replacePdf(URL.createObjectURL(blob));
      setPdfBytes(result.bytes.byteLength);
      setAchievementCount(result.achievementCount);
      setEvidencePageCount(result.evidencePageCount);
      setSkipped(result.skipped);
      setReplacedNonLatin(result.replacedNonLatin);
    } catch (cause) {
      setGenerateError(cause instanceof Error ? cause.message : "Could not generate the PDF.");
    } finally {
      setGenerating(false);
    }
  }

  function downloadPdf() {
    if (!pdfUrl) return;
    const anchor = document.createElement("a");
    anchor.href = pdfUrl;
    anchor.download = pdfDownloadName(applicationName.trim() || "Evidence packet");
    anchor.click();
  }

  const generateDisabled =
    generating || selected.length === 0 || Boolean(windowError) || Boolean(max.error);

  return (
    <div className="space-y-6">
      {loading ? <StatusMessage tone="info">Loading achievements…</StatusMessage> : null}
      {profileWarning ? <StatusMessage tone="warning">{profileWarning}</StatusMessage> : null}
      {loadError ? (
        <div className="space-y-3">
          <StatusMessage tone="error">{loadError}</StatusMessage>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setLoading(true);
              setReloadKey((value) => value + 1);
            }}
            disabled={loading}
          >
            {loading ? "Loading…" : "Try again"}
          </button>
        </div>
      ) : null}

      {!loading && !loadError && items.length === 0 ? (
        <div className="card space-y-3">
          <p>You have no achievements yet. Add one before you export.</p>
          <Link href="/dashboard/achievements/new" className="btn btn-primary">
            Add achievement
          </Link>
        </div>
      ) : null}

      {!loading && items.length > 0 ? (
        <>
          <section className="card" aria-label="Application preset">
            {/* FEAT-1: presets */}
            <PresetPicker
              value={choice}
              revision={presetRevision}
              achievements={items}
              selectedIds={selectedIds}
              drafts={drafts}
              disabled={generating}
              onChange={(next) => {
                setChoice(next);
                replacePdf(null);
              }}
              onDraftsChange={setDrafts}
              onSelectedIdsChange={(ids) => {
                setSelectedIds(ids);
                replacePdf(null);
              }}
            />
          </section>

          {/* FEAT-6: relevance */}
          <RelevancePanel
            achievements={items}
            selectedIds={selectedIds}
            onSelect={(ids) => {
              setSelectedIds(ids);
              replacePdf(null);
            }}
          />

          <section className="card space-y-4">
            <h2 className="font-serif text-2xl">Settings</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1.5 text-sm font-semibold md:col-span-2" htmlFor="application-name">
                Application name
                <input
                  id="application-name"
                  className="field-input font-normal"
                  value={applicationName}
                  onChange={(event) => setApplicationName(event.target.value)}
                  placeholder="Example Scholarship 2026"
                />
              </label>
              <label className="space-y-1.5 text-sm font-semibold" htmlFor="max-items">
                Max items
                <input
                  id="max-items"
                  className="field-input font-normal"
                  inputMode="numeric"
                  value={maxItems}
                  onChange={(event) => setMaxItems(event.target.value)}
                  placeholder="Optional"
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-1.5 text-sm font-semibold" htmlFor="date-from">
                  From
                  <input
                    id="date-from"
                    type="date"
                    className="field-input font-normal"
                    value={dateFrom}
                    onChange={(event) => setDateFrom(event.target.value)}
                  />
                </label>
                <label className="space-y-1.5 text-sm font-semibold" htmlFor="date-to">
                  To
                  <input
                    id="date-to"
                    type="date"
                    className="field-input font-normal"
                    value={dateTo}
                    onChange={(event) => setDateTo(event.target.value)}
                  />
                </label>
              </div>
            </div>
            {max.error ? <StatusMessage tone="error">{max.error}</StatusMessage> : null}
            {windowError ? <StatusMessage tone="error">{windowError}</StatusMessage> : null}
            <p className="text-sm text-muted">
              Date window and max items only add warnings. They do not remove entries from the PDF.
            </p>
          </section>

          <div className="grid items-start gap-6 lg:grid-cols-2">
            <section className="card space-y-4">
              <h2 className="font-serif text-2xl">Entries</h2>
              <ul className="space-y-3">
                {items.map((achievement) => {
                  const indexInSelection = selectedIds.indexOf(achievement.id);
                  const checked = indexInSelection >= 0;
                  const flags = flagsFor(achievement, indexInSelection);
                  return (
                    <li key={achievement.id} className="rounded-md border border-line p-3">
                      <label className="flex gap-3">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={checked}
                          onChange={() => toggle(achievement.id)}
                        />
                        <span className="min-w-0 space-y-1">
                          <span className="block font-semibold">{achievement.title}</span>
                          <span className="block text-sm text-muted">
                            {categoryLabel(achievement.category)}
                            {achievement.organizer ? ` · ${achievement.organizer}` : ""}
                          </span>
                          {flags.length > 0 ? (
                            <span className="flex flex-wrap gap-1">
                              {flags.map((flag) => (
                                <WarningBadge key={flag}>{flag}</WarningBadge>
                              ))}
                            </span>
                          ) : null}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </section>

              <section className="card space-y-4">
                <h2 className="font-serif text-2xl">Selected order</h2>
                {selected.length === 0 ? (
                  <p className="text-sm text-muted">Select at least one entry.</p>
                ) : (
                  <ol className="space-y-3">
                    {selected.map((achievement, index) => (
                      <li
                        key={achievement.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line p-3"
                      >
                        <div className="min-w-0 space-y-1">
                          <p className="font-semibold">
                            {index + 1}. {achievement.title}
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {flagsFor(achievement, index).map((flag) => (
                              <WarningBadge key={flag}>{flag}</WarningBadge>
                            ))}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => move(achievement.id, -1)}
                            disabled={index === 0 || generating}
                          >
                            Up
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => move(achievement.id, 1)}
                            disabled={index === selected.length - 1 || generating}
                          >
                            Down
                          </button>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
          </div>

              {/* FEAT-3: counter */}
              <AnswerLimitControl
                key={presetRevision}
                value={answerLimit}
                onChange={setAnswerLimit}
              />

              <section className="card space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="font-serif text-2xl">Copy-ready answers</h2>
                  <span className="flex items-center gap-2">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() =>
                        void copyText(
                          "all",
                          selected.map((achievement) => answerFor(achievement.id)).join("\n\n"),
                        )
                      }
                      disabled={selected.length === 0}
                    >
                      {copiedId === "all" ? "Copied" : "Copy all"}
                    </button>
                    {/* FEAT-3: counter */}
                    <CopyLimitWarning
                      texts={selected.map((achievement) => answerFor(achievement.id))}
                      limit={answerLimit.limit}
                      unit={answerLimit.unit}
                    />
                  </span>
                </div>
                {selected.length === 0 ? (
                  <p className="text-sm text-muted">Answers appear here in the selected order.</p>
                ) : (
                  selected.map((achievement) => (
                    <div key={achievement.id} className="space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <label className="text-sm font-semibold" htmlFor={`answer-${achievement.id}`}>
                          {achievement.title}
                        </label>
                        <span className="flex items-center gap-2">
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => void copyText(achievement.id, answerFor(achievement.id))}
                          >
                            {copiedId === achievement.id ? "Copied" : "Copy"}
                          </button>
                          {/* FEAT-3: counter */}
                          <CopyLimitWarning
                            texts={[answerFor(achievement.id)]}
                            limit={answerLimit.limit}
                            unit={answerLimit.unit}
                          />
                        </span>
                      </div>
                      <textarea
                        id={`answer-${achievement.id}`}
                        className="field-input min-h-28 resize-y"
                        value={answerFor(achievement.id)}
                        onChange={(event) =>
                          setDrafts((current) => ({
                            ...current,
                            [achievement.id]: event.target.value,
                          }))
                        }
                      />
                      {/* FEAT-3: counter */}
                      <WordCounter
                        text={answerFor(achievement.id)}
                        limit={answerLimit.limit}
                        unit={answerLimit.unit}
                      />
                    </div>
                  ))
                )}
                {/* FEAT-3: counter */}
                <AnswerCountSummary
                  texts={selected.map((achievement) => answerFor(achievement.id))}
                  limit={answerLimit.limit}
                  unit={answerLimit.unit}
                />
                {copyError ? <StatusMessage tone="error">{copyError}</StatusMessage> : null}
              </section>

              <section className="card space-y-4">
                <h2 className="font-serif text-2xl">Evidence PDF</h2>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => void generate()}
                  disabled={generateDisabled}
                >
                  {generating ? "Generating PDF…" : "Generate evidence PDF"}
                </button>
                {selected.length === 0 ? (
                  <p className="text-sm text-muted">Select at least one entry to generate a PDF.</p>
                ) : null}
                {generateError ? <StatusMessage tone="error">{generateError}</StatusMessage> : null}
                {pdfUrl ? (
                  <div className="space-y-3">
                    <StatusMessage tone="success">PDF ready.</StatusMessage>
                    <PdfChecklist
                      achievements={achievementCount}
                      evidencePages={evidencePageCount}
                      fileSizeBytes={pdfBytes}
                      warnings={[
                        ...(replacedNonLatin
                          ? ["Some characters are not supported in the PDF"]
                          : []),
                        ...(skipped.length > 0
                          ? [
                              skipped.length === 1
                                ? "1 evidence file could not be included."
                                : `${skipped.length} evidence files could not be included.`,
                            ]
                          : []),
                      ]}
                    />
                    <iframe
                      title="Evidence PDF preview"
                      src={pdfUrl}
                      className="h-[480px] w-full rounded-md border border-line bg-white"
                    />
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="btn btn-primary" onClick={downloadPdf}>
                        Download
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => window.open(pdfUrl, "_blank", "noopener,noreferrer")}
                      >
                        Open in new tab
                      </button>
                    </div>
                  </div>
                ) : null}
                {skipped.length > 0 ? (
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold">Not included</h3>
                    <ul className="space-y-1 text-sm text-danger">
                      {skipped.map((file) => (
                        <li key={`${file.fileName}-${file.reason}`}>
                          {file.fileName} — {file.reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </section>
        </>
      ) : null}
    </div>
  );
}
