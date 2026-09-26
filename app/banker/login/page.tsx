"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
import AuthLayout from "@/app/components/auth-layout";
import { createClient } from "@/lib/supabase/client";

export default function BankerLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setLoading(true); setError("");
    const result = await createClient("banker").auth.signInWithPassword({ email, password });
    if (result.error) { setError(result.error.message); setLoading(false); return; }
    window.location.href = "/banker";
  };
  return (
    <AuthLayout
      eyebrow="Banker portal"
      title="Welcome back"
      description="Sign in to manage your clients and stay on top of your work."
    >
      <form onSubmit={submit} className="space-y-5">
        {error && (
          <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}
        <label htmlFor="banker-email" className="block text-sm font-medium text-slate-700">
          Email address
          <span className="relative mt-2 block">
            <Mail size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              id="banker-email"
              className="h-12 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm text-[#102a43] outline-none transition placeholder:text-slate-400 focus:border-[#397895] focus:ring-4 focus:ring-[#397895]/10"
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </span>
        </label>
        <label htmlFor="banker-password" className="block text-sm font-medium text-slate-700">
          Password
          <span className="relative mt-2 block">
            <LockKeyhole size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              id="banker-password"
              className="h-12 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-12 text-sm text-[#102a43] outline-none transition placeholder:text-slate-400 focus:border-[#397895] focus:ring-4 focus:ring-[#397895]/10"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="Enter your password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <button
              type="button"
              aria-label={showPassword ? "Hide password" : "Show password"}
              onClick={() => setShowPassword((visible) => !visible)}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 transition hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#397895]"
            >
              {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </span>
        </label>
        <div className="flex justify-end">
          <Link href="/forgot-password" className="text-sm font-semibold text-[#286581] transition hover:text-[#102a43]">
            Forgot password?
          </Link>
        </div>
        <button
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#102a43] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#183e5f] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#397895] disabled:cursor-not-allowed disabled:opacity-60"
          disabled={loading}
        >
          {loading ? "Signing in…" : "Sign in"}
          {!loading && <ArrowRight size={17} />}
        </button>
      </form>
    </AuthLayout>
  );
}
