"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
import AuthLayout from "@/app/components/auth-layout";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [searchParams, setSearchParams] = useState<URLSearchParams | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    setSearchParams(new URLSearchParams(window.location.search));
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const next = searchParams?.get("next");
    const bankerLogin = next?.startsWith("/banker") ?? false;
    const { error } = await createClient(bankerLogin ? "banker" : "default").auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    router.replace(bankerLogin ? "/banker" : next ? `/auth/redirect?next=${encodeURIComponent(next)}` : "/auth/redirect");
  }

  return (
    <AuthLayout
      eyebrow="Welcome back"
      title="Sign in to your account"
      description="Enter your credentials to securely access your Ocean Trust workspace."
    >
      <form onSubmit={submit} className="space-y-5">
        {searchParams?.get("error") && (
          <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-5 text-amber-900">
            {searchParams.get("error") === "role"
              ? "Your account has no assigned dashboard role. Ask an administrator to assign your role."
              : "Verification or account setup failed. Please try again."}
          </p>
        )}
        {error && (
          <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}
        <label htmlFor="email" className="block text-sm font-medium text-slate-700">
          Email address
          <span className="relative mt-2 block">
            <Mail size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              id="email"
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
        <label htmlFor="password" className="block text-sm font-medium text-slate-700">
          Password
          <span className="relative mt-2 block">
            <LockKeyhole size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              id="password"
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
