"use client";

import {
  Building2,
  Check,
  ChevronLeft,
  CircleDollarSign,
  Clock3,
  CreditCard,
  FileText,
  History,
  LayoutDashboard,
  MessageSquare,
  MessageSquareText,
  Pencil,
  Plus,
  Search,
  Send,
  Menu,
  ShieldCheck,
  ToggleLeft,
  ToggleRight,
  Trash2,
  UserCog,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { loadAdminClients } from "@/app/admin/client-data";
import { sendClientSms } from "@/app/admin/actions";
import {
  deleteSmsTemplate,
  loadSmsTemplates,
  saveSmsTemplate,
  setSmsTemplateActive,
  type SmsTemplate,
  type SmsTemplateCategory,
} from "../sms-template-actions";

type SmsClient = Awaited<ReturnType<typeof loadAdminClients>>[number];

const categoryLabels: Record<SmsTemplateCategory, string> = {
  new_application: "New application",
  pending_application: "Pending application",
  approved_application: "Approved application",
  payment_reminder: "Payment reminder",
  successful_loan_payment: "Successful loan payment",
  custom: "Custom",
};

const variables = [
  ["{{client_name}}", "Client's name"],
  ["{{application_id}}", "Application number"],
  ["{{branch_name}}", "Branch name"],
  ["{{amount}}", "Payment amount"],
  ["{{due_date}}", "Payment due date"],
  ["{{balance}}", "Remaining loan balance"],
];

type Draft = {
  id?: string;
  name: string;
  category: SmsTemplateCategory;
  message: string;
  is_active: boolean;
};

const emptyDraft: Draft = {
  name: "",
  category: "custom",
  message: "",
  is_active: true,
};

const adminNavigation = [
  { label: "Overview", section: "Overview", icon: LayoutDashboard },
  { label: "Applications", section: "Applications", icon: Users },
  { label: "Collections", section: "Collections", icon: CircleDollarSign },
  { label: "Transactions", section: "Transactions", icon: History },
  { label: "Loans", section: "Loans", icon: CreditCard },
  { label: "Bankers", section: "Bankers", icon: UserCog },
  { label: "Company", section: "Company", icon: Building2 },
  { label: "Branches", section: "Branches", icon: Building2 },
  { label: "Users", section: "Users", icon: Users },
  { label: "Roles & permissions", section: "Roles & permissions", icon: ShieldCheck },
];

export default function SmsTemplatesClient() {
  const [templates, setTemplates] = useState<SmsTemplate[]>([]);
  const [clients, setClients] = useState<SmsClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [sendingTemplate, setSendingTemplate] = useState<SmsTemplate | null>(null);
  const [recipientQuery, setRecipientQuery] = useState("");
  const [recipientId, setRecipientId] = useState("");
  const [sendMessage, setSendMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [pendingTemplateId, setPendingTemplateId] = useState("");

  const refreshTemplates = useCallback(async () => {
    const rows = await loadSmsTemplates();
    setTemplates(rows);
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.all([loadSmsTemplates(), loadAdminClients()])
      .then(([templateRows, clientRows]) => {
        if (!active) return;
        setTemplates(templateRows);
        setClients(clientRows);
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(reason instanceof Error ? reason.message : "Unable to load SMS templates.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const filteredTemplates = useMemo(
    () =>
      templates.filter((template) => {
        const matchesSearch = `${template.name} ${template.message} ${categoryLabels[template.category]}`
          .toLowerCase()
          .includes(search.trim().toLowerCase());
        return matchesSearch && (categoryFilter === "all" || template.category === categoryFilter);
      }),
    [categoryFilter, search, templates],
  );

  const eligibleClients = useMemo(
    () =>
      clients
        .filter((client) => client.status === "Active" && client.phone && client.phone !== "—")
        .filter((client) =>
          `${client.name} ${client.phone} ${client.id} ${client.branch}`
            .toLowerCase()
            .includes(recipientQuery.trim().toLowerCase()),
        )
        .sort((a, b) => a.name.localeCompare(b.name)),
    [clients, recipientQuery],
  );
  const selectedRecipient = clients.find((client) => client.id === recipientId);

  const showNotice = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 3500);
  };

  const openSendDialog = (template: SmsTemplate) => {
    setSendingTemplate(template);
    setRecipientQuery("");
    setRecipientId("");
    setSendMessage(template.message);
    setError("");
  };

  const renderMessage = (message: string, client?: SmsClient) => {
    const values: Record<string, string> = {
      client_name: client?.name ?? "Client name",
      application_id: client?.applicationId ?? "Application number",
      branch_name: client?.branch ?? "Branch name",
      amount: "payment amount",
      due_date: "due date",
      balance: "remaining balance",
    };
    return message.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (match, key: string) => values[key] ?? match);
  };

  const saveDraft = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft) return;
    setSaving(true);
    setError("");
    try {
      await saveSmsTemplate(draft);
      await refreshTemplates();
      setDraft(null);
      showNotice(draft.id ? "Template updated." : "Template created.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save template.");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (template: SmsTemplate) => {
    setPendingTemplateId(template.id);
    setError("");
    try {
      await setSmsTemplateActive(template.id, !template.is_active);
      await refreshTemplates();
      showNotice(template.is_active ? "Template deactivated." : "Template activated.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to update template.");
    } finally {
      setPendingTemplateId("");
    }
  };

  const removeTemplate = async (template: SmsTemplate) => {
    if (!window.confirm(`Delete “${template.name}”? This cannot be undone.`)) return;
    setPendingTemplateId(template.id);
    setError("");
    try {
      await deleteSmsTemplate(template.id);
      await refreshTemplates();
      showNotice("Template deleted.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to delete template.");
    } finally {
      setPendingTemplateId("");
    }
  };

  const submitSms = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!sendingTemplate || !selectedRecipient) return;
    setSending(true);
    setError("");
    try {
      await sendClientSms(selectedRecipient.id, renderMessage(sendMessage, selectedRecipient));
      setSendingTemplate(null);
      showNotice(`SMS sent to ${selectedRecipient.name}.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to send the SMS.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f6f8fb] text-slate-900">
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-[#102a43] text-white transition-transform lg:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <Link href="/admin" onClick={() => setSidebarOpen(false)} className="flex h-20 items-center gap-3 border-b border-white/10 px-6">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white">
            <Image src="/site_logo.png" alt="" width={2000} height={2000} className="h-full w-full object-contain" priority />
          </span>
          <span><span className="block text-base font-bold tracking-wide">OCEAN TRUST</span><span className="block text-[10px] uppercase tracking-[.2em] text-blue-200">Financial services</span></span>
        </Link>
        <nav className="px-4 py-6">
          <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[.18em] text-blue-200">Workspace</p>
          {adminNavigation.map(({ label, section, icon: Icon }) => (
            <Link
              key={section}
              href={`/admin?section=${encodeURIComponent(section)}`}
              onClick={() => setSidebarOpen(false)}
              className="mb-1 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-blue-100 transition hover:bg-white/10"
            >
              <Icon size={18} strokeWidth={1.8} />{label}
            </Link>
          ))}
          <p className="mb-3 mt-7 px-3 text-[10px] font-bold uppercase tracking-[.18em] text-blue-200">Communications</p>
          <Link href="/admin/sms-templates" onClick={() => setSidebarOpen(false)} aria-current="page" className="mb-1 flex items-center gap-3 rounded-lg bg-white/15 px-3 py-2.5 text-sm font-medium text-white"><MessageSquare size={18} strokeWidth={1.8} />SMS templates</Link>
        </nav>
        <div className="mt-auto border-t border-white/10 p-4">
          <Link href="/admin" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-blue-100 hover:bg-white/10"><LayoutDashboard size={18} />Back to dashboard</Link>
          <div className="mt-4 flex items-center gap-3 rounded-lg bg-white/10 p-3"><div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#d8e9f5] text-xs font-bold text-[#1d4e6d]">AD</div><div><div className="text-xs font-semibold">Company admin</div><div className="text-[11px] text-blue-200">Ocean Trust</div></div></div>
        </div>
      </aside>
      {sidebarOpen && <button className="fixed inset-0 z-30 bg-slate-900/30 lg:hidden" onClick={() => setSidebarOpen(false)} aria-label="Close menu" />}
      <main className="min-h-screen p-5 text-slate-900 lg:pl-64 sm:p-8">
      <div className="mx-auto max-w-6xl">
        <button onClick={() => setSidebarOpen(true)} aria-label="Open navigation" className="mb-4 rounded-lg border border-slate-200 bg-white p-2 text-slate-600 shadow-sm lg:hidden"><Menu size={19} /></button>
        <Link href="/admin" className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-[#102a43]">
          <ChevronLeft size={17} /> Admin dashboard
        </Link>
        <div className="mt-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-medium text-slate-500">Communications</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-[#102a43]">SMS templates</h1>
            <p className="mt-2 max-w-xl text-sm text-slate-500">
              Create reusable messages, personalize them with client details, and send them directly to clients.
            </p>
          </div>
          <button onClick={() => { setError(""); setDraft({ ...emptyDraft }); }} className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#102a43] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#183e5f]">
            <Plus size={17} /> Create template
          </button>
        </div>

        <section className="mt-7 grid gap-4 sm:grid-cols-3">
          <SummaryCard icon={<MessageSquare size={18} />} label="Total templates" value={String(templates.length)} />
          <SummaryCard icon={<Check size={18} />} label="Active templates" value={String(templates.filter((template) => template.is_active).length)} />
          <SummaryCard icon={<Clock3 size={18} />} label="Categories" value={String(new Set(templates.map((template) => template.category)).size)} />
        </section>

        {notice && <p role="status" className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">{notice}</p>}
        {error && !draft && !sendingTemplate && <p role="alert" className="mt-5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}

        <section className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row">
            <label className="relative flex-1">
              <span className="sr-only">Search SMS templates</span>
              <Search size={16} className="absolute left-3 top-3 text-slate-400" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search templates..." className="w-full rounded-lg border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-500" />
            </label>
            <select aria-label="Filter templates by category" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-600 outline-none focus:border-blue-500">
              <option value="all">All categories</option>
              {Object.entries(categoryLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </div>
          {loading ? (
            <div className="grid gap-4 p-5 md:grid-cols-2" role="status" aria-label="Loading templates">
              {[0, 1, 2, 3].map((item) => <div key={item} className="animate-pulse rounded-xl border border-slate-200 p-5"><div className="h-4 w-1/2 rounded bg-slate-100" /><div className="mt-4 h-20 rounded bg-slate-100" /><div className="mt-4 h-8 rounded bg-slate-100" /></div>)}
            </div>
          ) : error && templates.length === 0 ? (
            <div className="p-6"><p role="alert" className="text-sm text-rose-700">{error}</p><button onClick={() => { setLoading(true); setError(""); void refreshTemplates().catch((reason: Error) => setError(reason.message)).finally(() => setLoading(false)); }} className="mt-3 text-sm font-semibold text-blue-700">Try again</button></div>
          ) : filteredTemplates.length ? (
            <div className="grid gap-4 p-4 md:grid-cols-2">
              {filteredTemplates.map((template) => (
                <article key={template.id} className="flex min-w-0 flex-col rounded-xl border border-slate-200 p-5 transition hover:border-blue-200 hover:shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate font-bold text-[#102a43]">{template.name}</h2>
                        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700">{categoryLabels[template.category]}</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-400">Updated {new Date(template.updated_at).toLocaleDateString()}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${template.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                      {template.is_active ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <p className="mt-4 min-h-20 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm leading-6 text-slate-600">{template.message}</p>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4">
                    <button disabled={!template.is_active} onClick={() => openSendDialog(template)} className="inline-flex items-center gap-2 rounded-lg bg-[#102a43] px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">
                      <Send size={14} /> Send to client
                    </button>
                    <div className="flex items-center gap-1">
                      <button title="Edit template" onClick={() => { setError(""); setDraft({ id: template.id, name: template.name, category: template.category, message: template.message, is_active: template.is_active }); }} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><Pencil size={15} /></button>
                      <button title={template.is_active ? "Deactivate template" : "Activate template"} disabled={pendingTemplateId === template.id} onClick={() => void toggleActive(template)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">{template.is_active ? <ToggleRight size={17} /> : <ToggleLeft size={17} />}</button>
                      <button title="Delete template" disabled={pendingTemplateId === template.id} onClick={() => void removeTemplate(template)} className="rounded-lg p-2 text-rose-600 hover:bg-rose-50"><Trash2 size={15} /></button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="p-12 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500"><FileText size={21} /></div>
              <h2 className="mt-4 font-semibold text-slate-800">{templates.length ? "No matching templates" : "No SMS templates yet"}</h2>
              <p className="mt-1 text-sm text-slate-500">{templates.length ? "Try a different search or category." : "Create a reusable SMS template to get started."}</p>
              {!templates.length && <button onClick={() => setDraft({ ...emptyDraft })} className="mt-4 text-sm font-semibold text-blue-700">Create your first template</button>}
            </div>
          )}
        </section>
        <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50 p-4">
          <h2 className="text-sm font-bold text-blue-900">Personalize your SMS</h2>
          <p className="mt-1 text-xs leading-5 text-blue-800">Use placeholders in a message; they are filled in for the selected client when sending.</p>
          <div className="mt-3 flex flex-wrap gap-2">{variables.map(([variable, label]) => <span key={variable} className="rounded-md border border-blue-100 bg-white px-2 py-1 text-xs text-slate-600"><code className="font-semibold text-blue-800">{variable}</code> <span className="text-slate-400">· {label}</span></span>)}</div>
        </div>
      </div>

      {draft && <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/45 p-4 backdrop-blur-sm">
        <form onSubmit={(event) => void saveDraft(event)} className="my-auto w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl">
          <div className="flex items-start justify-between"><div><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Message library</p><h2 className="mt-1 text-xl font-bold text-[#102a43]">{draft.id ? "Edit SMS template" : "Create SMS template"}</h2></div><button type="button" onClick={() => setDraft(null)} aria-label="Close template editor" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X size={18} /></button></div>
          <div className="mt-5 space-y-4">
            <label className="block text-sm font-semibold text-slate-700">Template name<input required maxLength={100} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="e.g. Loan payment received" className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-normal outline-none focus:border-blue-500" /></label>
            <label className="block text-sm font-semibold text-slate-700">Category<select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value as SmsTemplateCategory })} className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-blue-500">{Object.entries(categoryLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
            <label className="block text-sm font-semibold text-slate-700">Message<textarea required maxLength={1600} rows={6} value={draft.message} onChange={(event) => setDraft({ ...draft, message: event.target.value })} placeholder="Type your SMS. Add placeholders like {{client_name}} where appropriate." className="mt-2 w-full resize-y rounded-lg border border-slate-200 p-3 text-sm font-normal leading-6 outline-none focus:border-blue-500" /><span className="mt-1 block text-right text-xs font-normal text-slate-400">{draft.message.length}/1,600 characters</span></label>
            {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
          </div>
          <div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => setDraft(null)} disabled={saving} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600">Cancel</button><button type="submit" disabled={saving} className="rounded-lg bg-[#102a43] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving…" : draft.id ? "Save changes" : "Create template"}</button></div>
        </form>
      </div>}

      {sendingTemplate && <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/45 p-4 backdrop-blur-sm">
        <form onSubmit={(event) => void submitSms(event)} className="my-auto w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl">
          <div className="flex items-start justify-between"><div><p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400"><MessageSquare size={15} /> Ready to send</p><h2 className="mt-2 text-xl font-bold text-[#102a43]">{sendingTemplate.name}</h2><p className="mt-1 text-sm text-slate-500">{categoryLabels[sendingTemplate.category]}</p></div><button type="button" disabled={sending} onClick={() => setSendingTemplate(null)} aria-label="Close send message dialog" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X size={18} /></button></div>
          <div className="mt-5 space-y-4">
            <label className="block text-sm font-semibold text-slate-700">Choose client
              <div className="relative mt-2"><Search size={16} className="absolute left-3 top-3 text-slate-400" /><input value={recipientQuery} onChange={(event) => setRecipientQuery(event.target.value)} placeholder="Search by client name, phone, or ID" className="w-full rounded-lg border border-slate-200 py-2.5 pl-9 pr-3 text-sm font-normal outline-none focus:border-blue-500" /></div>
              <select required value={recipientId} onChange={(event) => setRecipientId(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-blue-500">
                <option value="">Select an active client with a phone number</option>
                {eligibleClients.map((client) => <option key={client.id} value={client.id}>{client.name} · {client.phone}</option>)}
              </select>
            </label>
            {selectedRecipient && <p className="rounded-lg bg-blue-50 p-3 text-xs text-blue-800">SMS recipient: <strong>{selectedRecipient.name}</strong> · {selectedRecipient.phone}</p>}
            <label className="block text-sm font-semibold text-slate-700">Message<textarea required maxLength={1600} rows={6} value={sendMessage} onChange={(event) => setSendMessage(event.target.value)} className="mt-2 w-full resize-y rounded-lg border border-slate-200 p-3 text-sm font-normal leading-6 outline-none focus:border-blue-500" /><span className="mt-1 block text-right text-xs font-normal text-slate-400">{sendMessage.length}/1,600 characters</span></label>
            <div className="rounded-lg border border-slate-100 bg-slate-50 p-3"><p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">Personalized preview</p><p className="whitespace-pre-wrap text-sm leading-6 text-slate-600">{renderMessage(sendMessage, selectedRecipient)}</p></div>
            <p className="text-xs text-slate-400">Sent through Arkesel SMS. SMS charges may apply.</p>
            {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
          </div>
          <div className="mt-6 flex justify-end gap-3"><button type="button" disabled={sending} onClick={() => setSendingTemplate(null)} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600">Cancel</button><button type="submit" disabled={sending || !recipientId || !sendMessage.trim()} className="inline-flex items-center gap-2 rounded-lg bg-[#102a43] px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{sending ? "Sending…" : <><Send size={15} />Send SMS</>}</button></div>
        </form>
      </div>}
      </main>
    </div>
  );
}

function SummaryCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-700">{icon}</div><div><p className="text-xs font-medium text-slate-500">{label}</p><p className="mt-0.5 text-xl font-bold text-[#102a43]">{value}</p></div></div>;
}
