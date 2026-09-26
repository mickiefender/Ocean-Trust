"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, MapPin } from "lucide-react";
import { loadBankerClients, loadBankerVisits, recordBankerVisit } from "../portal-actions";

export default function BankerVisitsPage() {
  const [clients, setClients] = useState<Awaited<ReturnType<typeof loadBankerClients>>>([]);
  const [visits, setVisits] = useState<Awaited<ReturnType<typeof loadBankerVisits>>>([]);
  const [clientId, setClientId] = useState("");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const refresh = () => { void Promise.all([loadBankerClients(), loadBankerVisits()]).then(([nextClients, nextVisits]) => { setClients(nextClients); setVisits(nextVisits); setClientId((current) => current || nextClients[0]?.id || ""); }).catch((reason: Error) => setError(reason.message)); };
  useEffect(refresh, []);
  const save = async () => { if (!clientId) return; setError(""); try { await recordBankerVisit({ clientId, notes }); setNotes(""); setMessage("Visit recorded successfully."); refresh(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to record visit."); } };
  return <main className="min-h-screen bg-[#f6f8fb] p-5 sm:p-8"><div className="mx-auto max-w-5xl"><Link href="/banker" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500"><ArrowLeft size={16} />Dashboard</Link><h1 className="mt-6 text-3xl font-bold text-[#102a43]">Field visits</h1><div className="mt-6 grid gap-6 lg:grid-cols-[360px_1fr]"><section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-bold text-[#102a43]">Start a visit</h2><select value={clientId} onChange={(event) => setClientId(event.target.value)} className="mt-4 w-full rounded-lg border border-slate-200 p-3 text-sm">{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select><textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={4} placeholder="Visit notes..." className="mt-3 w-full rounded-lg border border-slate-200 p-3 text-sm" /><button onClick={() => void save()} className="mt-3 w-full rounded-lg bg-[#102a43] px-4 py-3 text-sm font-semibold text-white">Record visit</button>{message && <p className="mt-3 text-sm text-emerald-700">{message}</p>}{error && <p className="mt-3 text-sm text-rose-700">{error}</p>}</section><section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-bold text-[#102a43]">Visit history</h2><div className="mt-4 divide-y divide-slate-100">{visits.map((visit) => <div key={visit.id} className="flex gap-3 py-4"><MapPin size={18} className="mt-0.5 text-blue-700" /><div><Link href={`/banker/clients/${visit.clientId}`} className="font-semibold text-blue-700">{visit.clientName}</Link><p className="text-xs text-slate-500">{new Date(visit.visitedAt).toLocaleString()}</p><p className="mt-1 text-sm text-slate-600">{visit.notes || "Visit recorded"}</p></div></div>)}{!visits.length && <p className="py-8 text-sm text-slate-400">No visits recorded yet.</p>}</div></section></div></div></main>;
}
