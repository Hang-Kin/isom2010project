"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { StatusMessage } from "@/components/ui";
import { formatAnswer } from "@/lib/answers";
import {
  PRESETS,
  PRESET_IDS,
  choiceForPreset,
  getActiveChoice,
  orderIdsByPreset,
  publishPresetChoice,
  subscribePresetRequest,
  type AnswerStyle,
  type PresetChoice,
  type PresetId,
} from "@/lib/presets";
import type { Achievement } from "@/lib/types";

type Notice = {
  tone: "success" | "error" | "info" | "warning";
  text: string;
};

function sameChoice(left: PresetChoice, right: PresetChoice): boolean {
  return left.preset === right.preset && left.style === right.style;
}

function styleLabel(style: AnswerStyle): string {
  return style === "bullet" ? "bullet" : "paragraph";
}

function suggestion(presetId: PresetId): string | null {
  const preset = PRESETS[presetId];
  const parts: string[] = [];
  if (preset.defaultMaxItems !== null) {
    parts.push(`up to ${preset.defaultMaxItems} items`);
  }
  if (preset.defaultWordLimit !== null) {
    parts.push(`${preset.defaultWordLimit} words`);
  }
  if (parts.length === 0) return null;
  return `Suggestion: ${parts.join(", ")}. Your max items and answer limits stay as you set them.`;
}

