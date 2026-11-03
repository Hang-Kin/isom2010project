"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  displayName,
  fillGreeting,
  NEUTRAL_GREETING,
  selectGreetingPhrase,
  summaryLine,
} from "@/lib/greetings";
import { createClient } from "@/lib/supabase/client";

const STORAGE_KEY = "evidence-vault-greeting";

export function Greeting({ name: initialName }: { name: string | null }) {
  const [name, setName] = useState(initialName);
  const [template, setTemplate] = useState<string | null>(null);
  const [achievements, setAchievements] = useState<number | null>(null);
  const [evidenceFiles, setEvidenceFiles] = useState<number | null>(null);
  const [countsSettled, setCountsSettled] = useState(false);

  useEffect(() => {
    if (name) return;

    let active = true;

    async function loadName() {
      try {
        const supabase = createClient();
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (!active) return;

        if (userError || !userData.user) {
          setName("there");
          return;
        }

        const { data, error } = await supabase
          .from("profiles")
          .select("username")
          .eq("id", userData.user.id)
          .maybeSingle();

        if (!active) return;

        const username =
          !error && data && typeof data.username === "string" ? data.username : null;
        setName(displayName(username, userData.user.email));
      } catch {
        if (active) setName("there");
      }
    }

    void loadName();

    return () => {
      active = false;
    };
  }, [name]);

  useEffect(() => {
    if (!name) return;

    let active = true;
    // Wait until after the neutral greeting paints, then keep one phrase for this tab.
    const timeout = window.setTimeout(() => {
      if (!active) return;
      const next = selectGreetingPhrase(readStoredPhrase());
      try {
        sessionStorage.setItem(STORAGE_KEY, next);
      } catch {
        // Private browsing can block sessionStorage. The phrase still shows once.
      }
      setTemplate(next);
    }, 0);

    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [name]);

  useEffect(() => {
    let active = true;

    async function loadCounts() {
      try {
        const supabase = createClient();
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (!active) return;

        if (userError || !userData.user) {
          setCountsSettled(true);
          return;
        }

        const userId = userData.user.id;
        const [achievementResult, evidenceResult] = await Promise.all([
          supabase
            .from("achievements")
            .select("id", { count: "exact", head: true })
            .eq("user_id", userId),
          supabase
            .from("evidence_files")
            .select("id", { count: "exact", head: true })
            .eq("user_id", userId),
        ]);

        if (!active) return;

        if (!achievementResult.error) setAchievements(achievementResult.count ?? 0);
        if (!evidenceResult.error) setEvidenceFiles(evidenceResult.count ?? 0);
      } catch {
        // Keep the dashes. The summary line stays quiet when the counts cannot load.
      } finally {
        if (active) setCountsSettled(true);
      }
    }

    void loadCounts();

    return () => {
      active = false;
    };
  }, []);

  const greeting = name ? fillGreeting(template ?? NEUTRAL_GREETING, name) : null;

  return (
    <section className="card px-6 py-8 sm:px-10 sm:py-12" aria-labelledby="dashboard-greeting">
      <div className="max-w-3xl">
        {greeting ? (
          <h1
            id="dashboard-greeting"
            className="font-serif text-4xl leading-tight text-balance sm:text-5xl"
          >
            {greeting}
          </h1>
        ) : (
          <>
            <h1
              id="dashboard-greeting"
              className="font-serif text-4xl leading-tight text-muted sm:text-5xl"
            >
              Welcome back
            </h1>
            <p className="mt-3 text-sm text-muted">Loading your dashboard…</p>
          </>
        )}
        <p
          className="mt-4 text-base text-muted sm:text-lg"
          aria-live="polite"
          aria-busy={countsSettled ? undefined : true}
        >
          {summaryLine(achievements, evidenceFiles)}
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/dashboard/achievements" className="btn btn-primary">
            View achievements
          </Link>
          <Link href="/dashboard/export" className="btn btn-secondary">
            Export a packet
          </Link>
        </div>
      </div>
    </section>
  );
}

function readStoredPhrase(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}
