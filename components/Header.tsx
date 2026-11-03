"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

function isMissingSession(error: { message?: string; name?: string } | null) {
  if (!error) return false;
  return (
    error.name === "AuthSessionMissingError" ||
    /auth session missing/i.test(error.message ?? "")
  );
}

const configError =
  !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ? "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. Add them to .env.local."
    : null;

export function Header() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (configError) return;

    let active = true;
    const supabase = createClient();

    supabase.auth.getUser().then(({ data, error: userError }) => {
      if (!active) return;
      if (userError && !isMissingSession(userError)) setError(userError.message);
      setUser(data.user ?? null);
      setReady(true);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setReady(true);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  async function logout() {
    setPending(true);
    setError(null);

    try {
      const supabase = createClient();
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) {
        setError(signOutError.message);
        setPending(false);
        return;
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not log out.");
      setPending(false);
      return;
    }

    router.push("/login");
    router.refresh();
  }

  return (
    <header className="border-b border-line bg-card/80">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
        <Link href="/" className="font-serif text-xl text-foreground no-underline">
          Evidence Vault
        </Link>
        <nav aria-label="Account" className="flex items-center gap-2">
          <Link href="/dashboard" className="btn btn-ghost">
            Dashboard
          </Link>
          {ready && user ? (
            <>
              <Link href="/profile" className="btn btn-ghost">
                Profile
              </Link>
              {user.email ? (
                <span
                  className="hidden max-w-56 truncate text-sm text-muted sm:inline"
                  title={user.email}
                >
                  {user.email}
                </span>
              ) : null}
              <button
                type="button"
                className="btn btn-secondary"
                onClick={logout}
                disabled={pending}
              >
                {pending ? "Logging out…" : "Log out"}
              </button>
            </>
          ) : null}
          {ready && !user ? (
            <>
              <Link href="/login" className="btn btn-ghost">
                Log in
              </Link>
              <Link href="/signup" className="btn btn-primary">
                Sign up
              </Link>
            </>
          ) : null}
        </nav>
      </div>
      {configError || error ? (
        <p role="alert" className="mx-auto w-full max-w-6xl px-5 pb-3 text-sm text-danger sm:px-8">
          {configError || error}
        </p>
      ) : null}
    </header>
  );
}