export function PresetPicker({
  value,
  onChange,
  achievements = [],
  selectedIds = [],
  drafts,
  onDraftsChange,
  onSelectedIdsChange,
  disabled = false,
}: {
  value?: PresetChoice;
  onChange?: (value: PresetChoice) => void;
  achievements?: readonly Achievement[];
  selectedIds?: readonly string[];
  drafts?: Record<string, string>;
  onDraftsChange?: (
    update:
      | Record<string, string>
      | ((current: Record<string, string>) => Record<string, string>),
  ) => void;
  onSelectedIdsChange?: (ids: string[]) => void;
  disabled?: boolean;
}) {
  const [internal, setInternal] = useState<PresetChoice>(() => getActiveChoice());
  const [pending, setPending] = useState<PresetChoice | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const choice = value ?? internal;
  const baselineRef = useRef<Record<string, string>>({});
  const applyRef = useRef<(next: PresetChoice, replaceAll: boolean) => void>(() => {});
  const requestRef = useRef<(next: PresetChoice) => void>(() => {});

  function isAutomatic(
    id: string,
    achievement: Achievement,
    current: string | undefined,
    text: string,
  ): boolean {
    if (current === undefined || current === text) return true;
    const generated = baselineRef.current[id];
    if (generated !== undefined && current === generated) return true;
    if (generated === undefined && current === formatAnswer(achievement)) return true;
    return false;
  }

  function hasEdits(nextChoice: PresetChoice): boolean {
    const byId = new Map(achievements.map((item) => [item.id, item]));
    for (const id of selectedIds) {
      const achievement = byId.get(id);
      if (!achievement) continue;
      const text = formatAnswer(achievement, nextChoice);
      if (isAutomatic(id, achievement, drafts?.[id], text)) continue;
      if (drafts?.[id] === formatAnswer(achievement, choice)) continue;
      return true;
    }
    return false;
  }

  function reorderFor(preset: PresetId): boolean {
    if (!onSelectedIdsChange || selectedIds.length < 2) return false;
    const nextIds = orderIdsByPreset(selectedIds, achievements, preset);
    const unchanged = nextIds.every((id, index) => id === selectedIds[index]);
    if (unchanged) return false;
    onSelectedIdsChange(nextIds);
    return true;
  }

  function commit(next: PresetChoice) {
    const presetChanged = next.preset !== choice.preset;
    setPending(null);
    if (value === undefined) setInternal(next);
    publishPresetChoice(next);
    applyRef.current(next, true);
    onChange?.(next);
    const reordered = presetChanged ? reorderFor(next.preset) : false;
    const count = selectedIds.length;
    const label = PRESETS[next.preset].label;
    const orderedNote = reordered ? " Selected entries were ordered for this preset." : "";
    setNotice({
      tone: "success",
      text: count
        ? `Answers updated for ${label} (${styleLabel(next.style)}).${orderedNote}`
        : `Preset set to ${label}. Select entries to generate answers.`,
    });
  }

  function requestApply(next: PresetChoice) {
    if (disabled) return;
    if (sameChoice(next, choice)) return;
    if (hasEdits(next)) {
      setPending(next);
      setNotice(null);
      return;
    }
    commit(next);
  }

  useLayoutEffect(() => {
    applyRef.current = (nextChoice, replaceAll) => {
      if (!onDraftsChange) return;
      const byId = new Map(achievements.map((item) => [item.id, item]));
      // Snapshot the baseline. React may run the state updater twice; both runs must
      // see the same baseline or the second run treats the rewrite as a user edit.
      const snapshot = { ...baselineRef.current };
      onDraftsChange((existing) => {
        let changed = false;
        const next = { ...existing };
        const stamped = { ...snapshot };
        for (const id of selectedIds) {
          const achievement = byId.get(id);
          if (!achievement) continue;
          const text = formatAnswer(achievement, nextChoice);
          const current = existing[id];
          const generated = snapshot[id];
          const automatic =
            current === undefined ||
            current === text ||
            (generated !== undefined && current === generated) ||
            (generated === undefined && current === formatAnswer(achievement));
          if (!replaceAll && !automatic) continue;
          stamped[id] = text;
          if (current !== text) {
            next[id] = text;
            changed = true;
          }
        }
        baselineRef.current = stamped;
        return changed ? next : existing;
      });
    };
    requestRef.current = requestApply;
  });

  useLayoutEffect(() => {
    publishPresetChoice(choice);
    applyRef.current(choice, false);
  }, [achievements, choice, selectedIds]);

  useEffect(() => {
    return subscribePresetRequest((next) => {
      requestRef.current(next);
    });
  }, []);

  function selectPreset(preset: PresetId) {
    if (preset === choice.preset) return;
    requestApply(choiceForPreset(preset));
  }

  function selectStyle(style: AnswerStyle) {
    requestApply({ preset: choice.preset, style });
  }

  function orderByPreset() {
    if (disabled) return;
    if (selectedIds.length === 0) {
      setNotice({
        tone: "error",
        text: "Select at least one entry before ordering by preset.",
      });
      return;
    }
    if (!onSelectedIdsChange) {
      setNotice({ tone: "error", text: "Could not reorder entries from this page." });
      return;
    }
    const reordered = reorderFor(choice.preset);
    if (!reordered) {
      setNotice({
        tone: "success",
        text: `Selected entries already follow the ${PRESETS[choice.preset].label} order.`,
      });
      return;
    }
    const countLabel = selectedIds.length === 1 ? "entry" : "entries";
    setNotice({
      tone: "success",
      text: `Ordered ${selectedIds.length} selected ${countLabel} for ${PRESETS[choice.preset].label}.`,
    });
  }

  const hint = suggestion(choice.preset);

  return (
    <div className="space-y-4 border-t border-line pt-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="font-serif text-2xl">Application preset</h2>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={orderByPreset}
          disabled={disabled || Boolean(pending)}
        >
          Order by preset
        </button>
      </div>

      <div role="radiogroup" aria-label="Application type" className="grid gap-3 sm:grid-cols-2">
        {PRESET_IDS.map((presetId) => {
          const preset = PRESETS[presetId];
          const selected = choice.preset === presetId;
          return (
            <button
              key={presetId}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => selectPreset(presetId)}
              className={`rounded-md border p-3 text-left ${
                selected ? "border-accent bg-accent-soft" : "border-line bg-white hover:border-accent"
              }`}
            >
              <span className="block font-semibold">{preset.label}</span>
              <span className="mt-1 block text-sm font-normal text-muted">{preset.description}</span>
            </button>
          );
        })}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-semibold" id="answer-style-label">
          Answer style
        </p>
        <div role="radiogroup" aria-labelledby="answer-style-label" className="flex flex-wrap gap-2">
          <button
            type="button"
            role="radio"
            aria-checked={choice.style === "bullet"}
            className={choice.style === "bullet" ? "btn btn-primary" : "btn btn-secondary"}
            onClick={() => selectStyle("bullet")}
            disabled={disabled}
          >
            Bullet
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={choice.style === "paragraph"}
            className={choice.style === "paragraph" ? "btn btn-primary" : "btn btn-secondary"}
            onClick={() => selectStyle("paragraph")}
            disabled={disabled}
          >
            Paragraph
          </button>
        </div>
        <p className="text-sm text-muted">PDF cover: {PRESETS[choice.preset].pdfTitle}</p>
        {hint ? <p className="text-sm text-muted">{hint}</p> : null}
      </div>

      {pending ? (
        <div className="space-y-3" role="alert">
          <p className="text-sm">
            Switch to {PRESETS[pending.preset].label} ({styleLabel(pending.style)})?
          </p>
          <StatusMessage tone="warning">
            Regenerate answers? Your edits will be lost.
          </StatusMessage>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary" onClick={() => commit(pending)} disabled={disabled}>
              Regenerate
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setPending(null);
                setNotice({ tone: "info", text: "Kept your edited answers." });
              }}
              disabled={disabled}
            >
              Keep my edits
            </button>
          </div>
        </div>
      ) : null}

      {notice ? (
        <div aria-live="polite">
          <StatusMessage tone={notice.tone}>{notice.text}</StatusMessage>
        </div>
      ) : null}
    </div>
  );
}
