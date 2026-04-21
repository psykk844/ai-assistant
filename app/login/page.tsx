"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Mode = "signin" | "signup";

export default function LoginPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    setError(null);

    const authCall =
      mode === "signin"
        ? supabase.auth.signInWithPassword({ email, password })
        : supabase.auth.signUp({ email, password });

    const { data, error: authError } = await authCall;

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    if (mode === "signup") {
      setMessage(
        data.session
          ? "Account created and signed in. Redirecting..."
          : "Account created. Check your inbox if email confirmation is enabled.",
      );
    }

    if (data.session || mode === "signin") {
      router.push("/app");
      router.refresh();
    }

    setLoading(false);
  }

  return (
    <main className="min-h-screen bg-[var(--bg)] text-[var(--text)] flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
        <div className="mb-6">
          <p className="text-xs font-mono uppercase tracking-[0.2em] text-[var(--text-muted)]">
            Linear Console
          </p>
          <h1 className="mt-2 text-2xl font-semibold">AI Assistant Access</h1>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            {mode === "signin"
              ? "Sign in to continue into your personal command surface."
              : "Create your account to start organizing notes, tasks, and links."}
          </p>
        </div>

        <div className="mb-4 inline-flex rounded-lg border border-[var(--border)] bg-[var(--bg-muted)] p-1 text-sm">
          <button
            type="button"
            onClick={() => setMode("signin")}
            className={`rounded-md px-3 py-1.5 transition ${
              mode === "signin" ? "bg-[var(--accent)] text-black" : "text-[var(--text-muted)]"
            }`}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => setMode("signup")}
            className={`rounded-md px-3 py-1.5 transition ${
              mode === "signup" ? "bg-[var(--accent)] text-black" : "text-[var(--text-muted)]"
            }`}
          >
            Sign up
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block text-sm">
            <span className="mb-1 block text-[var(--text-muted)]">Email</span>
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-muted)] px-3 py-2 outline-none focus:border-[var(--accent)]"
              placeholder="you@example.com"
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block text-[var(--text-muted)]">Password</span>
            <input
              required
              minLength={6}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-muted)] px-3 py-2 outline-none focus:border-[var(--accent)]"
              placeholder="••••••••"
            />
          </label>

          <button
            disabled={loading}
            type="submit"
            className="w-full rounded-lg bg-[var(--accent)] px-4 py-2 font-medium text-black transition hover:bg-[var(--accent-strong)] disabled:opacity-70"
          >
            {loading ? "Working..." : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        {error && <p className="mt-4 text-sm text-red-300">{error}</p>}
        {message && <p className="mt-4 text-sm text-emerald-300">{message}</p>}
      </div>
    </main>
  );
}
