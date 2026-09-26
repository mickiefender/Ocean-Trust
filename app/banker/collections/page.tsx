"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, CalendarDays, CheckCircle2, RefreshCw, Search, WalletCards } from "lucide-react";
import { recordBankerCollection } from "@/app/banker/portal-actions";
import type { CollectionPaymentMethod } from "@/app/admin/collection-data";
type Collection = {
  id: string; clientId: string; clientName: string; clientNumber: string; accountId: string; total: number;
  collected: number; remaining: number; dueDate: string; status: string; reference: string;
};

export default function BankerCollectionsPage() {
  const [items, setItems] = useState<Collection[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [recording, setRecording] = useState<Collection | null>(null);
  const refresh = () => {
    setLoading(true);
    setError("");
    void fetch("/api/banker/collections", { method: "GET", credentials: "include", cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as Collection[] | { error?: string };
        if (!response.ok) throw new Error("error" in payload && payload.error ? payload.error : "Unable to load collections.");
        setItems(payload as Collection[]);
      })
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false));
  };
  useEffect(refresh, []);
  const filtered = useMemo(() => items.filter((item) => {
    const matchesQuery = `${item.clientName} ${item.clientNumber} ${item.reference} ${item.status}`.toLowerCase().includes(query.toLowerCase());
    const isOverdue = item.status !== "paid" && item.dueDate && new Date(item.dueDate) < new Date();
    const matchesStatus = status === "all" || (status === "overdue" ? isOverdue : item.status === status);
    return matchesQuery && matchesStatus;
  }), [items, query, status]);
  const total = items.reduce((sum, item) => sum + item.total, 0);
  const collected = items.reduce((sum, item) => sum + item.collected, 0);
  const remaining = items.reduce((sum, item) => sum + item.remaining, 0);
  const overdue = items.filter((item) => item.status !== "paid" && item.dueDate && new Date(item.dueDate) < new Date()).length;
  return <main className="min-h-screen bg-[#f6f8fb] p-5 text-slate-900 sm:p-8"><div className="mx-auto max-w-7xl"><Link href="/banker" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-[#102a43]"><ArrowLeft size={16} />Dashboard</Link><div className="mt-6 flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-medium text-slate-500">Banker portal</p><h1 className="text-3xl font-bold text-[#102a43]">Collections</h1><p className="mt-1 text-sm text-slate-500">Track assigned schedules, due dates, and record client payments.</p></div><button onClick={refresh} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"><RefreshCw size={16} className={loading ? "animate-spin" : ""} />Refresh</button></div>{error && <p role="alert" className="mt-5 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}<div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Schedules" value={String(items.length)} icon={<CalendarDays size={19} />} /><Metric label="Total scheduled" value={money(total)} icon={<WalletCards size={19} />} /><Metric label="Collected" value={money(collected)} icon={<CheckCircle2 size={19} />} /><Metric label="Outstanding" value={money(remaining)} icon={<AlertTriangle size={19} />} tone="amber" /></div><div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div className="relative w-full lg:max-w-md"><Search size={16} className="absolute left-3 top-3 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search client, number, or reference..." className="w-full rounded-lg border border-slate-200 py-2.5 pl-9 pr-4 text-sm outline-none focus:border-blue-500" /></div><div className="flex items-center gap-3"><label className="text-xs font-semibold uppercase tracking-wide text-slate-400">Status<select value={status} onChange={(event) => setStatus(event.target.value)} className="ml-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium normal-case text-slate-700"><option value="all">All schedules</option><option value="pending">Pending</option><option value="overdue">Overdue</option><option value="partially_paid">Partially paid</option><option value="paid">Paid</option></select></label><span className="hidden rounded-full bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 sm:inline-flex">{overdue} overdue</span></div></div></div><div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm"><table className="w-full min-w-[950px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-400"><tr><th className="p-4">Client</th><th className="p-4">Reference</th><th className="p-4">Due date</th><th className="p-4">Scheduled</th><th className="p-4">Collected</th><th className="p-4">Remaining</th><th className="p-4">Status</th><th className="p-4">Action</th></tr></thead><tbody>{filtered.map((item) => { const isOverdue = item.status !== "paid" && item.dueDate && new Date(item.dueDate) < new Date(); const displayStatus = status === "overdue" && isOverdue ? "overdue" : item.status; return <tr key={item.id} className="border-t border-slate-100 hover:bg-slate-50"><td className="p-4"><Link href={`/banker/clients/${item.clientId}`} className="font-semibold text-blue-700 hover:underline">{item.clientName}</Link><p className="mt-1 text-xs text-slate-400">{item.clientNumber}</p></td><td className="p-4 text-slate-600">{item.reference || "—"}</td><td className="p-4 text-slate-600">{item.dueDate ? new Date(item.dueDate).toLocaleDateString() : "—"}{isOverdue && <span className="mt-1 block text-xs font-semibold text-rose-600">Overdue</span>}</td><td className="p-4 font-medium">{money(item.total)}</td><td className="p-4 font-medium text-emerald-700">{money(item.collected)}</td><td className="p-4 font-semibold text-amber-700">{money(item.remaining)}</td><td className="p-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${displayStatus === "paid" ? "bg-emerald-50 text-emerald-700" : isOverdue ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"}`}>{displayStatus.replaceAll("_", " ")}</span></td><td className="p-4">{item.remaining > 0 ? <button onClick={() => setRecording(item)} className="rounded-lg bg-[#102a43] px-3 py-2 text-xs font-semibold text-white hover:bg-blue-900">Record collection</button> : <span className="text-xs text-slate-400">Completed</span>}</td></tr>; })}{!filtered.length && <tr><td colSpan={8} className="p-12 text-center text-slate-400">{loading ? "Loading collections..." : "No collections found."}</td></tr>}</tbody></table></div>{recording && <CollectionModal item={recording} onClose={() => setRecording(null)} onSaved={() => { setRecording(null); refresh(); }} />}</div></main>;
}
function Metric({ label, value, icon, tone = "blue" }: { label: string; value: string; icon: React.ReactNode; tone?: "blue" | "amber" }) { return <section className={`rounded-2xl border bg-white p-5 shadow-sm ${tone === "amber" ? "border-amber-100" : "border-slate-200"}`}><div className={`flex h-9 w-9 items-center justify-center rounded-lg ${tone === "amber" ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-700"}`}>{icon}</div><p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 text-xl font-bold text-[#102a43]">{value}</p></section>; }
function money(value: number) { return `GH₵${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }

function CollectionModal({ item, onClose, onSaved }: { item: Collection; onClose: () => void; onSaved: () => void }) {
  const [amount, setAmount] = useState(String(item.remaining));
  const [method, setMethod] = useState<CollectionPaymentMethod>("cash");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0 || value > item.remaining) {
      setError("Enter an amount greater than zero and no more than the outstanding balance.");
      return;
    }
    if (!item.accountId) {
      setError("This schedule has no active account linked. Ask an administrator to correct it.");
      return;
    }
    setSaving(true); setError("");
    try {
      await recordBankerCollection({ collectionId: item.id, clientId: item.clientId, accountId: item.accountId, amount: value, method, description, idempotencyKey: crypto.randomUUID() });
      onSaved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to record collection.");
    } finally { setSaving(false); }
  };
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/40 p-4"><form onSubmit={submit} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"><div className="flex items-start justify-between"><div><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Record collection</p><h2 className="mt-1 text-xl font-bold text-[#102a43]">{item.clientName}</h2><p className="mt-1 text-sm text-slate-500">Outstanding: {money(item.remaining)}</p></div><button type="button" onClick={onClose} className="text-sm font-semibold text-slate-500">Close</button></div>{error && <p className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}<label className="mt-5 block text-sm font-semibold text-slate-700">Amount<input required type="number" min="0.01" max={item.remaining} step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 p-3 font-normal outline-none focus:border-blue-500" /></label><label className="mt-4 block text-sm font-semibold text-slate-700">Payment method<select value={method} onChange={(event) => setMethod(event.target.value as CollectionPaymentMethod)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-3 font-normal"><option value="cash">Cash</option><option value="mobile_money">Mobile money</option><option value="bank_transfer">Bank transfer</option><option value="card">Card</option><option value="direct_debit">Direct debit</option><option value="other">Other</option></select></label><label className="mt-4 block text-sm font-semibold text-slate-700">Note (optional)<textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-slate-200 p-3 font-normal outline-none focus:border-blue-500" /></label><div className="mt-6 flex justify-end gap-3"><button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600">Cancel</button><button disabled={saving} className="rounded-lg bg-[#102a43] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving..." : "Record collection"}</button></div></form></div>;
}
