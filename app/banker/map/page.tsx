"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ChevronRight, MapPin, Navigation, Phone, Play, RefreshCw, Search, WalletCards } from "lucide-react";

const LeafletMap = dynamic(() => import("./LeafletMap"), { ssr: false });

type Customer = {
  id: string;
  name: string;
  phone: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  amountDue: number;
  status: "due_today" | "overdue" | "completed" | "upcoming";
  priority: boolean;
  dueDate: string;
  collectionId: string | null;
};
const labels: Record<Customer["status"], string> = { due_today: "Due today", overdue: "Overdue", completed: "Completed", upcoming: "Upcoming" };
const colors: Record<Customer["status"], string> = { due_today: "bg-amber-500", overdue: "bg-rose-500", completed: "bg-emerald-500", upcoming: "bg-blue-500" };

export default function BankerMapPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const refresh = () => {
    setLoading(true);
    setError("");
    void fetch("/api/banker/map", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Unable to load customer map.");
        return payload as Customer[];
      })
      .then(setCustomers)
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false));
  };
  useEffect(refresh, []);
  const filtered = useMemo(() => customers.filter((customer) => (filter === "all" || customer.status === filter) && `${customer.name} ${customer.address}`.toLowerCase().includes(query.toLowerCase())), [customers, filter, query]);
  return <main className="min-h-screen bg-[#f6f8fb] p-5 text-slate-900 sm:p-8"><div className="mx-auto max-w-7xl"><Link href="/banker" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500"><ArrowLeft size={16} />Dashboard</Link><div className="mt-6 flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-medium text-slate-500">Banker portal</p><h1 className="text-3xl font-bold text-[#102a43]">Customer map</h1><p className="mt-1 text-sm text-slate-500">Only customers assigned to your banker account are shown.</p></div><button onClick={refresh} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-600"><RefreshCw size={16} className={loading ? "animate-spin" : ""} />Refresh</button></div>{error && <p className="mt-5 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}<div className="mt-6 flex flex-wrap gap-2">{[["all", "All"], ["due_today", "Due today"], ["overdue", "Overdue"], ["completed", "Completed"], ["upcoming", "Upcoming"]].map(([value, label]) => <button key={value} onClick={() => setFilter(value)} className={`rounded-full px-3 py-2 text-xs font-semibold ${filter === value ? "bg-[#102a43] text-white" : "border border-slate-200 bg-white text-slate-600"}`}>{label}</button>)}</div><div className="mt-4 grid gap-5 xl:grid-cols-[1.4fr_0.8fr]"><section className="relative z-0 isolate overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><LeafletMap customers={filtered} selectedId={selected?.id ?? null} onSelect={(id) => setSelected(customers.find((customer) => customer.id === id) ?? null)} /><div className="absolute bottom-4 left-4 z-[500] flex flex-wrap gap-2 rounded-lg bg-white/90 p-2 text-[11px] font-semibold shadow-sm">{Object.entries(labels).map(([key, label]) => <span key={key} className="flex items-center gap-1"><i className={`h-2.5 w-2.5 rounded-full ${colors[key as Customer["status"]]}`} />{label}</span>)}</div><div className="absolute left-4 top-4 z-[500] rounded-lg bg-white/90 px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm"><MapPin size={14} className="mr-1 inline text-blue-700" />Assigned customer locations</div></section><section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="relative"><Search size={16} className="absolute left-3 top-3 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search customers..." className="w-full rounded-lg border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-500" /></div><div className="mt-4 space-y-2">{filtered.map((customer) => <button key={customer.id} onClick={() => setSelected(customer)} className={`w-full rounded-xl border p-3 text-left transition hover:border-blue-300 hover:bg-blue-50/40 ${selected?.id === customer.id ? "border-blue-400 bg-blue-50" : "border-slate-100"}`}><div className="flex items-center justify-between gap-2"><span className="font-semibold text-[#102a43]">{customer.name}</span><span className={`h-2.5 w-2.5 rounded-full ${colors[customer.status]}`} /></div><p className="mt-1 truncate text-xs text-slate-500">{customer.address || "No address recorded"}</p><p className="mt-2 text-xs font-semibold text-amber-700">{money(customer.amountDue)} due</p></button>)}{!filtered.length && <p className="py-8 text-center text-sm text-slate-400">No assigned customers found.</p>}</div></section></div>{selected && <CustomerPanel customer={selected} onClose={() => setSelected(null)} />}</div></main>;
}

function CustomerPanel({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const navigate = customer.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(customer.address)}` : "";
  return <div className="fixed inset-0 z-[2000] flex items-end justify-center bg-slate-950/30 p-4 sm:items-center"><section className="relative z-[2001] w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"><div className="flex items-start justify-between"><div><span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize text-white ${colors[customer.status]}`}>{labels[customer.status]}</span><h2 className="mt-3 text-xl font-bold text-[#102a43]">{customer.name}</h2><p className="mt-1 text-sm text-slate-500">{customer.address || "No address recorded"}</p></div><button onClick={onClose} className="text-sm font-semibold text-slate-500">Close</button></div><div className="mt-5 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-4 text-sm"><div><p className="text-xs text-slate-400">Phone</p><p className="mt-1 font-semibold">{customer.phone || "—"}</p></div><div><p className="text-xs text-slate-400">Amount due</p><p className="mt-1 font-bold text-amber-700">{money(customer.amountDue)}</p></div></div><div className="mt-5 grid gap-2 sm:grid-cols-2"><Link href={`/banker/clients/${customer.id}`} className="flex items-center justify-center gap-2 rounded-lg bg-[#102a43] px-3 py-2.5 text-sm font-semibold text-white"><ChevronRight size={16} />View customer</Link><a href={customer.phone ? `tel:${customer.phone}` : undefined} className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-700"><Phone size={16} />Call</a><a href={navigate || undefined} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-700"><Navigation size={16} />Navigate</a><Link href={`/banker/clients/${customer.id}?visit=1`} className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-700"><Play size={16} />Start visit</Link><Link href="/banker/collections" className="flex items-center justify-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm font-semibold text-amber-800 sm:col-span-2"><WalletCards size={16} />Record collection</Link></div></section></div>;
}

function money(value: number) { return `GH₵${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
