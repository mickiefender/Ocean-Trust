"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Search, Users } from "lucide-react";
import { loadBankerClients } from "../portal-actions";

type Client = Awaited<ReturnType<typeof loadBankerClients>>[number];

export default function BankerClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  useEffect(() => {
    let isMounted = true;

    void loadBankerClients()
      .then((result) => {
        if (isMounted) setClients(result);
      })
      .catch((reason: unknown) => {
        if (isMounted) {
          setError(reason instanceof Error ? reason.message : "Unable to load clients.");
        }
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);
  const filtered = useMemo(() => clients.filter((client) => `${client.name} ${client.clientNumber} ${client.phone} ${client.email}`.toLowerCase().includes(query.toLowerCase())), [clients, query]);
  return <main className="min-h-screen bg-[#f6f8fb] p-5 text-slate-900 sm:p-8"><div className="mx-auto max-w-6xl"><Link href="/banker" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500"><ArrowLeft size={16} />Dashboard</Link><div className="mt-6 flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm text-slate-500">Banker portal</p><h1 className="text-3xl font-bold text-[#102a43]">My clients</h1><p className="mt-1 text-sm text-slate-500">{isLoading ? "Loading assigned clients…" : `${clients.length} assigned clients`}</p></div><div className="relative"><Search size={16} className="absolute left-3 top-3 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search clients..." className="rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-4 text-sm outline-none focus:border-blue-500" /></div></div>{error && <p role="alert" className="mt-5 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}<div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy={isLoading}>{isLoading ? <div className="col-span-full grid gap-4 sm:grid-cols-2 lg:grid-cols-3" role="status" aria-label="Loading clients">{Array.from({ length: 6 }, (_, index) => <div key={index} className="animate-pulse rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between"><div className="h-11 w-11 rounded-full bg-slate-100" /><div className="h-6 w-16 rounded-full bg-slate-100" /></div><div className="mt-4 h-4 w-2/3 rounded bg-slate-100" /><div className="mt-2 h-3 w-1/3 rounded bg-slate-100" /><div className="mt-5 h-4 w-1/2 rounded bg-slate-100" /><div className="mt-2 h-3 w-3/4 rounded bg-slate-100" /></div>)}</div> : filtered.map((client) => <Link key={client.id} href={`/banker/clients/${client.id}`} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200"><div className="flex items-start justify-between gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-50 font-bold text-blue-700"><Users size={19} /></div><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold capitalize text-emerald-700">{client.status}</span></div><h2 className="mt-4 font-bold text-[#102a43]">{client.name}</h2><p className="mt-1 text-xs text-slate-400">{client.clientNumber}</p><p className="mt-3 text-sm text-slate-600">{client.phone || client.email || "No contact details"}</p><p className="mt-1 truncate text-xs text-slate-400">{client.address || "No address recorded"}</p></Link>)}{!isLoading && !error && !filtered.length && <div className="col-span-full rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">No assigned clients found.</div>}</div></div></main>;
}
