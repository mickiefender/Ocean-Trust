"use client";

import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

const CONTROL_CLASS =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#1d6fa5] focus:ring-2 focus:ring-blue-100";

const INVALID_CLASS = "border-rose-300 focus:border-rose-400 focus:ring-rose-100";

function controlClass(invalid?: boolean, extra?: string): string {
  return [CONTROL_CLASS, invalid ? INVALID_CLASS : "", extra ?? ""].filter(Boolean).join(" ");
}

export function SectionCard({
  index,
  title,
  description,
  action,
  children,
}: {
  index: number;
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-[#eef4fa] px-4 py-3 sm:px-5">
        <div className="flex items-center gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#102a43] text-xs font-bold text-white">
            {index}
          </span>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-[.14em] text-[#102a43] sm:text-sm">
              {title}
            </h3>
            {description ? <p className="mt-0.5 text-xs text-slate-500">{description}</p> : null}
          </div>
        </div>
        {action}
      </header>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

export function Field({
  label,
  htmlFor,
  error,
  hint,
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="block text-xs font-semibold text-slate-600">
        {label}
      </label>
      <div className="mt-1.5">{children}</div>
      {error ? (
        <p className="mt-1 text-[11px] font-medium text-rose-600">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-[11px] text-slate-400">{hint}</p>
      ) : null}
    </div>
  );
}

export function TextInput({
  invalid,
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return <input {...rest} className={controlClass(invalid, className)} />;
}

export function TextArea({
  invalid,
  className,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return <textarea {...rest} className={controlClass(invalid, className)} />;
}

export function SelectInput({
  invalid,
  className,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean; children: ReactNode }) {
  return (
    <select {...rest} className={controlClass(invalid, className)}>
      {children}
    </select>
  );
}

export function CheckOption({
  name,
  value,
  label,
  checked,
  type = "checkbox",
  onChange,
}: {
  name: string;
  value: string;
  label: string;
  checked: boolean;
  type?: "checkbox" | "radio";
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      className={`inline-flex cursor-pointer select-none items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition ${
        checked
          ? "border-[#1d6fa5] bg-blue-50 text-[#102a43]"
          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
      }`}
    >
      <input
        type={type}
        name={name}
        value={value}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-3.5 w-3.5 accent-[#1d6fa5]"
      />
      {label}
    </label>
  );
}

export function CheckOptionGroup({
  legend,
  hint,
  error,
  className,
  children,
}: {
  legend: string;
  hint?: string;
  error?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <fieldset className={className}>
      <legend className="text-xs font-semibold text-slate-600">{legend}</legend>
      <div className="mt-1.5 flex flex-wrap gap-2">{children}</div>
      {error ? (
        <p className="mt-1 text-[11px] font-medium text-rose-600">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-[11px] text-slate-400">{hint}</p>
      ) : null}
    </fieldset>
  );
}

export function CurrencyInput({
  symbol,
  invalid,
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { symbol: string; invalid?: boolean }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">
        {symbol}
      </span>
      <input
        {...rest}
        className={controlClass(invalid, `pl-11 ${className ?? ""}`)}
        inputMode="decimal"
      />
    </div>
  );
}

export function PercentInput({
  invalid,
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return (
    <div className="relative">
      <input
        {...rest}
        className={controlClass(invalid, `pr-9 ${className ?? ""}`)}
        inputMode="decimal"
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">
        %
      </span>
    </div>
  );
}

export function FormError({ message }: { message: string }) {
  if (!message) return null;
  return (
    <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm font-medium text-rose-700">
      {message}
    </p>
  );
}
