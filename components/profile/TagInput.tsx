"use client";

import { useEffect, useImperativeHandle, useRef, useState, type KeyboardEvent, type Ref } from "react";
import {
  HOBBY_GROUPS,
  MAX_HOBBY_TAGS,
  addHobbyText,
  hobbyKey,
  isPresetHobby,
  removeHobbyTag,
  toggleHobbyPreset,
} from "@/lib/hobby-presets";

export type TagInputHandle = {
  flushDraft: () => { ok: true; tags: string[] } | { ok: false; error: string };
};

const chipBase =
  "inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60";
const chipOn = `${chipBase} border-accent bg-accent text-white`;
const chipOff = `${chipBase} border-line bg-white text-foreground hover:border-accent hover:text-accent-strong`;

export function TagInput({
  ref,
  selected,
  onChange,
  onError,
  disabled = false,
  error = null,
  inputId,
}: {
  ref?: Ref<TagInputHandle>;
  selected: string[];
  onChange: (tags: string[]) => void;
  onError: (message: string | null) => void;
  disabled?: boolean;
  error?: string | null;
  inputId: string;
}) {
  const [draft, setDraft] = useState("");
  const errorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (!error) return;
    errorRef.current?.scrollIntoView({ block: "nearest" });
  }, [error]);

  useImperativeHandle(
    ref,
    () => ({
      flushDraft() {
        if (!draft.trim()) {
          if (draft) setDraft("");
          onError(null);
          return { ok: true, tags: selected };
        }

        const result = addHobbyText(selected, draft, "all");
        onChange(result.tags);
        setDraft(result.remainder);
        onError(result.error);

        if (result.error) return { ok: false, error: result.error };
        return { ok: true, tags: result.tags };
      },
    }),
    [draft, onChange, onError, selected],
  );

  const customTags = selected.filter((tag) => !isPresetHobby(tag));

  function apply(result: { tags: string[]; error: string | null; remainder: string }) {
    if (result.tags.length !== selected.length || result.tags.some((tag, index) => tag !== selected[index])) {
      onChange(result.tags);
    }
    setDraft(result.remainder);
    onError(result.error);
  }

  function onToggle(preset: string) {
    const result = toggleHobbyPreset(selected, preset);
    onChange(result.tags);
    onError(result.error);
  }

  function onRemove(tag: string) {
    onChange(removeHobbyTag(selected, tag));
    onError(null);
  }

  function onDraftChange(value: string) {
    if (!value.includes(",")) {
      setDraft(value);
      if (error) onError(null);
      return;
    }

    apply(addHobbyText(selected, value, "completed"));
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    if (!draft.trim()) return;

    event.preventDefault();
    apply(addHobbyText(selected, draft, "all"));
  }

  return (
    <div className="space-y-4">
      <p className="text-sm font-medium text-muted" aria-live="polite">
        {selected.length}/{MAX_HOBBY_TAGS} selected
      </p>
      {error ? (
        <p ref={errorRef} id={`${inputId}-error`} role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}

      <div className="space-y-4">
        {HOBBY_GROUPS.map((group) => (
          <div key={group.label}>
            <h3 className="mb-2 text-sm font-semibold">{group.label}</h3>
            <div className="flex flex-wrap gap-2">
              {group.hobbies.map((hobby) => {
                const pressed = selected.some((tag) => hobbyKey(tag) === hobbyKey(hobby));
                return (
                  <button
                    key={hobby}
                    type="button"
                    aria-pressed={pressed}
                    disabled={disabled}
                    onClick={() => onToggle(hobby)}
                    className={pressed ? chipOn : chipOff}
                  >
                    {hobby}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {customTags.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label="Custom hobbies">
          {customTags.map((tag) => (
            <li key={hobbyKey(tag)} className={`${chipOn} gap-1 pr-1`}>
              <span>{tag}</span>
              <button
                type="button"
                aria-label={`Remove ${tag}`}
                disabled={disabled}
                onClick={() => onRemove(tag)}
                className="inline-flex h-5 w-5 items-center justify-center rounded-full text-xs hover:bg-white/20 disabled:cursor-not-allowed"
              >
                x
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <input
        id={inputId}
        name="custom-hobby"
        type="text"
        autoComplete="off"
        className="field-input"
        placeholder="Add your own hobby"
        value={draft}
        onChange={(event) => onDraftChange(event.target.value)}
        onKeyDown={onKeyDown}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${inputId}-error` : undefined}
      />
    </div>
  );
}
