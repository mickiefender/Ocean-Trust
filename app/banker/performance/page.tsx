import Link from "next/link";
import { ArrowLeft, Banknote, CalendarCheck, CheckCircle2, WalletCards } from "lucide-react";
import { loadBankerPerformance } from "@/app/banker/portal-actions";
import PerformanceChart from "./PerformanceChart";

export default async function BankerPerformancePage() {
  const data = await loadBankerPerformance();
  return (
    <main className="min-h-screen bg-[#f6f8fb] p-5 text-slate-900 sm:p-8">
      <div className="mx-auto max-w-7xl">
        <Link href="/banker" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-[#102a43]"><ArrowLeft size={16} />Dashboard</Link>
        <div className="mt-6"><p className="text-sm font-medium text-slate-500">Banker portal</p><h1 className="text-3xl font-bold text-[#102a43]">Performance</h1><p className="mt-1 text-sm text-slate-500">Read-only performance calculated from your assigned collections and field activity.</p></div>
        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><h2 className="text-lg font-bold text-[#102a43]">Collections against target</h2><p className="mt-1 text-sm text-slate-500">Actual collections compared with configured targets.</p></div><Banknote className="text-blue-600" /></div><div className="mt-4"><PerformanceChart data={data.chart} /></div></section>
        <div className="mt-6 grid gap-5 xl:grid-cols-3"><PeriodCard title="Daily" metrics={[["Target", money(data.daily.target)], ["Actual collections", money(data.daily.collected)], ["Achievement", percent(data.daily.achievement)], ["Customers visited", String(data.daily.visits)], ["Collections", String(data.daily.collections)], ["Outstanding amount", money(data.daily.outstanding)]]} /><PeriodCard title="Weekly" metrics={[["Total collected", money(data.weekly.collected)], ["Target", money(data.weekly.target)], ["Achievement", percent(data.weekly.achievement)], ["Customer visits", String(data.weekly.visits)], ["Collection rate", percent(data.weekly.collectionRate)]]} /><PeriodCard title="Monthly" metrics={[["Total collected", money(data.monthly.collected)], ["Target", money(data.monthly.target)], ["Achievement", percent(data.monthly.achievement)], ["New clients", String(data.monthly.newClients)], ["Active clients", String(data.monthly.activeClients)], ["Outstanding collections", money(data.monthly.outstanding)], ["Commission", money(data.monthly.commission)]]} /></div>
        <p className="mt-5 text-xs text-slate-400">Performance data is maintained by Ocean Trust administrators and cannot be edited from the banker portal.</p>
      </div>
    </main>
  );
}

function PeriodCard({ title, metrics }: { title: string; metrics: [string, string][] }) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-bold text-[#102a43]">{title}</h2><div className="mt-4 divide-y divide-slate-100">{metrics.map(([label, value], index) => <div key={label} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"><span className="flex items-center gap-2 text-sm text-slate-500">{index === 0 ? <CalendarCheck size={15} /> : index === metrics.length - 1 ? <WalletCards size={15} /> : <CheckCircle2 size={15} />}{label}</span><strong className="text-sm text-[#102a43]">{value}</strong></div>)}</div></section>;
}

function money(value: number) { return `GH₵${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function percent(value: number) { return `${value.toFixed(1)}%`; }
