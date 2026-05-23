"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginForm({ initialError }: { initialError?: string }) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(initialError ?? "");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || loading) return;

    setLoading(true);
    setError("");

    const supabase = createClient();

    try {
      const { data: exists, error: rpcError } = await supabase.rpc(
        "check_email_exists",
        { input_email: trimmed }
      );

      if (rpcError) {
        if (rpcError.message.toLowerCase().includes("rate limit")) {
          setError("Too many attempts. Please wait a few minutes and try again.");
          setLoading(false);
          return;
        }
        // Unknown RPC error — fail open and let OTP proceed
      } else if (exists === false) {
        setError(
          "We don't have an account for that email. Contact your administrator to be added."
        );
        setLoading(false);
        return;
      }
    } catch {
      // Fail open on unexpected errors
    }

    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });

    if (otpError) {
      setError(otpError.message);
      setLoading(false);
      return;
    }

    setSent(true);
    setLoading(false);
  }

  if (sent) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center px-6">
        <div className="w-full max-w-sm">
          <BrandMark />
          <div className="mt-10">
            <h1 className="font-serif text-3xl font-medium tracking-tight text-text leading-snug">
              <em>Check your email.</em>
            </h1>
            <p className="mt-4 text-sm text-text-2 leading-relaxed">
              We sent a magic link to{" "}
              <span className="font-mono text-xs text-text">{email}</span>.
              Click it to sign in — the link expires in 1 hour.
            </p>
            <button
              onClick={() => {
                setSent(false);
                setError("");
              }}
              className="mt-8 text-xs text-text-3 underline underline-offset-2 hover:text-text-2 transition-colors"
            >
              Use a different email
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <BrandMark />
        <div className="mt-10">
          <h1 className="font-serif text-3xl font-medium tracking-tight text-text leading-snug">
            Sign in to Wildwood.
          </h1>
          <p className="mt-2 text-sm text-text-2">
            Enter your email and we&apos;ll send a magic link.
          </p>
          <form onSubmit={handleSubmit} className="mt-8">
            <label
              htmlFor="email"
              className="block text-[11px] font-semibold uppercase tracking-widest text-text-2 mb-3"
            >
              Email address
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@school.org"
              required
              autoFocus
              className="w-full bg-transparent border-b-2 border-border-strong py-2 text-text text-sm placeholder:text-text-3 focus:outline-none focus:border-green transition-colors"
            />
            {error && (
              <p className="mt-3 text-xs text-terra leading-relaxed">{error}</p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="mt-6 w-full bg-green text-white text-sm font-medium py-2.5 rounded-md hover:bg-green-deep disabled:opacity-60 transition-colors cursor-pointer"
            >
              {loading ? "Sending…" : "Send magic link"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function BrandMark() {
  return (
    <div className="flex items-center gap-3">
      <div className="w-8 h-8 bg-green rounded-lg flex items-center justify-center">
        <svg
          viewBox="0 0 24 24"
          fill="currentColor"
          className="w-[18px] h-[18px] text-white"
        >
          <path
            d="M12 2C12 2 7 6 7 12c0 4 2.5 7 5 7s5-3 5-7c0-6-5-10-5-10z"
            opacity="0.4"
          />
          <path
            d="M12 2v20M12 8c0 0-3 1-3 4M12 8c0 0 3 1 3 4M12 14c0 0-2 1-2 3M12 14c0 0 2 1 2 3"
            stroke="currentColor"
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <div>
        <div className="font-serif text-[18px] font-medium leading-tight text-text tracking-[-0.01em]">
          Wildwood
        </div>
        <div className="font-serif text-[11px] italic text-text-3 mt-0.5">
          Waitlist & enrollment
        </div>
      </div>
    </div>
  );
}
