import Image from "next/image";
import type { ReactNode } from "react";
import { ArrowUpRight, Check, ShieldCheck } from "lucide-react";

type AuthLayoutProps = {
  children: ReactNode;
  description: string;
  eyebrow: string;
  title: string;
};

export default function AuthLayout({
  children,
  description,
  eyebrow,
  title,
}: AuthLayoutProps) {
  return (
    <main className="grid min-h-screen bg-[#f4f7fa] lg:grid-cols-[1.05fr_0.95fr]">
      <aside className="relative hidden min-h-screen overflow-hidden bg-[#102a43] px-10 py-12 text-white lg:flex lg:flex-col lg:justify-between xl:px-16">
        <div className="absolute -right-40 -top-32 h-[30rem] w-[30rem] rounded-full border border-white/10" />
        <div className="absolute -bottom-48 -left-32 h-[34rem] w-[34rem] rounded-full border border-white/10" />
        <div className="relative max-w-xl py-16">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-blue-100">
            <ShieldCheck size={15} className="text-[#79d6e9]" />
            A secure place for your finances
          </div>
          <h2 className="max-w-lg text-4xl font-semibold leading-tight tracking-tight xl:text-5xl">
            Banking built on trust, clarity, and connection.
          </h2>
          <p className="mt-5 max-w-md text-base leading-7 text-blue-100/75">
            Sign in to access your Ocean Trust workspace and the tools you need
            to move forward with confidence.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-blue-50/90">
            {["Protected account access", "A clearer view of your finances", "Support when you need it"].map(
              (item) => (
                <li key={item} className="flex items-center gap-3">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-300">
                    <Check size={13} />
                  </span>
                  {item}
                </li>
              ),
            )}
          </ul>
        </div>

        <div className="relative flex items-center justify-between border-t border-white/10 pt-5 text-xs text-blue-100/60">
          <span className="flex items-center gap-1.5">
            Secure access <ArrowUpRight size={13} />
          </span>
        </div>
      </aside>

      <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-8">
            <Image
              src="/site_logo.png"
              alt="Ocean Trust"
              width={2000}
              height={2000}
              priority
              className="h-28 w-28 object-contain"
            />
          </div>
          <div className="mb-7">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#397895]">
              {eyebrow}
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#102a43]">
              {title}
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
          </div>
          <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_18px_50px_-28px_rgba(16,42,67,0.28)] sm:p-8">
            {children}
          </div>
          <p className="mt-6 flex items-center justify-center gap-2 text-xs text-slate-400">
            <ShieldCheck size={14} />
            Your information is protected and encrypted
          </p>
        </div>
      </section>
    </main>
  );
}
