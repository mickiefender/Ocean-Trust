"use client";

import { useEffect, useMemo, useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { loadNotifications, markAllNotificationsRead, markNotificationRead } from "./actions";

type Notice = Awaited<ReturnType<typeof loadNotifications>>[number];

export function NotificationBell({ scope }: { scope: "admin" | "banker" }) {
  const [items, setItems] = useState<Notice[]>([]);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const refresh = () => void loadNotifications(scope).then(setItems).catch(() => setItems([]));
  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 60000);
    const sessionClient = () => createClient(scope === "banker" ? "banker" : "default");
    let channel: ReturnType<ReturnType<typeof createClient>["channel"]> | null = null;
    let active = true;
    void sessionClient().auth.getUser().then(({ data }) => {
      if (!active || !data.user) return;
      channel = sessionClient()
        .channel(`notifications:${scope}:${data.user.id}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `profile_id=eq.${data.user.id}` }, refresh)
        .subscribe();
    });
    return () => {
      active = false;
      window.clearInterval(timer);
      if (channel) void channel.unsubscribe();
    };
  }, [scope]);
  const unread = items.filter((item) => !item.read_at).length;
  const visible = useMemo(() => filter === "unread" ? items.filter((item) => !item.read_at) : items, [filter, items]);
  const markRead = async (id: string) => { await markNotificationRead(scope, id); refresh(); };
  const markAll = async () => { await markAllNotificationsRead(scope); refresh(); };
  return <div className="relative">
    <button onClick={() => setOpen((value) => !value)} className="relative rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}>
      <Bell size={18} />{unread > 0 && <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">{unread > 9 ? "9+" : unread}</span>}
    </button>
    {open && <div className="absolute right-0 z-[100] mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
      <div className="flex items-center justify-between border-b border-slate-100 p-3"><div><h2 className="text-sm font-bold text-[#102a43]">Notifications</h2><p className="text-xs text-slate-400">{unread} unread</p></div><button onClick={() => void markAll()} className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700"><CheckCheck size={14} />Mark all read</button></div>
      <div className="flex gap-2 border-b border-slate-100 p-2"><button onClick={() => setFilter("all")} className={`rounded px-2 py-1 text-xs font-semibold ${filter === "all" ? "bg-slate-100 text-slate-800" : "text-slate-500"}`}>All</button><button onClick={() => setFilter("unread")} className={`rounded px-2 py-1 text-xs font-semibold ${filter === "unread" ? "bg-slate-100 text-slate-800" : "text-slate-500"}`}>Unread</button></div>
      <div className="max-h-96 overflow-y-auto">{visible.map((item) => <button key={item.id} onClick={() => !item.read_at && void markRead(item.id)} className={`w-full border-b border-slate-100 p-3 text-left hover:bg-slate-50 ${item.read_at ? "" : "bg-blue-50/40"}`}><div className="flex items-start gap-2"><span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${item.type === "warning" ? "bg-amber-500" : item.type === "error" ? "bg-rose-500" : item.type === "success" ? "bg-emerald-500" : "bg-blue-500"}`} /><span><strong className="block text-xs text-slate-800">{item.title}</strong><span className="mt-1 block text-xs leading-5 text-slate-500">{item.message}</span><span className="mt-1 block text-[10px] text-slate-400">{new Date(item.created_at).toLocaleString()}</span></span></div></button>)}{!visible.length && <p className="p-6 text-center text-xs text-slate-400">No notifications.</p>}</div>
    </div>}
  </div>;
}
