"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Mode = "signin" | "signup";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    // Hardcoded auth: sam / page
    if (email === "sam" && password === "page") {
      // Set a simple auth cookie
      document.cookie = "auth=true; path=/; max-age=86400"; // 24h
      router.push("/app");
      router.refresh();
    } else {
      setError("Invalid credentials");
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[var(--bg)] text-[var(--text)] flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
        <div className="mb-6">
          <p className="text-xs font-mono uppercase tracking-[0.2em] text-[var(--text-muted)]">
            Linear Console v2
          </p>
          <h1 className="mt-2 text-2xl font-semibold">AI Assistant Access</h1>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            Sign in to continue into your personal command surface. Theme follows your dashboard choice.
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block text-sm">
            <span className="mb-1 block text-[var(--text-muted)]">Username</span>
            <input
              required
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-muted)] px-3 py-2 outline-none focus:border-[var(--accent)]"
              placeholder="sam"
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block text-[var(--text-muted)]">Password</span>
            <input
              required
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
            {loading ? "Working..." : "Sign in"}
          </button>
        </form>

        {error && <p className="mt-4 text-sm text-red-300">{error}</p>}
      </div>
    </main>
  );
}
