"use client";

import { createElement, useEffect, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { formatLayeredError } from "@/lib/supabase/errors";
import { createClient } from "@/lib/supabase/client";

const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type StoredDraft<T> = {
  savedAt: number;
  values: T;
};

export function formDraftStorageKey(userId: string, key: string): string {
  return `evidence-vault:draft:${userId}:${key}`;
}

export function isBlankDraft(value: unknown): boolean {
  if (Array.isArray(value)) return value.every(isBlankDraft);
  if (value && typeof value === "object") return Object.values(value).every(isBlankDraft);
  return value === "" || value === null || value === undefined || value === false;
}

export function readFormDraft<T>(storageKey: string, now = Date.now()): StoredDraft<T> | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredDraft<T>>;
    if (
      !parsed ||
      typeof parsed.savedAt !== "number" ||
      !parsed.values ||
      typeof parsed.values !== "object"
    ) {
      return null;
    }
    if (now - parsed.savedAt > DRAFT_TTL_MS) {
      localStorage.removeItem(storageKey);
      return null;
    }
    return { savedAt: parsed.savedAt, values: parsed.values as T };
  } catch {
    return null;
  }
}

export function saveFormDraft<T>(storageKey: string, values: T, now = Date.now()): void {
  if (isBlankDraft(values)) {
    localStorage.removeItem(storageKey);
    return;
  }
  const payload: StoredDraft<T> = { savedAt: now, values };
  localStorage.setItem(storageKey, JSON.stringify(payload));
}

export function isNewAchievementRequest(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  ok: boolean,
): boolean {
  if (!ok) return false;
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  if (method !== "POST") return false;
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  return /\/rest\/v1\/achievements(?:\?|$)/.test(url);
}

export function useFormDraft<T>(
  key: string | null,
  values: T,
  setValues: Dispatch<SetStateAction<T>>,
): ReactNode {
  const [prompt, setPrompt] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "saving" | "saved">("idle");
  const [hydrated, setHydrated] = useState(false);
  const [storageKey, setStorageKey] = useState<string | null>(null);
  const [allowSave, setAllowSave] = useState(false);
  const valuesRef = useRef(values);
  const allowSaveRef = useRef(false);

  useEffect(() => {
    valuesRef.current = values;
  }, [values]);

  useEffect(() => {
    allowSaveRef.current = allowSave;
  }, [allowSave]);

  useEffect(() => {
    if (!key) return;
    const draftKey = key;
    let active = true;

    async function load() {
      try {
        const supabase = createClient();
        const { data, error: userError } = await supabase.auth.getUser();
        if (!active) return;
        if (userError || !data.user) {
          setError(
            formatLayeredError(
              "Could not read the saved draft",
              userError ?? { message: "Unauthorized", status: 401 },
            ),
          );
          return;
        }
        const nextKey = formDraftStorageKey(data.user.id, draftKey);
        setStorageKey(nextKey);
        const stored = readFormDraft<T>(nextKey);
        if (stored && isBlankDraft(valuesRef.current)) {
          setPrompt(stored.values);
          setAllowSave(false);
        } else {
          setAllowSave(true);
        }
        setError(null);
      } catch (cause) {
        if (!active) return;
        setError(formatLayeredError("Could not read the saved draft", cause));
      } finally {
        if (active) setHydrated(true);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [key]);

  useEffect(() => {
    if (!key || !hydrated || !allowSave || prompt || !storageKey) return;

    let writeTimer: number | null = null;
    const timer = window.setTimeout(() => {
      if (isBlankDraft(values)) {
        try {
          localStorage.removeItem(storageKey);
          setPhase("idle");
        } catch (cause) {
          setError(formatLayeredError("Could not save this draft", cause));
        }
        return;
      }
      setPhase("saving");
      setNotice(null);
      writeTimer = window.setTimeout(() => {
        if (!allowSaveRef.current) return;
        try {
          saveFormDraft(storageKey, values);
          setPhase("saved");
          setNotice("Draft saved on this device.");
          setError(null);
        } catch (cause) {
          setPhase("idle");
          setError(formatLayeredError("Could not save this draft", cause));
        }
      }, 200);
    }, 500);

    return () => {
      window.clearTimeout(timer);
      if (writeTimer !== null) window.clearTimeout(writeTimer);
    };
  }, [allowSave, hydrated, key, prompt, storageKey, values]);

  useEffect(() => {
    if (!key || typeof window === "undefined") return;
    const original = window.fetch.bind(window);
    const keyToClear = storageKey;
    window.fetch = async (input, init) => {
      const response = await original(input, init);
      try {
        if (!isNewAchievementRequest(input, init, response.ok)) return response;
        allowSaveRef.current = false;
        setAllowSave(false);
        if (keyToClear) localStorage.removeItem(keyToClear);
        setPrompt(null);
        setPhase("idle");
        setNotice(null);
      } catch {
        // Clearing a draft must not hide a successful save.
      }
      return response;
    };
    return () => {
      window.fetch = original;
    };
  }, [key, storageKey]);

  function restore() {
    if (!prompt) return;
    setValues(prompt);
    setPrompt(null);
    setAllowSave(true);
    setPhase("saved");
    setNotice("Draft restored.");
    setError(null);
  }

  function discard() {
    try {
      if (storageKey) localStorage.removeItem(storageKey);
      setPrompt(null);
      setAllowSave(true);
      setPhase("idle");
      setNotice(null);
      setError(null);
    } catch (cause) {
      setError(formatLayeredError("Could not discard this draft", cause));
    }
  }

  if (!key) return null;
  if (!hydrated && !error && !prompt) {
    return createElement("p", { className: "text-sm text-muted" }, "Checking for a saved draft…");
  }
  if (!prompt && !error && !notice && phase === "idle") return null;

  return createElement(
    "div",
    { className: "card space-y-3", role: "status", "aria-live": "polite", "data-feat12": "form-draft" },
    prompt
      ? createElement(
          "div",
          { className: "space-y-3" },
          createElement("p", null, "Restore your unsaved draft?"),
          createElement(
            "div",
            { className: "flex flex-wrap gap-2" },
            createElement(
              "button",
              { type: "button", className: "btn btn-primary", onClick: restore },
              "Restore",
            ),
            createElement(
              "button",
              { type: "button", className: "btn btn-secondary", onClick: discard },
              "Discard",
            ),
          ),
        )
      : null,
    phase === "saving"
      ? createElement("p", { className: "text-sm text-muted" }, "Saving draft…")
      : null,
    notice ? createElement("p", { className: "text-sm text-muted" }, notice) : null,
    error ? createElement("p", { className: "text-sm text-danger", role: "alert" }, error) : null,
  );
}
