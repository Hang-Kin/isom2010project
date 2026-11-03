"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Field, StatusMessage } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const isSignup = mode === "signup";

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const nextErrors: { email?: string; password?: string } = {};
    if (!email.trim()) nextErrors.email = "Email is required.";
    if (!password) nextErrors.password = "Password is required.";
    else if (password.length < 6) {
      nextErrors.password = "Password must be at least 6 characters.";
    }

    setFieldErrors(nextErrors);
    if (nextErrors.email || nextErrors.password) return;

    setPending(true);

    try {
      const supabase = createClient();

      if (isSignup) {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });

        if (error) {
          setFormError(error.message);
          setPending(false);
          return;
        }

        if (!data.session) {
          setFormError(
            "Account created, but email confirmation is still on. In Supabase, turn off Confirm email, then log in.",
          );
          setPending(false);
          return;
        }

        router.push("/profile");
        router.refresh();
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        setFormError(
          /invalid login credentials/i.test(error.message)
            ? "Email or password is incorrect."
            : error.message,
        );
        setPending(false);
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Something went wrong.");
      setPending(false);
    }
  }

  return (
    <div className="mx-auto max-w-md pt-6 sm:pt-10">
      <div className="card space-y-6">
        <div>
          <h1 className="font-serif text-4xl leading-tight">
            {isSignup ? "Sign up" : "Log in"}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            {isSignup
              ? "Create an account with your email and a password of at least 6 characters."
              : "Use the email and password for your Evidence Vault account."}
          </p>
        </div>

        <form className="space-y-4" onSubmit={onSubmit} noValidate>
          <Field label="Email" htmlFor="email" error={fieldErrors.email}>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              className="field-input"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              aria-invalid={fieldErrors.email ? true : undefined}
              aria-describedby={fieldErrors.email ? "email-error" : undefined}
            />
          </Field>
          <Field label="Password" htmlFor="password" error={fieldErrors.password}>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete={isSignup ? "new-password" : "current-password"}
              className="field-input"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              aria-invalid={fieldErrors.password ? true : undefined}
              aria-describedby={fieldErrors.password ? "password-error" : undefined}
            />
          </Field>

          {formError ? <StatusMessage tone="error">{formError}</StatusMessage> : null}

          <button type="submit" className="btn btn-primary w-full" disabled={pending}>
            {pending
              ? isSignup
                ? "Creating account…"
                : "Logging in…"
              : isSignup
                ? "Create account"
                : "Log in"}
          </button>
        </form>

        <p className="text-sm text-muted">
          {isSignup ? (
            <>
              Already have an account?{" "}
              <Link href="/login" className="font-semibold text-accent">
                Log in
              </Link>
            </>
          ) : (
            <>
              New here?{" "}
              <Link href="/signup" className="font-semibold text-accent">
                Sign up
              </Link>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
