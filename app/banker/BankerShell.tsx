"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BarChart3, LayoutDashboard, LogOut, Map, MapPin, Menu, Plus, Users, WalletCards, X } from "lucide-react";
import { loadBankerDashboard } from "@/app/admin/banker-actions";
import { createClient } from "@/lib/supabase/client";
import { NotificationBell } from "@/app/notifications/NotificationBell";

const navItems = [
  { href: "/banker", label: "Dashboard", icon: LayoutDashboard },
  { href: "/banker/clients", label: "My clients", icon: Users },
  { href: "/banker/collections", label: "Collections", icon: WalletCards },
  { href: "/banker/visits", label: "Field visits", icon: MapPin },
  { href: "/banker/map", label: "Customer map", icon: Map },
  { href: "/banker/performance", label: "Performance", icon: BarChart3 },
];

export function BankerShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [banker, setBanker] = useState<{ name: string; branch: string; employeeNumber: string } | null>(null);

  useEffect(() => {
    if (pathname === "/banker" || pathname === "/banker/login") return;
    void loadBankerDashboard().then((data) => setBanker(data.banker)).catch(() => setBanker(null));
  }, [pathname]);

  if (pathname === "/banker" || pathname === "/banker/login") return children;

  const signOut = () => {
    void createClient("banker").auth.signOut().then(() => { window.location.href = "/banker/login"; });
  };

  return (
    <div className="min-h-screen bg-[#f6f8fb]">
      <aside className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-[#102a43] text-white shadow-xl transition-transform lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex h-20 items-center justify-between border-b border-white/10 px-6">
          <div>
            <p className="text-base font-bold tracking-wide">OCEAN TRUST</p>
            <p className="text-[10px] uppercase tracking-[0.2em] text-blue-200">Banker portal</p>
          </div>
          <button onClick={() => setOpen(false)} className="rounded-lg p-2 text-blue-200 hover:bg-white/10 lg:hidden" aria-label="Close navigation"><X size={19} /></button>
        </div>
        <nav className="px-4 py-6">
          <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-blue-200">Workspace</p>
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = href === "/banker" ? pathname === href : pathname.startsWith(href);
            return <Link key={href} href={href} onClick={() => setOpen(false)} className={`mb-1 flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-semibold ${active ? "bg-white/15 text-white" : "text-blue-100 hover:bg-white/10"}`}><Icon size={18} />{label}</Link>;
          })}
          <Link href="/banker" onClick={() => setOpen(false)} className="mt-4 flex items-center gap-3 rounded-lg bg-[#f2b84b] px-3 py-3 text-sm font-bold text-[#102a43]"><Plus size={18} />New application</Link>
        </nav>
        <div className="mt-auto border-t border-white/10 p-4">
          {banker && <div className="rounded-lg bg-white/10 p-3"><p className="truncate text-sm font-semibold">{banker.name}</p><p className="mt-1 truncate text-xs text-blue-200">{banker.branch} · {banker.employeeNumber}</p></div>}
          <button onClick={signOut} className="mt-3 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-blue-100 hover:bg-white/10"><LogOut size={17} />Log out</button>
        </div>
      </aside>
      {open && <button aria-label="Close navigation" onClick={() => setOpen(false)} className="fixed inset-0 z-40 bg-slate-950/40 lg:hidden" />}
      <div className="lg:pl-72">
        <header className="border-b border-slate-200 bg-white">
          <div className="flex items-center px-5 py-4 sm:px-8">
            <button onClick={() => setOpen(true)} className="mr-3 rounded-lg p-2 text-slate-500 hover:bg-slate-50 lg:hidden" aria-label="Open navigation"><Menu size={20} /></button>
            <div className="flex w-full items-center justify-between gap-4"><p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Ocean Trust · Banker portal</p><NotificationBell scope="banker" /></div>
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}
