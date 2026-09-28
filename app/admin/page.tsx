"use client";

import {
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleDollarSign,
  CreditCard,
  MessageSquareText,
  DollarSign,
  FileText,
  History,
  Landmark,
  FileCheck2,
  LayoutDashboard,
  Mail,
  MessageSquare,
  MapPin,
  Menu,
  MoreHorizontal,
  PencilLine,
  Plus,
  Phone,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  TrendingUp,
  Trash2,
  UserCog,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { createClient } from "@/lib/supabase/client";
import { createAdminClient, loadAdminClients, reviewClientApplication, setAdminClientStatus, uploadClientDocuments, verifyClientKyc, type AdminClient, type ClientApplication, type ClientStatus, type Guarantor, type KycStatus, updateAdminClient } from "./client-data";
import { assignClientsToBanker, createBanker, loadBankerManagement, setBankerTarget, updateBanker } from "./banker-actions";
import { createAdminBranch, loadAdminBranches, type AdminBranch } from "./branch-data";
import { loadAdminCompany, saveAdminCompany, type AdminCompany } from "./company-data";
import { createAdminAccount, loadAdminAccounts, setAdminAccountStatus, type AdminAccount } from "./account-data";
import { createCollectionSchedule, linkCollectionToLoan, loadCollections, recordCollection, type CollectionAccount, type CollectionClient, type CollectionLoan, type CollectionRow } from "./collection-data";
import { deleteAdminUser, deleteBankerAccount, deleteCollection, deleteDisbursedLoan, deleteFinancialTransactions } from "./delete-actions";
import { executeFinancialTransaction, loadAdminTransactions, type AdminTransaction } from "./transaction-data";
import { approveLoan, createLoanApplication, createLoanProduct, disburseLoan, loadAdminLoans, recordLoanRepayment, type AdminLoan, type LoanProduct } from "./loan-data";
import { loadAdminRoles, loadAdminUsers, type AdminRole, type AdminUser } from "./dashboard-data";
import { NotificationBell } from "@/app/notifications/NotificationBell";
import { countUnreadCollectionNotifications, markCollectionNotificationsRead } from "@/app/notifications/actions";
import { deleteClientApplication as deleteAdminClientApplication, sendClientSms } from "./actions";

type Section = "Overview" | "Applications" | "Collections" | "Transactions" | "Loans" | "Bankers" | "Company" | "Branches" | "Users" | "Roles & permissions";
type Client = AdminClient;
type ApplicationFilter = "All" | ClientStatus | "approved" | "pending" | "rejected";

const navItems: { label: Section; icon: typeof LayoutDashboard }[] = [
  { label: "Overview", icon: LayoutDashboard },
  { label: "Applications", icon: Users },
  { label: "Collections", icon: CircleDollarSign },
  { label: "Transactions", icon: History },
  { label: "Loans", icon: CreditCard },
  { label: "Bankers", icon: UserCog },
  { label: "Company", icon: Building2 },
  { label: "Branches", icon: Building2 },
  { label: "Users", icon: Users },
  { label: "Roles & permissions", icon: ShieldCheck },
];

function Badge({ children, tone = "green" }: { children: React.ReactNode; tone?: "green" | "red" | "blue" | "amber" | "slate" }) {
  const colors = { green: "bg-emerald-50 text-emerald-700", red: "bg-rose-50 text-rose-700", blue: "bg-blue-50 text-blue-700", amber: "bg-amber-50 text-amber-700", slate: "bg-slate-100 text-slate-600" };
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${colors[tone]}`}>{children}</span>;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/35 p-4 backdrop-blur-sm">
      <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-6 py-4"><h2 className="text-lg font-bold text-slate-900">{title}</h2><button type="button" onClick={onClose} aria-label="Close dialog" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X size={18} /></button></div>
        <div className="min-h-0 overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-lg bg-slate-200 ${className}`} />;
}

function SectionSkeleton() {
  return <div className="space-y-4"><div className="flex items-center justify-between"><div><Skeleton className="h-6 w-48" /><Skeleton className="mt-2 h-4 w-72" /></div><Skeleton className="h-10 w-32" /></div><Skeleton className="h-12 w-full max-w-md" /><div className="overflow-hidden rounded-xl border border-slate-200 bg-white p-4"><Skeleton className="h-8 w-full" />{[1, 2, 3, 4, 5].map((row) => <Skeleton key={row} className="mt-4 h-12 w-full" />)}</div></div>;
}

function PortalEmptyState({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center"><p className="font-semibold text-slate-700">{title}</p><p className="mt-1 text-sm text-slate-500">{description}</p>{action && <div className="mt-4">{action}</div>}</div>;
}

function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-5"><p className="font-semibold text-rose-800">Something went wrong</p><p className="mt-1 text-sm text-rose-700">{message}</p>{onRetry && <button onClick={onRetry} className="mt-3 rounded-lg bg-rose-700 px-3 py-2 text-xs font-semibold text-white">Try again</button>}</div>;
}

function ConfirmDialog({ title, message, confirmLabel = "Confirm", onClose, onConfirm, busy = false }: { title: string; message: string; confirmLabel?: string; onClose: () => void; onConfirm: () => void; busy?: boolean }) {
  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm"><div role="dialog" aria-modal="true" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"><h2 className="text-lg font-bold text-slate-900">{title}</h2><p className="mt-2 text-sm text-slate-600">{message}</p><div className="mt-6 flex justify-end gap-3"><button onClick={onClose} disabled={busy} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600">Cancel</button><button onClick={onConfirm} disabled={busy} className="rounded-lg bg-[#102a43] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Working..." : confirmLabel}</button></div></div></div>;
}

function FormField({ label, placeholder, type = "text" }: { label: string; placeholder: string; type?: string }) {
  return <label className="block text-sm font-medium text-slate-700">{label}<input type={type} placeholder={placeholder} className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label>;
}

export default function Home() {
  const [section, setSection] = useState<Section>("Overview");
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const [sectionRefreshKey, setSectionRefreshKey] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [modal, setModal] = useState<"branch" | "user" | "role" | "client" | "note" | "banker" | "account" | "collection" | "schedule" | "transaction" | "loan" | "product" | "repayment" | null>(null);
  const [query, setQuery] = useState("");
  const [clients, setClients] = useState<Client[]>([]);
  const [clientError, setClientError] = useState("");
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [smsOpen, setSmsOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [clientFilter, setClientFilter] = useState<ApplicationFilter>("All");
  const [notice, setNotice] = useState("");
  const [initialLoading, setInitialLoading] = useState(true);
  const [permissionLoading, setPermissionLoading] = useState(true);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [confirmAction, setConfirmAction] = useState<{ title: string; message: string; confirmLabel?: string; action: () => Promise<void> } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [branches, setBranches] = useState<AdminBranch[]>([]);
  const [branchError, setBranchError] = useState("");
  const [bankers, setBankers] = useState<Awaited<ReturnType<typeof loadBankerManagement>>["bankers"]>([]);
  const [bankerBranches, setBankerBranches] = useState<Awaited<ReturnType<typeof loadBankerManagement>>["branches"]>([]);
  const [selectedBankerId, setSelectedBankerId] = useState<string | null>(null);
  const [bankerError, setBankerError] = useState("");
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [accountTypes, setAccountTypes] = useState<{ id: string; name: string; code: string }[]>([]);
  const [accountError, setAccountError] = useState("");
  const [selectedAccount, setSelectedAccount] = useState<AdminAccount | null>(null);
  const [collections, setCollections] = useState<CollectionRow[]>([]);
  const [collectionAccounts, setCollectionAccounts] = useState<CollectionAccount[]>([]);
  const [collectionClients, setCollectionClients] = useState<CollectionClient[]>([]);
  const [collectionError, setCollectionError] = useState("");
  const [unreadCollectionCount, setUnreadCollectionCount] = useState(0);
  const [selectedCollection, setSelectedCollection] = useState<CollectionRow | null>(null);
  const [transactions, setTransactions] = useState<AdminTransaction[]>([]);
  const [selectedTransactionIds, setSelectedTransactionIds] = useState<string[]>([]);
  const [transactionError, setTransactionError] = useState("");
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [adminRoles, setAdminRoles] = useState<AdminRole[]>([]);
  const [dashboardError, setDashboardError] = useState("");
  const [loans, setLoans] = useState<AdminLoan[]>([]);
  const [loanProducts, setLoanProducts] = useState<LoanProduct[]>([]);
  const [loanError, setLoanError] = useState("");
  const [selectedLoan, setSelectedLoan] = useState<AdminLoan | null>(null);
  const filteredBranches = useMemo(() => branches.filter((branch) => `${branch.name} ${branch.code} ${branch.manager}`.toLowerCase().includes(query.toLowerCase())), [branches, query]);
  const filteredUsers = useMemo(() => adminUsers.filter((user) => `${user.name} ${user.email} ${user.role}`.toLowerCase().includes(query.toLowerCase())), [adminUsers, query]);
  const filteredClients = useMemo(() => clients.filter((client) => {
    const matchesQuery = `${client.name} ${client.email} ${client.id} ${client.banker} ${client.branch}`.toLowerCase().includes(query.toLowerCase());
    const matchesFilter = clientFilter === "All" || client.status === clientFilter || client.applicationDecision === clientFilter;
    return matchesQuery && matchesFilter;
  }), [clients, clientFilter, query]);
  const selectedClient = clients.find((client) => client.id === selectedClientId) ?? null;
  const showNotice = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(""), 3500); };
  const applyCollections = (result: Awaited<ReturnType<typeof loadCollections>>) => {
    setCollections(result.collections);
    setCollectionAccounts(result.accounts);
    setCollectionClients(result.clients);
  };
  // Active loans the collections team can post payments against. Derived from the
  // loans already loaded for the Loans page rather than fetched a second time.
  const collectionLoans = useMemo<CollectionLoan[]>(
    () => loans
      .filter((loan) => loan.status === "active" && loan.outstanding > 0)
      .map((loan) => ({
        id: loan.id,
        clientId: loan.clientId,
        loanNumber: loan.loanNumber,
        productName: loan.productName,
        outstanding: loan.outstanding,
        status: loan.status,
      })),
    [loans],
  );
  const fullAdmin = permissions.some((permission) => ["super_admin", "company_admin", "admin"].includes(permission.trim().toLowerCase()));
  const canManage = fullAdmin || permissions.length === 0 || permissions.some((permission) => ["manager", "finance_officer", "banker"].includes(permission.trim().toLowerCase()));
  const canManageFinance = fullAdmin || permissions.length === 0 || permissions.some((permission) => permission.trim().toLowerCase() === "finance_officer");
  const currentGreeting = currentTime
    ? currentTime.getHours() < 12
      ? "Good morning"
      : currentTime.getHours() < 17
        ? "Good afternoon"
        : "Good evening"
    : "Welcome";
  const formattedDateTime = currentTime
    ? new Intl.DateTimeFormat(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(currentTime)
    : "Loading local date and time…";
  useEffect(() => {
    const updateCurrentTime = () => setCurrentTime(new Date());
    updateCurrentTime();
    const intervalId = window.setInterval(updateCurrentTime, 60_000);
    return () => window.clearInterval(intervalId);
  }, []);
  useEffect(() => {
    Promise.allSettled([
      loadAdminClients().then(setClients).catch((error: Error) => setClientError(error.message)),
      loadAdminBranches().then(setBranches).catch((error: Error) => setBranchError(error.message)),
      loadBankerManagement().then((result) => { setBankers(result.bankers); setBankerBranches(result.branches); }).catch((error: Error) => setBankerError(error.message)),
      loadAdminAccounts().then((result) => { setAccounts(result.accounts); setAccountTypes(result.types); }).catch((error: Error) => setAccountError(error.message)),
      loadCollections().then((result) => { setCollections(result.collections); setCollectionAccounts(result.accounts); setCollectionClients(result.clients); }).catch((error: Error) => setCollectionError(error.message)),
      loadAdminTransactions().then(setTransactions).catch((error: Error) => setTransactionError(error.message)),
      loadAdminLoans().then((result) => { setLoans(result.loans); setLoanProducts(result.products); }).catch((error: Error) => setLoanError(error.message)),
      loadAdminUsers().then(setAdminUsers).catch((error: Error) => setDashboardError(error.message)),
      loadAdminRoles().then(setAdminRoles).catch((error: Error) => setDashboardError(error.message)),
    ]).finally(() => setInitialLoading(false));
    createClient().auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: rows } = await createClient().from("user_roles").select("role:roles(name)").eq("profile_id", data.user.id);
      setPermissions(((rows ?? []) as unknown as { role?: { name?: string } | { name?: string }[] }[]).flatMap((row) => {
        const role = Array.isArray(row.role) ? row.role[0] : row.role;
        const name = role?.name?.trim().toLowerCase();
        return name ? [name] : [];
      }));
    }).catch(() => setPermissions([])).finally(() => setPermissionLoading(false));
  }, []);
  useEffect(() => {
    let active = true;
    let channel: ReturnType<ReturnType<typeof createClient>["channel"]> | null = null;
    const refreshUnreadCount = () => {
      void countUnreadCollectionNotifications()
        .then((count) => { if (active) setUnreadCollectionCount(count); })
        .catch((error: Error) => { if (active) setCollectionError(error.message); });
    };
    refreshUnreadCount();
    void createClient().auth.getUser().then(({ data }) => {
      if (!active || !data.user) return;
      channel = createClient()
        .channel(`admin-collection-updates:${data.user.id}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "notifications", filter: `profile_id=eq.${data.user.id}` },
          (payload) => {
            const notification = (payload.new ?? payload.old) as { title?: string };
            if (notification.title !== "Collection recorded") return;
            refreshUnreadCount();
            if (payload.eventType === "INSERT") {
              void Promise.all([
                loadCollections().then(applyCollections).catch((error: Error) => setCollectionError(error.message)),
                loadAdminTransactions().then(setTransactions).catch((error: Error) => setTransactionError(error.message)),
              ]);
            }
          },
        )
        .subscribe();
    });
    return () => {
      active = false;
      if (channel) void channel.unsubscribe();
    };
  }, []);
  const refreshSection = (label: Section) => {
    if (label === "Overview") {
      void Promise.allSettled([
        loadAdminClients().then(setClients).catch((error: Error) => setClientError(error.message)),
        loadBankerManagement().then((result) => { setBankers(result.bankers); setBankerBranches(result.branches); }).catch((error: Error) => setBankerError(error.message)),
        loadAdminAccounts().then((result) => { setAccounts(result.accounts); setAccountTypes(result.types); }).catch((error: Error) => setAccountError(error.message)),
        loadCollections().then(applyCollections).catch((error: Error) => setCollectionError(error.message)),
        loadAdminTransactions().then(setTransactions).catch((error: Error) => setTransactionError(error.message)),
        loadAdminLoans().then((result) => { setLoans(result.loans); setLoanProducts(result.products); }).catch((error: Error) => setLoanError(error.message)),
      ]);
    } else if (label === "Applications") {
      void loadAdminClients().then(setClients).catch((error: Error) => setClientError(error.message));
    } else if (label === "Collections") {
      void Promise.all([
        loadCollections().then(applyCollections).catch((error: Error) => setCollectionError(error.message)),
        loadAdminClients().then(setClients).catch((error: Error) => setClientError(error.message)),
        loadAdminLoans().then((result) => { setLoans(result.loans); setLoanProducts(result.products); }).catch((error: Error) => setLoanError(error.message)),
      ]);
    } else if (label === "Transactions") {
      void loadAdminTransactions().then(setTransactions).catch((error: Error) => setTransactionError(error.message));
    } else if (label === "Loans") {
      void Promise.all([
        loadAdminLoans().then((result) => { setLoans(result.loans); setLoanProducts(result.products); }).catch((error: Error) => setLoanError(error.message)),
        loadAdminClients().then(setClients).catch((error: Error) => setClientError(error.message)),
      ]);
    } else if (label === "Bankers") {
      void Promise.all([
        loadBankerManagement().then((result) => { setBankers(result.bankers); setBankerBranches(result.branches); }).catch((error: Error) => setBankerError(error.message)),
        loadAdminClients().then(setClients).catch((error: Error) => setClientError(error.message)),
      ]);
    } else if (label === "Branches") {
      void loadAdminBranches().then(setBranches).catch((error: Error) => setBranchError(error.message));
    } else if (label === "Users") {
      void loadAdminUsers().then(setAdminUsers).catch((error: Error) => setDashboardError(error.message));
    } else if (label === "Roles & permissions") {
      void Promise.all([
        loadAdminRoles().then(setAdminRoles).catch((error: Error) => setDashboardError(error.message)),
        loadAdminUsers().then(setAdminUsers).catch((error: Error) => setDashboardError(error.message)),
      ]);
    }
  };
  const openSection = (label: Section) => {
    setSection(label);
    setSectionRefreshKey((key) => key + 1);
    setSidebarOpen(false);
    refreshSection(label);
    if (label === "Collections" && unreadCollectionCount > 0) {
      void markCollectionNotificationsRead()
        .then(() => setUnreadCollectionCount(0))
        .catch((error: Error) => showNotice(`Unable to mark new collections as viewed: ${error.message}`));
    }
  };
  useEffect(() => {
    const requestedSection = new URLSearchParams(window.location.search).get("section");
    const validSections: Section[] = [
      "Overview",
      "Applications",
      "Collections",
      "Transactions",
      "Loans",
      "Bankers",
      "Company",
      "Branches",
      "Users",
      "Roles & permissions",
    ];
    if (requestedSection && validSections.includes(requestedSection as Section)) {
      setSection(requestedSection as Section);
    }
  }, []);
  const openClientDetails = (client: Client) => {
    setSmsOpen(false);
    setEditingClient(null);
    setModal(null);
    setSelectedClientId(client.id);
  };
  const toggleClientStatus = async (client: Client) => {
    try {
      await setAdminClientStatus(client.id, client.status !== "Active");
      setClients((current) => current.map((item) => item.id === client.id ? { ...item, status: item.status === "Active" ? "Inactive" : "Active" } : item));
      showNotice(`${client.name} is now ${client.status === "Active" ? "inactive" : "active"}.`);
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "Unable to update client status.");
    }
  };
  const deleteApplication = (client: Client) => requestConfirmation(
    "Delete applications",
    `Delete all loan applications and guarantor details for ${client.name}? The client profile and financial records will be kept. This cannot be undone.`,
    async () => {
      await deleteAdminClientApplication(client.id);
      setClients(await loadAdminClients());
      showNotice("Applications deleted. The client profile and financial records were retained.");
    },
    "Delete",
  );
  const removeCollection = (collection: CollectionRow) => requestConfirmation(
    "Delete collection and payment history",
    `Permanently delete the ${collection.frequency} collection for ${collection.clientName}, including its recorded payment history? Posted ledger transactions and account and loan balances will be preserved. This cannot be undone.`,
    async () => {
      await deleteCollection(collection.id);
      const result = await loadCollections();
      setCollections(result.collections);
      setCollectionAccounts(result.accounts);
      setCollectionClients(result.clients);
      showNotice("Collection and payment history deleted. Posted ledger transactions were retained.");
    },
    "Delete",
  );
  const removeDisbursedLoan = (loan: AdminLoan) => requestConfirmation(
    "Delete disbursed loan",
    `Permanently delete loan ${loan.loanNumber} for ${loan.clientName}, its repayment plan, generated collection schedule, and payment history? The disbursement and repayment ledger transactions will be reversed and account balances adjusted. Deletion will be blocked if the account balance cannot cover the reversals.`,
    async () => {
      await deleteDisbursedLoan(loan.id);
      const [loanData, collectionData, transactionData, accountData] = await Promise.all([
        loadAdminLoans(),
        loadCollections(),
        loadAdminTransactions(),
        loadAdminAccounts(),
      ]);
      setLoans(loanData.loans);
      setLoanProducts(loanData.products);
      applyCollections(collectionData);
      setTransactions(transactionData);
      setAccounts(accountData.accounts);
      setAccountTypes(accountData.types);
      showNotice(`Loan ${loan.loanNumber} deleted and its posted financial transactions reversed.`);
    },
    "Delete loan",
  );
  const removeFinancialTransactions = (transactionIds: string[]) => {
    if (!transactionIds.length) return;
    const count = transactionIds.length;
    requestConfirmation(
      `Delete ${count} financial transaction${count === 1 ? "" : "s"}`,
      `Permanently delete ${count === 1 ? "this transaction" : `these ${count} transactions`} and remove their ledger history? Any linked reversal transactions will be included automatically. Selecting a loan disbursement or repayment will also delete that entire loan, its repayment and collection history, and reverse its posted transactions. Posted account balances will be adjusted and an audit record retained. Transactions linked to other payments, withdrawals, or commissions cannot be deleted independently.`,
      async () => {
        const deletedCount = await deleteFinancialTransactions(transactionIds);
        const [updatedTransactions, accountData] = await Promise.all([
          loadAdminTransactions(),
          loadAdminAccounts(),
        ]);
        setTransactions(updatedTransactions);
        setAccounts(accountData.accounts);
        setAccountTypes(accountData.types);
        setSelectedTransactionIds((current) => current.filter((id) => !transactionIds.includes(id)));
        showNotice(`${deletedCount} financial transaction${deletedCount === 1 ? "" : "s"} deleted.`);
      },
      "Delete transactions",
    );
  };
  const removeBanker = (banker: BankerRecord) => requestConfirmation(
    "Delete banker account",
    `Permanently delete ${banker.name}'s banker login and account? Client assignments will be unlinked, while collection, loan, commission, and visit records will be retained where possible.`,
    async () => {
      const name = await deleteBankerAccount(banker.id);
      const [bankerData, updatedUsers, updatedClients] = await Promise.all([
        loadBankerManagement(),
        loadAdminUsers(),
        loadAdminClients(),
      ]);
      setBankers(bankerData.bankers);
      setBankerBranches(bankerData.branches);
      setAdminUsers(updatedUsers);
      setClients(updatedClients);
      showNotice(`${name}'s banker account was deleted.`);
    },
    "Delete banker",
  );
  const removeUser = (user: AdminUser) => requestConfirmation(
    "Delete user",
    `Permanently delete ${user.name}'s user account and sign-in access? Historical records will be retained where possible. This cannot be undone.`,
    async () => {
      const name = await deleteAdminUser(user.id);
      const [updatedUsers, bankerData, updatedClients] = await Promise.all([
        loadAdminUsers(),
        loadBankerManagement(),
        loadAdminClients(),
      ]);
      setAdminUsers(updatedUsers);
      setBankers(bankerData.bankers);
      setBankerBranches(bankerData.branches);
      setClients(updatedClients);
      showNotice(`${name}'s user account was deleted.`);
    },
    "Delete user",
  );
  const requestConfirmation = (title: string, message: string, action: () => Promise<void>, confirmLabel?: string) => setConfirmAction({ title, message, action, confirmLabel });

  return (
    <div className="min-h-screen bg-[#f6f8fb] text-slate-900">
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-[#102a43] text-white transition-transform lg:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex h-20 items-center gap-3 border-b border-white/10 px-6"><div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white"><Image src="/site_logo.png" alt="" width={2000} height={2000} className="h-full w-full object-contain" priority /></div><div><div className="text-base font-bold tracking-wide">OCEAN TRUST</div><div className="text-[10px] uppercase tracking-[.2em] text-blue-200">Financial services</div></div></div>
        <div className="px-4 py-6"><div className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[.18em] text-blue-200">Workspace</div>{navItems.map(({ label, icon: Icon }) => <button key={label} onClick={() => openSection(label)} className={`mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${section === label ? "bg-white/15 text-white" : "text-blue-100 hover:bg-white/10"}`}><Icon size={18} strokeWidth={1.8} />{label}{label === "Overview" && <span className="ml-auto rounded bg-[#f2b84b] px-1.5 py-0.5 text-[10px] font-bold text-[#102a43]">LIVE</span>}{label === "Collections" && unreadCollectionCount > 0 && <span title="Unread collection notifications" className="ml-auto min-w-5 rounded-full bg-[#f2b84b] px-1.5 py-0.5 text-center text-[10px] font-bold text-[#102a43]">{unreadCollectionCount > 99 ? "99+" : unreadCollectionCount}</span>}</button>)}<Link href="/admin/sms-templates" onClick={() => setSidebarOpen(false)} className="mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-blue-100 transition hover:bg-white/10"><MessageSquareText size={18} strokeWidth={1.8} />SMS templates</Link></div>
        <div className="mt-auto border-t border-white/10 p-4"><button onClick={() => openSection("Company")} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-blue-100 hover:bg-white/10"><Settings2 size={18} />Settings</button><button onClick={() => { void createClient().auth.signOut().then(() => { window.location.href = "/login"; }); }} className="mt-2 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-blue-100 hover:bg-white/10"><ArrowUpRight size={18} className="rotate-45" />Log out</button><div className="mt-4 flex items-center gap-3 rounded-lg bg-white/10 p-3"><div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#d8e9f5] text-xs font-bold text-[#1d4e6d]">AM</div><div className="min-w-0 flex-1"><div className="truncate text-xs font-semibold">Admin Manager</div><div className="truncate text-[11px] text-blue-200">Company admin</div></div><ChevronDown size={15} className="text-blue-200" /></div></div>
      </aside>
      {sidebarOpen && <button className="fixed inset-0 z-30 bg-slate-900/30 lg:hidden" onClick={() => setSidebarOpen(false)} aria-label="Close menu" />}
      <main className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-20 items-center justify-between border-b border-slate-200 bg-white px-5 sm:px-8 lg:static"><div className="flex items-center gap-3"><button className="rounded-lg p-2 text-slate-500 lg:hidden" onClick={() => setSidebarOpen(true)}><Menu size={21} /></button><div><time dateTime={currentTime?.toISOString()} className="text-xs font-medium text-slate-400">{formattedDateTime}</time><h1 className="mt-0.5 text-lg font-bold text-slate-900">{section === "Overview" ? `${currentGreeting}, Admin` : section}</h1></div></div><div className="flex items-center gap-3"><NotificationBell scope="admin" /><div className="hidden h-8 w-px bg-slate-200 sm:block" /><div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#d8e9f5] text-xs font-bold text-[#1d4e6d]">AM</div></div></header>
        <div className="mx-auto max-w-[1500px] p-5 sm:p-8">
          {initialLoading || permissionLoading ? <SectionSkeleton /> : !canManage ? <ErrorState message="Your account does not have permission to access the admin portal." /> : <>{!canManageFinance && <div className="mb-4 flex items-center justify-between rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800"><span>You have limited operational access. Financial actions are restricted.</span><span className="font-semibold">Read-only finance controls</span></div>}                    {section === "Overview" && <Overview setSection={(nextSection) => openSection(nextSection)} clients={clients} bankers={bankers} accounts={accounts} collections={collections} loans={loans} transactions={transactions} />}
          {section === "Applications" && <><ClientManagement clients={filteredClients} query={query} setQuery={setQuery} filter={clientFilter} setFilter={setClientFilter} onAdd={() => { if (canManage) { setEditingClient(null); setModal("client"); } }} onViewDetails={openClientDetails} onReview={async (client, decision) => { await reviewClientApplication(client.id, decision); setClients(await loadAdminClients()); showNotice(decision === "approved" ? "Application approved." : "Application rejected."); }} onSelect={openClientDetails} canDelete={fullAdmin} onDelete={deleteApplication} onToggleStatus={(client) => requestConfirmation(`${client.status === "Active" ? "Deactivate" : "Activate"} client`, `Are you sure you want to ${client.status === "Active" ? "deactivate" : "activate"} ${client.name}?`, () => toggleClientStatus(client), client.status === "Active" ? "Deactivate" : "Activate")} />{clientError && <ErrorState message={clientError} onRetry={() => loadAdminClients().then(setClients).catch((error: Error) => setClientError(error.message))} />}</>}
          {section === "Collections" && <><CollectionManagement collections={collections} clients={clients} loans={loans} query={query} setQuery={setQuery} onAdd={() => canManageFinance && setModal("schedule")} onSelect={setSelectedCollection} onRecord={() => canManageFinance && setModal("collection")} canDelete={fullAdmin} onDelete={removeCollection} onNotice={showNotice} />{collectionError && <ErrorState message={collectionError} onRetry={() => loadCollections().then((result) => { setCollections(result.collections); setCollectionAccounts(result.accounts); setCollectionClients(result.clients); }).catch((error: Error) => setCollectionError(error.message))} />}</>}
          {section === "Transactions" && <><TransactionManagement transactions={transactions} query={query} setQuery={setQuery} onAdd={() => canManageFinance && setModal("transaction")} onRefresh={() => loadAdminTransactions().then(setTransactions)} canDelete={fullAdmin} selectedIds={selectedTransactionIds} onSelectionChange={setSelectedTransactionIds} onDelete={removeFinancialTransactions} />{transactionError && <ErrorState message={transactionError} onRetry={() => loadAdminTransactions().then(setTransactions).catch((error: Error) => setTransactionError(error.message))} />}</>}
          {section === "Loans" && <><LoanManagement loans={loans} clients={clients} query={query} setQuery={setQuery} onAdd={async () => { if (!canManageFinance) return; try { const result = await loadAdminLoans(); setLoans(result.loans); setLoanProducts(result.products); setModal("loan"); } catch (error) { setLoanError(error instanceof Error ? error.message : "Unable to load loan products."); } }} onProduct={() => canManageFinance && setModal("product")} onSelect={setSelectedLoan} onStatus={async (loan, status) => { try { if (status === "disbursed") { await disburseLoan(loan.id); showNotice("Loan disbursed successfully."); } const result = await loadAdminLoans(); setLoans(result.loans); } catch (error) { showNotice(error instanceof Error ? error.message : "Unable to update loan status."); } }} canDelete={fullAdmin} onDelete={removeDisbursedLoan} onNotice={showNotice} />{loanError && <ErrorState message={loanError} onRetry={() => loadAdminLoans().then((result) => { setLoans(result.loans); setLoanProducts(result.products); }).catch((error: Error) => setLoanError(error.message))} />}</>}
          {section === "Bankers" && <><BankerManagement bankers={bankers} branches={bankerBranches} clients={clients} query={query} setQuery={setQuery} onAdd={() => setModal("banker")} onSelect={(id) => setSelectedBankerId(id)} onRefresh={() => loadBankerManagement().then((result) => { setBankers(result.bankers); setBankerBranches(result.branches); })} canDelete={fullAdmin} onDelete={removeBanker} onNotice={showNotice} />{bankerError && <p className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{bankerError}</p>}</>}
          {section === "Company" && <CompanyView key={sectionRefreshKey} />}
          {section === "Branches" && <><ManagementView title="Branch management" description="Manage your locations, managers, and branch access." action="Create branch" onAction={() => setModal("branch")} query={query} setQuery={setQuery}><BranchTable branches={filteredBranches} /></ManagementView>{branchError && <p className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{branchError}</p>}</>}
          {section === "Users" && <ManagementView title="User management" description="Create users, assign roles, and control access across the company." action="Create user" onAction={() => setModal("user")} query={query} setQuery={setQuery}><UserTable users={filteredUsers} canDelete={fullAdmin} onDelete={removeUser} /></ManagementView>}
          {section === "Roles & permissions" && <RolesView roles={adminRoles} onAction={() => setModal("role")} />}{dashboardError && <ErrorState message={dashboardError} />}</>}
        </div>
      </main>
      {modal === "branch" && <BranchModal onClose={() => setModal(null)} onSaved={async () => { setModal(null); const [updatedBranches, bankerData] = await Promise.all([loadAdminBranches(), loadBankerManagement()]); setBranches(updatedBranches); setBankers(bankerData.bankers); setBankerBranches(bankerData.branches); showNotice("Branch created successfully."); }} />}
      {modal === "user" && <Modal title="Create a user" onClose={() => setModal(null)}><div className="grid gap-4 sm:grid-cols-2"><FormField label="First name" placeholder="First name" /><FormField label="Last name" placeholder="Last name" /><FormField label="Email address" placeholder="name@company.com" type="email" /><FormField label="Phone number" placeholder="+232 ..." /><FormField label="Role" placeholder="Select a role" /><FormField label="Branch" placeholder="Select branch" /></div><div className="flex justify-end gap-3 pt-6"><button onClick={() => setModal(null)} className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600">Cancel</button><button onClick={() => setModal(null)} className="rounded-lg bg-[#102a43] px-4 py-2 text-sm font-semibold text-white">Create user</button></div></Modal>}
      {modal === "role" && <Modal title="Create a role" onClose={() => setModal(null)}><div className="space-y-4"><FormField label="Role name" placeholder="e.g. Collections officer" /><FormField label="Description" placeholder="What can this role do?" /><div><div className="mb-2 text-sm font-medium text-slate-700">Permissions</div><div className="grid grid-cols-2 gap-2">{["View clients", "Manage accounts", "Process payments", "Manage loans", "View reports", "Manage users"].map((permission) => <label key={permission} className="flex items-center gap-2 rounded-lg border border-slate-200 p-2.5 text-xs text-slate-600"><input type="checkbox" className="accent-[#102a43]" />{permission}</label>)}</div></div><div className="flex justify-end gap-3 pt-2"><button onClick={() => setModal(null)} className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600">Cancel</button><button onClick={() => setModal(null)} className="rounded-lg bg-[#102a43] px-4 py-2 text-sm font-semibold text-white">Create role</button></div></div></Modal>}
      {modal === "banker" && <BankerModal branches={bankerBranches} onClose={() => setModal(null)} onSaved={async (message) => { setModal(null); showNotice(message); const result = await loadBankerManagement(); setBankers(result.bankers); setBankerBranches(result.branches); }} />}
      {modal === "account" && <AccountModal clients={clients} types={accountTypes} onClose={() => setModal(null)} onSaved={async (message) => { setModal(null); showNotice(message); const result = await loadAdminAccounts(); setAccounts(result.accounts); setAccountTypes(result.types); }} />}
      {modal === "schedule" && <CollectionScheduleModal clients={collectionClients} accounts={collectionAccounts} onClose={() => setModal(null)} onSaved={async () => { setModal(null); const result = await loadCollections(); setCollections(result.collections); setCollectionAccounts(result.accounts); setCollectionClients(result.clients); showNotice("Collection schedule created."); }} />}
      {modal === "collection" && <RecordCollectionModal collections={collections.filter((collection) => collection.status !== "paid" && collection.status !== "cancelled")} accounts={collectionAccounts} onClose={() => setModal(null)} onSaved={async (message) => { setModal(null); const result = await loadCollections(); setCollections(result.collections); setCollectionAccounts(result.accounts); setCollectionClients(result.clients); setClients(await loadAdminClients()); showNotice(message); }} />}
      {modal === "transaction" && <TransactionModal accounts={accounts} onClose={() => setModal(null)} onSaved={async (message) => { setModal(null); setTransactions(await loadAdminTransactions()); const result = await loadAdminAccounts(); setAccounts(result.accounts); showNotice(message); }} />}
      {modal === "product" && <LoanProductModal products={loanProducts} onClose={() => setModal(null)} onSaved={async () => { const result = await loadAdminLoans(); setLoanProducts(result.products); setLoans(result.loans); showNotice("Loan product created successfully."); }} />}
      {modal === "loan" && <LoanApplicationModal clients={clients} accounts={accounts} products={loanProducts} onClose={() => setModal(null)} onSaved={async (message) => { setModal(null); const result = await loadAdminLoans(); setLoanProducts(result.products); setLoans(result.loans); showNotice(message); }} />}
      {selectedLoan && <LoanDetail loan={selectedLoan} accounts={accounts} onClose={() => setSelectedLoan(null)} onRefresh={async (message) => { const result = await loadAdminLoans(); setLoans(result.loans); setSelectedLoan(result.loans.find((loan) => loan.id === selectedLoan.id) ?? null); showNotice(message); }} />}
      {modal === "client" && <ClientApplicationModal client={editingClient} onClose={() => setModal(null)} onSave={async (client, application, documents, isNew) => { try { const clientId = isNew ? await createAdminClient({ clientNumber: client.id, name: client.name, email: client.email, phone: client.phone, dateOfBirth: client.dob, address: client.address, nationalId: client.idNumber === "—" ? "" : client.idNumber, gender: client.gender, application }) : (await updateAdminClient(client, client.branchId), client.id); if (documents.length) await uploadClientDocuments(clientId, documents); setClients(await loadAdminClients()); setModal(null); showNotice(isNew ? "Application saved successfully." : "Application updated."); } catch (error) { const message = error instanceof Error ? error.message : "Unable to save application."; setClientError(message); throw new Error(message); } }} />}
      {modal === "note" && selectedClient && <Modal title={`Add note · ${selectedClient.name}`} onClose={() => setModal(null)}><div className="space-y-4"><label className="block text-sm font-medium text-slate-700">Note<textarea rows={5} placeholder="Write an internal note..." className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label><div className="flex justify-end gap-3"><button onClick={() => setModal(null)} className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600">Cancel</button><button onClick={() => { setModal(null); showNotice("Note added to client history."); }} className="rounded-lg bg-[#102a43] px-4 py-2 text-sm font-semibold text-white">Save note</button></div></div></Modal>}
      {selectedClient && <ClientProfile client={selectedClient} onClose={() => setSelectedClientId(null)} onSave={async (updated, documents) => { await updateAdminClient(updated, updated.branchId); if (documents.length) await uploadClientDocuments(updated.id, documents); const refreshed = await loadAdminClients(); setClients(refreshed); setSelectedClientId(updated.id); showNotice("Client details updated."); }} onToggleStatus={() => toggleClientStatus(selectedClient)} onNote={() => setModal("note")} onAction={showNotice} onVerifyKyc={async () => { await verifyClientKyc(selectedClient.id); setClients(await loadAdminClients()); showNotice("KYC verified successfully."); }} />}
      <button type="button" onClick={() => setSmsOpen(true)} className={`fixed bottom-6 right-6 z-[60] items-center gap-2 rounded-full bg-[#102a43] px-5 py-3 text-sm font-semibold text-white shadow-xl hover:bg-[#183e5f] ${selectedClient ? "hidden sm:flex" : "flex"}`}><MessageSquare size={17} />Send SMS</button>
      {smsOpen && <ClientSmsComposer clients={clients} onClose={() => setSmsOpen(false)} onSent={(recipient) => { setSmsOpen(false); showNotice(`SMS sent to ${recipient}.`); }} />}
      {selectedBankerId && <BankerDashboard banker={bankers.find((banker) => banker.id === selectedBankerId)} clients={clients} onClose={() => setSelectedBankerId(null)} onNotice={showNotice} />}
      {selectedAccount && <AccountStatement account={selectedAccount} onClose={() => setSelectedAccount(null)} onToggle={async () => { await setAdminAccountStatus(selectedAccount.id, selectedAccount.status !== "Active"); const result = await loadAdminAccounts(); setAccounts(result.accounts); setSelectedAccount(result.accounts.find((account) => account.id === selectedAccount.id) ?? null); showNotice("Account status updated."); }} />}
      {selectedCollection && <CollectionHistory collection={selectedCollection} accounts={collectionAccounts} onClose={() => setSelectedCollection(null)} onRecord={() => { setSelectedCollection(null); setModal("collection"); }} />}
      {confirmAction && <ConfirmDialog title={confirmAction.title} message={confirmAction.message} confirmLabel={confirmAction.confirmLabel} busy={confirmBusy} onClose={() => !confirmBusy && setConfirmAction(null)} onConfirm={() => { setConfirmBusy(true); void confirmAction.action().then(() => setConfirmAction(null)).catch((error: unknown) => showNotice(error instanceof Error ? error.message : "Action failed.")).finally(() => setConfirmBusy(false)); }} />}
      {notice && <div role="status" aria-live="polite" className="fixed bottom-5 right-5 z-[60] rounded-lg bg-[#102a43] px-4 py-3 text-sm font-semibold text-white shadow-xl">{notice}</div>}
    </div>
  );
}

function Overview({ setSection, clients, bankers, accounts, collections, loans, transactions }: { setSection: (section: Section) => void; clients: Client[]; bankers: Awaited<ReturnType<typeof loadBankerManagement>>["bankers"]; accounts: AdminAccount[]; collections: CollectionRow[]; loans: AdminLoan[]; transactions: AdminTransaction[] }) {
  const today = localDateKey(new Date());
  const collectionTotal = collections.reduce(
    (total, collection) => total + collection.history
      .filter((payment) => localDateKey(new Date(payment.paidAt)) === today)
      .reduce((sum, payment) => sum + payment.amount, 0),
    0,
  );
  const deposits = transactions.filter((item) => ["deposit", "collection", "payment", "loan_repayment"].includes(item.type)).reduce((sum, item) => sum + item.amount, 0);
  const withdrawals = transactions.filter((item) => ["withdrawal", "fee"].includes(item.type)).reduce((sum, item) => sum + item.amount, 0);
  const pendingLoans = loans.filter((loan) => loan.status === "pending").length;
  const stats = [
    { label: "Clients with applications", value: clients.filter((client) => client.hasApplication).length.toLocaleString(), icon: Users, tone: "blue" },
    { label: "Active bankers", value: bankers.filter((banker) => banker.status === "Active").length.toLocaleString(), icon: UserCog, tone: "violet" },
    { label: "Today's collections", value: `GH₵${collectionTotal.toLocaleString()}`, icon: CircleDollarSign, tone: "amber" },
    { label: "Total Payments", value: `GH₵${deposits.toLocaleString()}`, icon: ArrowDownLeft, tone: "green" },
    { label: "Total withdrawals", value: `GH₵${withdrawals.toLocaleString()}`, icon: ArrowUpRight, tone: "rose" },
    { label: "Outstanding loans", value: `GH₵${loans.reduce((sum, loan) => sum + loan.outstanding, 0).toLocaleString()}`, icon: CreditCard, tone: "orange" },
    { label: "Pending approvals", value: pendingLoans.toLocaleString(), icon: FileCheck2, tone: "slate" },
  ];
  return <><div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="mb-1 text-sm font-medium text-slate-500">Company overview</p><h2 className="text-2xl font-bold tracking-tight text-slate-900">Your business at a glance</h2></div><button onClick={() => setSection("Branches")} className="flex items-center justify-center gap-2 rounded-lg bg-[#102a43] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#183e5f]"><Plus size={16} />Quick action</button></div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{stats.map(({ label, value, icon: Icon, tone }) => <div key={label} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between"><div className={`flex h-10 w-10 items-center justify-center rounded-lg ${tone === "blue" ? "bg-blue-50 text-blue-600" : tone === "violet" ? "bg-violet-50 text-violet-600" : tone === "teal" ? "bg-teal-50 text-teal-600" : tone === "amber" ? "bg-amber-50 text-amber-600" : tone === "green" ? "bg-emerald-50 text-emerald-600" : tone === "rose" ? "bg-rose-50 text-rose-600" : tone === "orange" ? "bg-orange-50 text-orange-600" : "bg-slate-100 text-slate-600"}`}><Icon size={19} /></div><MoreHorizontal size={18} className="text-slate-300" /></div><div className="mt-4 text-2xl font-bold tracking-tight">{value}</div><div className="mt-1 text-xs text-slate-500">{label}</div></div>)}</div><DashboardCharts transactions={transactions} collections={collections} accounts={accounts} loans={loans} applicationClientIds={clients.filter((client) => client.hasApplication).map((client) => client.id)} /><div className="mt-6 grid gap-6 xl:grid-cols-[1.45fr_1fr]"><TransactionPanel transactions={transactions} clients={clients} /><AlertsPanel pendingLoans={pendingLoans} /></div></>;
}

function DashboardCharts({ transactions, collections, accounts, loans, applicationClientIds }: { transactions: AdminTransaction[]; collections: CollectionRow[]; accounts: AdminAccount[]; loans: AdminLoan[]; applicationClientIds: string[] }) {
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(); date.setHours(0, 0, 0, 0); date.setDate(date.getDate() - (6 - index));
    return { key: localDateKey(date), label: date.toLocaleDateString(undefined, { weekday: "short" }) };
  });
  const activity = days.map((day) => ({
    ...day,
    deposits: transactions.filter((item) => localDateKey(new Date(item.createdAt)) === day.key && item.type === "deposit").reduce((sum, item) => sum + item.amount, 0),
    collections: collections.reduce(
      (total, collection) => total + collection.history
        .filter((payment) => localDateKey(new Date(payment.paidAt)) === day.key)
        .reduce((sum, payment) => sum + payment.amount, 0),
      0,
    ),
  }));
  const applicationClientIdSet = new Set(applicationClientIds);
  const applicationAccounts = accounts.filter((account) => applicationClientIdSet.has(account.clientId));
  const activeAccounts = applicationAccounts.filter((account) => account.status === "Active").length;
  const inactiveAccounts = Math.max(applicationAccounts.length - activeAccounts, 0);
  const activeRatio = applicationAccounts.length ? (activeAccounts / applicationAccounts.length) * 100 : 0;
  return <div className="mt-6 grid gap-6 xl:grid-cols-[1.5fr_1fr]">
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4"><div><h3 className="font-bold text-slate-900">Financial activity</h3><p className="mt-1 text-xs text-slate-500">Deposits and collections over the last 7 days</p></div><div className="flex gap-4 text-[11px] font-semibold text-slate-500"><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-[#1d7692]" />Deposits</span><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-[#f59e0b]" />Collections</span></div></div>
      <div className="px-5 pb-5 pt-6"><div className="h-56 w-full"><ResponsiveContainer width="100%" height="100%"><AreaChart data={activity} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}><defs><linearGradient id="depositGradient" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#1d7692" stopOpacity=".28" /><stop offset="100%" stopColor="#1d7692" stopOpacity="0" /></linearGradient></defs><XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#94a3b8" }} /><YAxis axisLine={false} tickLine={false} width={48} tick={{ fontSize: 10, fill: "#94a3b8" }} tickFormatter={(value) => `₵${Math.round(value / 1000)}k`} />      <Tooltip formatter={(value: unknown) => [`GH₵${Number(value ?? 0).toLocaleString()}`, ""]} contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 8px 24px rgba(15,23,42,.08)" }} /><Area type="monotone" dataKey="deposits" name="Deposits" stroke="#1d7692" strokeWidth={3} fill="url(#depositGradient)" /><Area type="monotone" dataKey="collections" name="Collections" stroke="#f59e0b" strokeWidth={2.5} fill="none" /></AreaChart></ResponsiveContainer></div></div>
    </section>
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between"><div><h3 className="font-bold text-slate-900">Portfolio health</h3><p className="mt-1 text-xs text-slate-500">Accounts for clients with applications</p></div><Activity size={18} className="text-[#1d7692]" /></div><div className="mt-4 flex items-center gap-5"><div className="relative h-32 w-32 shrink-0"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={[{ name: "Active", value: activeAccounts }, { name: "Inactive", value: inactiveAccounts }]} dataKey="value" innerRadius={42} outerRadius={60} paddingAngle={3} stroke="none"><Cell fill="#1d7692" /><Cell fill="#e2e8f0" /></Pie>    <Tooltip formatter={(value: unknown) => [Number(value ?? 0).toLocaleString(), "Accounts"]} /></PieChart></ResponsiveContainer><div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"><span className="text-2xl font-bold text-slate-900">{Math.round(activeRatio)}%</span><span className="text-[10px] text-slate-400">active</span></div></div><div className="space-y-3 text-xs"><div><span className="mr-2 inline-block h-2 w-2 rounded-full bg-[#1d7692]" /><span className="text-slate-500">Active accounts</span><strong className="ml-2 text-slate-900">{activeAccounts.toLocaleString()}</strong></div><div><span className="mr-2 inline-block h-2 w-2 rounded-full bg-slate-200" /><span className="text-slate-500">Inactive accounts</span><strong className="ml-2 text-slate-900">{inactiveAccounts.toLocaleString()}</strong></div></div></div><div className="mt-6 grid grid-cols-2 gap-3"><div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] text-slate-500">Loan book</p><p className="mt-1 font-bold text-slate-900">GH₵{loans.reduce((sum, loan) => sum + loan.outstanding, 0).toLocaleString()}</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] text-slate-500">Collections</p><p className="mt-1 font-bold text-slate-900">{collections.filter((item) => item.status === "completed" || item.status === "paid").length.toLocaleString()}</p></div></div></section>
  </div>;
}

function localDateKey(date: Date): string {
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function TransactionPanel({ transactions, clients }: { transactions: AdminTransaction[]; clients: Client[] }) {
  return <section className="rounded-xl border border-slate-200 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><h3 className="font-bold">Recent transactions</h3><p className="mt-0.5 text-xs text-slate-500">Latest activity across all branches</p></div></div><div className="divide-y divide-slate-100">{transactions.slice(0, 5).map((transaction) => { const client = clients.find((item) => item.id === transaction.clientId); return <div key={transaction.id} className="flex items-center gap-3 px-5 py-4">{client?.avatarUrl ? <img src={client.avatarUrl} alt={`${transaction.clientName} profile`} className="h-9 w-9 shrink-0 rounded-full object-cover" /> : <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">{transaction.clientName.slice(0, 2).toUpperCase()}</div>}<div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{transaction.clientName}</div><div className="mt-0.5 text-xs text-slate-400">{transaction.type.replace("_", " ")} · {transaction.accountNumber}</div></div><div className="text-right"><div className="text-sm font-bold text-emerald-600">GH₵{transaction.amount.toLocaleString()}</div><div className="mt-0.5 text-[11px] text-slate-400">{new Date(transaction.createdAt).toLocaleString()}</div></div></div>; })}{!transactions.length && <p className="p-8 text-center text-sm text-slate-500">No transactions recorded.</p>}</div></section>;
}

function AlertsPanel({ pendingLoans }: { pendingLoans: number }) {
  return <section className="rounded-xl border border-slate-200 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><h3 className="font-bold">Alerts & attention</h3><p className="mt-0.5 text-xs text-slate-500">Items that need your review</p></div><span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-rose-50 px-1.5 text-xs font-bold text-rose-600">{pendingLoans}</span></div><div className="p-6">{pendingLoans ? <p className="text-sm text-slate-600">{pendingLoans} loan application{pendingLoans === 1 ? "" : "s"} waiting for review.</p> : <p className="text-sm text-slate-500">No pending approvals.</p>}</div></section>;
}

function ManagementView({ title, description, action, onAction, query, setQuery, children }: { title: string; description: string; action: string; onAction: () => void; query: string; setQuery: (value: string) => void; children: React.ReactNode }) {
  return <><div className="mb-7 flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><p className="mb-1 text-sm font-medium text-slate-500">Administration</p><h2 className="text-2xl font-bold tracking-tight">{title}</h2><p className="mt-1 text-sm text-slate-500">{description}</p></div><button onClick={onAction} className="flex items-center justify-center gap-2 rounded-lg bg-[#102a43] px-4 py-2.5 text-sm font-semibold text-white"><Plus size={16} />{action}</button></div><div className="rounded-xl border border-slate-200 bg-white shadow-sm"><div className="flex flex-col justify-between gap-3 border-b border-slate-100 p-4 sm:flex-row"><div className="relative max-w-sm flex-1"><Search size={16} className="absolute left-3 top-3 text-slate-400" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search..." className="w-full rounded-lg border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-500" /></div><button className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600"><SlidersHorizontal size={15} />Filter</button></div>{children}</div></>;
}

function BranchTable({ branches }: { branches: AdminBranch[] }) {
  return <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-400"><tr><th className="px-5 py-3 font-semibold">Branch</th><th className="px-5 py-3 font-semibold">Manager</th><th className="px-5 py-3 font-semibold">Clients</th><th className="px-5 py-3 font-semibold">Status</th><th className="px-5 py-3" /></tr></thead><tbody className="divide-y divide-slate-100">{branches.map((branch) => <tr key={branch.id} className="hover:bg-slate-50"><td className="px-5 py-4"><div className="font-semibold">{branch.name}</div><div className="mt-1 text-xs text-slate-400">{branch.code}</div></td><td className="px-5 py-4 text-slate-600">{branch.manager}</td><td className="px-5 py-4 font-medium">{branch.clients.toLocaleString()}</td><td className="px-5 py-4"><Badge tone={branch.status === "Active" ? "green" : "slate"}>{branch.status}</Badge></td><td className="px-5 py-4 text-right"><button className="rounded p-2 text-slate-400 hover:bg-slate-100"><MoreHorizontal size={17} /></button></td></tr>)}</tbody></table>{branches.length === 0 && <div className="p-10 text-center text-sm text-slate-500">No branches found.</div>}</div>;
}

function BranchModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState({ name: "", code: "", address: "" });
  const [error, setError] = useState("");
  const submit = async () => {
    if (!form.name.trim() || !form.code.trim()) return setError("Branch name and code are required.");
    try { await createAdminBranch(form); await onSaved(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to create branch."); }
  };
  return <Modal title="Create a branch" onClose={onClose}><div className="space-y-4"><label className="block text-sm font-medium text-slate-700">Branch name<input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="e.g. Central Freetown" className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-500" /></label><label className="block text-sm font-medium text-slate-700">Branch code<input value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))} placeholder="e.g. BR-005" className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-500" /></label><label className="block text-sm font-medium text-slate-700">Address<input value={form.address} onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))} placeholder="Enter branch address" className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-500" /></label>{error && <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}<div className="flex justify-end gap-3 pt-2"><button onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600">Cancel</button><button onClick={submit} className="rounded-lg bg-[#102a43] px-4 py-2 text-sm font-semibold text-white">Create branch</button></div></div></Modal>;
}

function UserTable({ users, canDelete, onDelete }: { users: AdminUser[]; canDelete: boolean; onDelete: (user: AdminUser) => void }) {
  return <div className="overflow-x-auto"><table className="w-full min-w-[800px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-400"><tr><th className="px-5 py-3 font-semibold">User</th><th className="px-5 py-3 font-semibold">Role</th><th className="px-5 py-3 font-semibold">Branch</th><th className="px-5 py-3 font-semibold">Status</th><th className="px-5 py-3" /></tr></thead><tbody className="divide-y divide-slate-100">{users.map((user) => <tr key={user.id} className="hover:bg-slate-50"><td className="px-5 py-4"><div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#e5f0f7] text-xs font-bold text-[#1d4e6d]">{user.initials}</div><div><div className="font-semibold">{user.name}</div><div className="mt-1 text-xs text-slate-400">{user.email}</div></div></div></td><td className="px-5 py-4 text-slate-600">{user.role}</td><td className="px-5 py-4 text-slate-600">{user.branch}</td><td className="px-5 py-4"><Badge tone={user.status === "Active" ? "green" : "slate"}>{user.status}</Badge></td><td className="px-5 py-4 text-right">{canDelete && <button onClick={() => onDelete(user)} className="rounded-lg p-2 text-rose-600 hover:bg-rose-50" aria-label={`Delete user ${user.name}`} title="Delete user"><Trash2 size={16} /></button>}</td></tr>)}</tbody></table></div>;
}

function ClientAvatar({ client, size = "h-10 w-10" }: { client: Client; size?: string }) { return client.avatarUrl ? <img src={client.avatarUrl} alt={`${client.name} profile`} className={`${size} rounded-full object-cover`} /> : <div className={`flex ${size} items-center justify-center rounded-full bg-[#e5f0f7] text-xs font-bold text-[#1d4e6d]`}>{client.initials}</div>; }

function ClientManagement({ clients, query, setQuery, filter, setFilter, onAdd, onViewDetails, onReview, onSelect, onToggleStatus, canDelete, onDelete }: { clients: Client[]; query: string; setQuery: (value: string) => void; filter: ApplicationFilter; setFilter: (value: ApplicationFilter) => void; onAdd: () => void; onViewDetails: (client: Client) => void; onReview: (client: Client, decision: "approved" | "rejected") => Promise<void>; onSelect: (client: Client) => void; canDelete: boolean; onDelete: (client: Client) => void; onToggleStatus: (client: Client) => void }) {
  const visibleApplications = clients.filter((client) => client.hasApplication);
  return <><div className="mb-7 flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><p className="mb-1 text-sm font-medium text-slate-500">Customer operations</p><h2 className="text-2xl font-bold tracking-tight">Application Management</h2><p className="mt-1 text-sm text-slate-500">Review, verify, and manage every client application.</p></div><button onClick={onAdd} className="flex items-center justify-center gap-2 rounded-lg bg-[#102a43] px-4 py-2.5 text-sm font-semibold text-white"><Plus size={16} />New application</button></div><div className="rounded-xl border border-slate-200 bg-white shadow-sm"><div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row"><div className="relative max-w-md flex-1"><Search size={16} className="absolute left-3 top-3 text-slate-400" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, ID, banker, or branch..." className="w-full rounded-lg border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-500" /></div><div className="flex flex-wrap gap-2"><SlidersHorizontal size={16} className="mt-2.5 text-slate-400" />{(["All", "Active", "Inactive", "approved", "pending", "rejected"] as const).map((option) => <button key={option} onClick={() => setFilter(option)} className={`rounded-lg px-3 py-2 text-xs font-semibold capitalize ${filter === option ? "bg-[#102a43] text-white" : "border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{option}</button>)}</div></div><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-400"><tr><th className="px-5 py-3 font-semibold">Client</th><th className="px-5 py-3 font-semibold">Banker / branch</th><th className="px-5 py-3 font-semibold">KYC</th><th className="px-5 py-3 font-semibold">Application</th><th className="px-5 py-3 font-semibold">Status</th><th className="px-5 py-3" /></tr></thead><tbody className="divide-y divide-slate-100">{visibleApplications.map((client) => <tr key={client.id} className="hover:bg-slate-50"><td className="px-5 py-4"><button onClick={() => onSelect(client)} className="flex items-center gap-3 text-left"><ClientAvatar client={client} size="h-10 w-10" /><div><div className="font-semibold text-slate-900">{client.name}</div><div className="mt-1 text-xs text-slate-400">{client.id} · {client.email}</div></div></button></td><td className="px-5 py-4"><div className="font-medium text-slate-700">{client.banker}</div><div className="mt-1 text-xs text-slate-400">{client.branch}</div></td><td className="px-5 py-4"><Badge tone={client.kyc === "Verified" ? "green" : client.kyc === "Pending" ? "amber" : "red"}>{client.kyc}</Badge></td><td className="px-5 py-4"><Badge tone={client.applicationDecision === "approved" ? "green" : client.applicationDecision === "rejected" ? "red" : "amber"}>{client.applicationDecision === "none" ? "No application" : client.applicationDecision}</Badge></td><td className="px-5 py-4"><Badge tone={client.status === "Active" ? "green" : "slate"}>{client.status}</Badge></td><td className="px-5 py-4 text-right"><button onClick={() => onViewDetails(client)} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700" aria-label={`View details for ${client.name}`} title="View client details"><PencilLine size={17} /></button>{client.applicationId && client.applicationDecision === "pending" && <><button onClick={() => void onReview(client, "approved")} className="ml-2 text-xs font-semibold text-emerald-700">Accept</button><button onClick={() => void onReview(client, "rejected")} className="ml-2 text-xs font-semibold text-rose-700">Reject</button></>}{canDelete && client.hasApplication && <button onClick={() => onDelete(client)} className="ml-2 inline-flex items-center gap-1 rounded-lg px-2 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50" aria-label={`Delete application for ${client.name}`} title="Delete application"><Trash2 size={16} />Delete application</button>}<button onClick={() => onToggleStatus(client)} className="ml-2 text-xs font-semibold text-blue-700">{client.status === "Active" ? "Deactivate" : "Activate"}</button></td></tr>)}</tbody></table>{visibleApplications.length === 0 && <div className="p-10 text-center text-sm text-slate-500">No applications match your search or filter.</div>}</div></div></>;
}

function ClientModal({ client, onClose, onSave }: { client: Client | null; onClose: () => void; onSave: (client: Client) => void }) {
  const [name, setName] = useState(client?.name ?? "");
  const [email, setEmail] = useState(client?.email ?? "");
  const [phone, setPhone] = useState(client?.phone ?? "");
  const [branch, setBranch] = useState(client?.branch ?? "Central Freetown");
  const [banker, setBanker] = useState(client?.banker ?? "Amara Kamara");
  const [address, setAddress] = useState(client?.address ?? "");
  const save = () => {
    const names = name.trim().split(/\s+/);
    if (!name.trim() || !email.trim()) return;
    if (!client) return;
    onSave({ ...client, initials: names.map((part) => part[0]).join("").slice(0, 2).toUpperCase(), name: name.trim(), email: email.trim(), phone: phone.trim(), branch, address });
  };
  return <Modal title={client ? "Edit client" : "Add client"} onClose={onClose}><div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1"><div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm font-medium text-slate-700">Full name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mariama Sesay" className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-500" /></label><label className="block text-sm font-medium text-slate-700">Email address<input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="name@email.com" className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-500" /></label><label className="block text-sm font-medium text-slate-700">Phone number<input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+232 ..." className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-500" /></label><label className="block text-sm font-medium text-slate-700">Branch<select value={branch} onChange={(e) => setBranch(e.target.value)} className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"><option>Central Freetown</option><option>East End</option><option>Bo City</option><option>Kenema</option></select></label><label className="block text-sm font-medium text-slate-700">Assigned banker<select value={banker} onChange={(e) => setBanker(e.target.value)} className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"><option>Amara Kamara</option><option>Ibrahim Koroma</option><option>Fatmata Jalloh</option><option>Unassigned</option></select></label><label className="block text-sm font-medium text-slate-700">Address<input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Residential address" className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-500" /></label></div><div className="flex justify-end gap-3 pt-2"><button onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600">Cancel</button><button onClick={save} disabled={!name.trim() || !email.trim()} className="rounded-lg bg-[#102a43] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{client ? "Save changes" : "Add client"}</button></div></div></Modal>;
}

function ClientApplicationModal({ client, onClose, onSave }: { client: Client | null; onClose: () => void; onSave: (client: Client, application: ClientApplication, documents: { type: string; file: File }[], isNew: boolean) => Promise<void> }) {
  const blankApplication: ClientApplication = { applicationDate: new Date().toISOString().slice(0, 10), maritalStatus: "", religion: "", occupation: "", occupationType: "", businessLocation: "", residence: "", businessDuration: "", guarantors: [{ name: "", location: "", houseNumber: "", occupation: "", phone: "", signature: "", relationship: "" }, { name: "", location: "", houseNumber: "", occupation: "", phone: "", signature: "", relationship: "" }], loanPrincipalAmount: "", loanInterestRate: "", processingFee: "", loanDuration: "", paymentMode: "", applicantSignature: "", loanApproved: "", approvedAmount: "", officialInterestRate: "", officialDuration: "", officerSignature: "", officialRemarks: "" };
  const [name, setName] = useState(client?.name ?? "");
  const [email, setEmail] = useState(client?.email ?? "");
  const [phone, setPhone] = useState(client?.phone ?? "");
  const [dob, setDob] = useState(client?.dob ?? "");
  const [gender, setGender] = useState(client?.gender === "—" ? "" : client?.gender ?? "");
  const [nationalId, setNationalId] = useState(client?.idNumber === "—" ? "" : client?.idNumber ?? "");
  const [address, setAddress] = useState(client?.address ?? "");
  const [application, setApplication] = useState<ClientApplication>(client?.application ?? blankApplication);
  const [documents, setDocuments] = useState<Record<string, File>>({});
  const existingDocuments = useMemo(() => Object.fromEntries((client?.documents ?? []).map((document) => [document.type, document])), [client?.documents]);
  const [documentPreviews, setDocumentPreviews] = useState<Record<string, string>>(() => Object.fromEntries((client?.documents ?? []).filter((document) => document.url && document.mimeType?.startsWith("image/")).map((document) => [document.type, document.url as string])));
  const documentFields = [["ghana_card_front", "Ghana Card · Front"], ["ghana_card_back", "Ghana Card · Back"], ["passport_photo", "Passport photograph"], ["business_certificate", "Business certificate"]] as const;
  useEffect(() => () => Object.values(documentPreviews).filter((url) => url.startsWith("blob:")).forEach((url) => URL.revokeObjectURL(url)), [documentPreviews]);
  const documentSection = <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="mb-4"><h3 className="font-bold text-[#102a43]">Applicant documents <span className="ml-2 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-500">Optional</span></h3><p className="mt-1 text-xs text-slate-500">Existing uploads remain available here. Choose a new file to replace one.</p></div><div className="grid gap-3 sm:grid-cols-2">{documentFields.map(([type, label]) => { const existing = existingDocuments[type]; const preview = documentPreviews[type]; const selected = documents[type]; return <label key={type} className="cursor-pointer overflow-hidden rounded-xl border border-dashed border-slate-300 p-3 transition hover:border-blue-400 hover:bg-blue-50/40">{preview ? <img src={preview} alt={`${label} preview`} className="mb-3 h-32 w-full rounded-lg object-cover" /> : <div className="mb-3 flex h-32 items-center justify-center rounded-lg bg-slate-50 px-3 text-center text-xs text-slate-400">{selected ? "Document selected" : existing ? `Existing file: ${existing.name}` : "Click to choose a file"}</div>}<span className="block text-sm font-semibold text-slate-700">{label}</span><span className="mt-1 block truncate text-xs text-slate-400">{selected?.name ?? existing?.name ?? "PDF, JPG or PNG"}</span>{existing?.url && <a href={existing.url} target="_blank" rel="noreferrer" onClick={(event) => { event.stopPropagation(); }} className="mt-2 inline-block text-xs font-semibold text-blue-700 underline">View full document</a>}<input type="file" accept=".pdf,.jpg,.jpeg,.png" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; setDocuments((current) => ({ ...current, [type]: file })); if (file.type.startsWith("image/")) setDocumentPreviews((current) => ({ ...current, [type]: URL.createObjectURL(file) })); else setDocumentPreviews((current) => { const next = { ...current }; delete next[type]; return next; }); }} /></label>; })}</div></section>;
  const [saveError, setSaveError] = useState("");
  const updateApplication = (key: keyof ClientApplication, value: string) => setApplication((current) => ({ ...current, [key]: value }));
  const updateGuarantor = (index: number, key: keyof Guarantor, value: string) => setApplication((current) => ({ ...current, guarantors: current.guarantors.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item) }));
  const save = () => {
    if (!name.trim()) {
      setSaveError("Full name is required.");
      return;
    }
    const id = client?.id ?? `OT-${Date.now().toString().slice(-8)}`;
    setSaveError("");
    void onSave({ ...(client ?? { id, initials: "", avatarUrl: "", applicationId: null, hasApplication: false, applicationDecision: "none", name: "", email: "", phone: "", status: "Active", kyc: "Pending", banker: "Unassigned", bankerId: null, branch: "Unassigned", branchId: "", address: "", dob: "", gender: "", idType: "National ID", idNumber: "", joined: "", accounts: [], savings: [], transactions: [], loans: [], payments: [], documents: [], tickets: [] }), id, name: name.trim(), email: email.trim(), phone: phone.trim(), address, branchId: client?.branchId ?? "", gender: gender || "—", idNumber: nationalId || "—", dob }, application, Object.entries(documents).map(([type, file]) => ({ type, file })), !client).catch((error: Error) => setSaveError(error.message));
  };
  const field = (label: string, value: string, setValue: (value: string) => void, type = "text") => <label className="block text-xs font-semibold text-slate-600">{label}<input type={type} value={value} onChange={(event) => setValue(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label>;
  const choices = (label: string, options: string[], value: string, setValue: (value: string) => void, multiple = false) => <fieldset className="sm:col-span-2"><legend className="text-xs font-semibold text-slate-600">{label}</legend><div className="mt-2 flex flex-wrap gap-2">{options.map((option) => <label key={option} className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${value.split(",").includes(option) ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:border-blue-200"}`}><input type={multiple ? "checkbox" : "radio"} name={multiple ? label : `choice-${label}`} checked={value.split(",").includes(option)} onChange={() => { const values = value ? value.split(",").filter(Boolean) : []; setValue(multiple ? (values.includes(option) ? values.filter((item) => item !== option).join(",") : [...values, option].join(",")) : option); }} className="accent-[#1d6fa5]" />{option}</label>)}</div></fieldset>;
  const guarantorFields = (guarantor: Guarantor, index: number) => (["name", "location", "houseNumber", "occupation", "phone", "relationship"] as const).map((key) => <div key={`${index}-${key}`}>{field(key === "houseNumber" ? "House number" : key[0].toUpperCase() + key.slice(1), guarantor[key], (value) => updateGuarantor(index, key, value))}</div>);
  return <Modal title={client ? "Edit application" : "New application"} onClose={onClose}><div className="max-h-[78vh] space-y-5 overflow-y-auto pr-1"><div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white p-5 shadow-sm"><h3 className="mb-3 font-bold text-[#102a43]">1. Personal details</h3><div className="grid gap-3 sm:grid-cols-2">{field("Account number", client?.accounts[0]?.number ?? (client ? "No account assigned" : "Assigned automatically on save"), () => undefined)}{field("Application date", application.applicationDate, (value) => updateApplication("applicationDate", value), "date")}{field("Full name", name, setName)}{field("Email address", email, setEmail, "email")}{choices("Gender", ["Male", "Female"], gender, setGender)}{field("Date of birth", dob, setDob, "date")}{field("Marital status", application.maritalStatus, (value) => updateApplication("maritalStatus", value))}{field("Religion", application.religion, (value) => updateApplication("religion", value))}{field("Occupation", application.occupation, (value) => updateApplication("occupation", value))}{field("Type of occupation", application.occupationType, (value) => updateApplication("occupationType", value))}{field("Business location", application.businessLocation, (value) => updateApplication("businessLocation", value))}{field("Telephone number", phone, setPhone)}{field("Residential address", address, setAddress)}{field("Residence", application.residence, (value) => updateApplication("residence", value))}{field("National ID", nationalId, setNationalId)}{choices("Business/company duration", ["6 months", "1 year", "2 years", "3 years and above"], application.businessDuration, (value) => updateApplication("businessDuration", value))}</div></div><div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4"><h3 className="mb-3 font-bold text-[#102a43]">2. Guarantors information</h3>{application.guarantors.map((guarantor, index) => <div key={`guarantor-${index}`} className="mb-4 rounded-lg border border-white bg-white p-3 last:mb-0"><div className="mb-2 text-xs font-bold text-slate-500">Guarantor {index + 1}</div><div className="grid gap-3 sm:grid-cols-2">{guarantorFields(guarantor, index)}</div></div>)}</div><div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4"><h3 className="mb-3 font-bold text-[#102a43]">3. Loan information</h3>  <div className="grid gap-3 sm:grid-cols-2">{field("Principal amount (GHC)", application.loanPrincipalAmount, (value) => updateApplication("loanPrincipalAmount", value), "number")}{field("Interest rate (%)", application.loanInterestRate, (value) => updateApplication("loanInterestRate", value), "number")}{field("Processing fee (GHC)", application.processingFee, (value) => updateApplication("processingFee", value), "number")}{choices("Duration", ["3 months", "6 months", "9 months"], application.loanDuration, (value) => updateApplication("loanDuration", value))}{choices("Payment mode", ["Daily", "Weekly", "Monthly"], application.paymentMode, (value) => updateApplication("paymentMode", value))}    </div></div>{documentSection}{saveError && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{saveError}</p>}<div className="flex justify-end gap-3"><button onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600">Cancel</button>  <button onClick={save} disabled={!name.trim()} className="rounded-lg bg-[#102a43] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{client ? "Save changes" : "Save client"}</button></div></div></Modal>;
}

function ClientProfile({ client, onClose, onSave, onToggleStatus, onNote, onAction, onVerifyKyc }: { client: Client; onClose: () => void; onSave: (client: Client, documents: { type: string; file: File }[]) => Promise<void>; onToggleStatus: () => void; onNote: () => void; onAction: (message: string) => void; onVerifyKyc: () => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(client);
  const [files, setFiles] = useState<Record<string, File>>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => { setDraft(client); }, [client]);
  if (editing) {
    const documentFields = [["ghana_card_front", "Ghana Card · Front"], ["ghana_card_back", "Ghana Card · Back"], ["passport_photo", "Passport photograph"], ["business_certificate", "Business certificate"]] as const;
    const setField = (key: "name" | "email" | "phone" | "address" | "dob" | "gender" | "idNumber", value: string) => setDraft((current) => ({ ...current, [key]: value }));
    const save = async () => { setSaving(true); try { await onSave(draft, Object.entries(files).map(([type, file]) => ({ type, file }))); setEditing(false); setFiles({}); } catch (error) { onAction(error instanceof Error ? error.message : "Unable to save client details."); } finally { setSaving(false); } };
    return <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/35 p-4 backdrop-blur-sm sm:p-8"><div className="mx-auto max-w-5xl rounded-2xl bg-[#f6f8fb] shadow-2xl"><div className="sticky top-0 z-10 flex items-center justify-between rounded-t-2xl border-b border-slate-200 bg-white px-5 py-4"><button onClick={() => setEditing(false)} className="flex items-center gap-2 text-sm font-semibold text-slate-600"><ChevronRight size={17} className="rotate-180" />Back to profile</button><button onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X size={18} /></button></div><div className="space-y-5 p-5 sm:p-7"><div><p className="text-sm font-medium text-slate-500">Client profile</p><h2 className="text-2xl font-bold text-slate-900">Edit client details</h2><p className="mt-1 text-sm text-slate-500">Update personal information and add or replace supporting documents.</p></div><section className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm"><h3 className="mb-4 font-bold text-[#102a43]">Personal information</h3><div className="grid gap-4 sm:grid-cols-2">{(["name", "email", "phone", "dob", "address", "idNumber"] as const).map((key) => <label key={key} className="block text-xs font-semibold text-slate-600">{({ name: "Full name", email: "Email address", phone: "Phone number", dob: "Date of birth", address: "Address", idNumber: "National ID" }[key])}<input type={key === "dob" ? "date" : key === "email" ? "email" : "text"} value={draft[key] === "—" ? "" : draft[key]} onChange={(event) => setField(key, event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-normal outline-none focus:border-blue-500" /></label>)}<fieldset className="sm:col-span-2"><legend className="text-xs font-semibold text-slate-600">Gender</legend><div className="mt-2 flex gap-2">{["Male", "Female"].map((option) => <label key={option} className={`rounded-lg border px-4 py-2 text-sm ${draft.gender === option ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200"}`}><input type="radio" className="mr-2" checked={draft.gender === option} onChange={() => setField("gender", option)} />{option}</label>)}</div></fieldset></div></section><section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h3 className="mb-1 font-bold text-[#102a43]">Supporting documents</h3><p className="mb-4 text-xs text-slate-500">Existing documents remain stored. Upload a new file to add another version.</p><div className="grid gap-3 sm:grid-cols-2">{documentFields.map(([type, label]) => { const existing = draft.documents.find((document) => document.type === type); const file = files[type]; const imageUrl = file?.type.startsWith("image/") ? URL.createObjectURL(file) : existing?.url; return <label key={type} className="cursor-pointer overflow-hidden rounded-xl border border-dashed border-slate-300 p-4 hover:border-blue-400 hover:bg-blue-50/30">{imageUrl ? <img src={imageUrl} alt={`${label} preview`} className="mb-3 h-32 w-full rounded-lg object-cover" /> : <div className="mb-3 flex h-32 items-center justify-center rounded-lg bg-slate-50 text-xs text-slate-400">{file ? "Document selected" : existing ? "Existing document" : "Choose a file"}</div>}<span className="block text-sm font-semibold text-slate-700">{label}</span><span className="mt-1 block truncate text-xs text-slate-400">{file?.name ?? existing?.name ?? "Choose a file (optional)"}</span>{existing?.url && <a href={existing.url} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()} className="mt-2 inline-block text-xs font-semibold text-blue-700 underline">View full document</a>}<input type="file" accept=".pdf,.jpg,.jpeg,.png" className="sr-only" onChange={(event) => { const selected = event.target.files?.[0]; if (selected) setFiles((current) => ({ ...current, [type]: selected })); }} /></label>; })}</div></section><div className="flex justify-end gap-3"><button onClick={() => setEditing(false)} className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600">Cancel</button><button onClick={() => void save()} disabled={saving || !draft.name.trim()} className="rounded-lg bg-[#102a43] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving..." : "Save changes"}</button></div></div></div></div>;
  }
  const sectionCard = (title: string, icon: React.ReactNode, content: React.ReactNode) => <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><div className="mb-4 flex items-center gap-2 border-b border-slate-100 pb-3"><span className="shrink-0 text-blue-700">{icon}</span><h3 className="font-bold">{title}</h3></div>{content}</section>;
  return <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/35 p-0 backdrop-blur-sm sm:p-4 md:p-8">
    <div role="dialog" aria-modal="true" aria-labelledby="client-profile-title" className="mx-auto min-h-full w-full max-w-6xl rounded-none bg-[#f6f8fb] shadow-2xl sm:my-4 sm:min-h-0 sm:rounded-2xl">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 sm:rounded-t-2xl sm:px-5 sm:py-4">
        <button onClick={onClose} className="flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900"><ChevronRight size={17} className="rotate-180" />Back to clients</button>
        <button onClick={onClose} aria-label="Close client profile" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
      </div>
      <div className="p-4 sm:p-7">
        <div className="mb-5 flex flex-col justify-between gap-4 sm:mb-6 sm:flex-row sm:items-start">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4"><ClientAvatar client={client} size="h-12 w-12 sm:h-16 sm:w-16" /><div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><h2 id="client-profile-title" className="break-words text-xl font-bold sm:text-2xl">{client.name}</h2><Badge tone={client.status === "Active" ? "green" : "slate"}>{client.status}</Badge></div>
            <p className="mt-1 break-all text-xs text-slate-500 sm:text-sm">{client.id} · Client since {client.joined}</p>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600"><Landmark size={15} className="shrink-0" />Assigned banker: <strong className="break-words">{client.banker}</strong></p>
          </div></div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <button onClick={() => setEditing(true)} className="min-h-11 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Edit details</button>
            <button onClick={onToggleStatus} className="min-h-11 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">{client.status === "Active" ? "Deactivate" : "Activate"}</button>
          </div>
        </div>
        <div className="mb-5 grid gap-2 min-[420px]:grid-cols-2 sm:mb-6 sm:grid-cols-3 sm:gap-3">
          <button onClick={() => { if (client.kyc === "Verified") return onAction("KYC is already verified."); if (!client.documents.length) return onAction("Upload at least one KYC document before accepting verification."); void onVerifyKyc().catch((error: Error) => onAction(error.message)); }} className="flex min-h-16 items-center gap-3 rounded-xl border border-blue-100 bg-blue-50 p-3 text-left hover:bg-blue-100 sm:p-4"><CheckCircle2 className="shrink-0 text-blue-700" size={19} /><span><strong className="block text-sm">Verification / KYC</strong><span className="text-xs text-slate-500">Current: {client.kyc}</span></span></button>
          <button onClick={() => onAction(client.documents.length ? `${client.documents.length} client documents are listed below for review.` : "This client has no documents on file.")} className="flex min-h-16 items-center gap-3 rounded-xl border border-amber-100 bg-amber-50 p-3 text-left hover:bg-amber-100 sm:p-4"><FileText className="shrink-0 text-amber-700" size={19} /><span><strong className="block text-sm">Review documents</strong><span className="text-xs text-slate-500">{client.documents.length} documents on file</span></span></button>
          <button onClick={onNote} className="flex min-h-16 items-center gap-3 rounded-xl border border-violet-100 bg-violet-50 p-3 text-left hover:bg-violet-100 sm:p-4"><History className="shrink-0 text-violet-700" size={19} /><span><strong className="block text-sm">Add history note</strong><span className="text-xs text-slate-500">Record a client interaction</span></span></button>
        </div>
        <div className="grid min-w-0 gap-4 xl:grid-cols-2 sm:gap-5">
          {sectionCard("Personal & contact details", <Users size={17} />, <div className="grid gap-4 sm:grid-cols-2"><Info label="Full name" value={client.name} /><Info label="Date of birth" value={client.dob} /><Info label="Gender" value={client.gender} /><Info label="Email address" value={client.email} /><Info label="Phone number" value={client.phone} /><Info label="Residential address" value={client.address} /></div>)}
          {sectionCard("Identification & assignment", <ShieldCheck size={17} />, <div className="grid gap-4 sm:grid-cols-2"><Info label="KYC status" value={client.kyc} /><Info label="ID document" value={`${client.idType} · ${client.idNumber}`} /><Info label="Branch" value={client.branch} /><Info label="Assigned banker" value={client.banker} /></div>)}
          {client.application?.guarantors?.some((guarantor) => guarantor.name.trim()) && sectionCard("Guarantors", <Users size={17} />, <div className="space-y-4">{client.application.guarantors.filter((guarantor) => guarantor.name.trim()).map((guarantor, index) => <div key={`${guarantor.name}-${index}`} className="rounded-lg border border-slate-100 bg-slate-50 p-3"><div className="font-semibold text-slate-800">Guarantor {index + 1}: {guarantor.name}</div><div className="mt-2 grid gap-2 text-sm sm:grid-cols-2"><Info label="Phone" value={guarantor.phone} /><Info label="Relationship" value={guarantor.relationship} /><Info label="Location" value={guarantor.location} /><Info label="House number" value={guarantor.houseNumber} /><Info label="Occupation" value={guarantor.occupation} /><Info label="Signature" value={guarantor.signature} /></div></div>)}</div>)}
          {sectionCard("Accounts", <Landmark size={17} />, <DataRows rows={client.accounts.map((row) => ({ primary: row.name, secondary: `${row.type} · ${row.number}`, value: row.balance }))} />)}
          {sectionCard("Savings", <CircleDollarSign size={17} />, <DataRows rows={client.savings.map((row) => ({ primary: row.name, secondary: `${row.progress} progress`, value: row.balance }))} />)}
          {sectionCard("Transactions", <Activity size={17} />, <DataRows rows={client.transactions.map((row) => ({ primary: row.type, secondary: `${row.date} · ${row.status}`, value: row.amount }))} />)}
          {sectionCard("Loans", <CreditCard size={17} />, <DataRows rows={client.loans.map((row) => ({ primary: row.name, secondary: `${row.status} · ${row.amount}`, value: row.outstanding }))} />)}
          {sectionCard("Payments", <CircleDollarSign size={17} />, <DataRows rows={client.payments.map((row) => ({ primary: row.reference, secondary: `${row.date} · ${row.type} · Remaining: ${row.remaining}`, value: row.amount }))} />)}
          {sectionCard("Documents", <FileCheck2 size={17} />, <DataRows rows={client.documents.map((row) => ({ primary: row.name, secondary: row.type, value: row.status }))} />)}
          {sectionCard("Support tickets", <CircleAlert size={17} />, <DataRows rows={client.tickets.map((row) => ({ primary: row.subject, secondary: row.date, value: row.status }))} />)}
        </div>
      </div>
    </div>
  </div>;
}

function DataRows({ rows }: { rows: { primary: string; secondary: string; value: string }[] }) { return rows.length ? <div className="divide-y divide-slate-100">{rows.map((row, index) => <div key={`${row.primary}-${row.secondary}-${index}`} className="flex min-w-0 items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"><div className="min-w-0"><div className="break-words text-sm font-semibold">{row.primary}</div><div className="mt-1 break-words text-xs text-slate-400">{row.secondary}</div></div><span className="max-w-[45%] break-words text-right text-sm font-bold text-slate-700">{row.value}</span></div>)}</div> : <EmptyState text="No records found." />; }

function ClientSmsComposer({ clients, onClose, onSent }: { clients: Client[]; onClose: () => void; onSent: (recipient: string) => void }) {
  const [client, setClient] = useState<Client | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | ClientStatus>("All");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const eligibleClients = clients
    .filter((item) => statusFilter === "All" || item.status === statusFilter)
    .filter((item) => `${item.name} ${item.phone} ${item.id} ${item.branch} ${item.banker}`.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!client) return;
    setSending(true);
    setError("");
    try {
      const result = await sendClientSms(client.id, message);
      onSent(result.recipient);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to send the SMS.");
    } finally {
      setSending(false);
    }
  };
  return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm"><section role="dialog" aria-modal="true" aria-labelledby="client-sms-title" className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"><div className="flex items-start justify-between"><div><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400"><MessageSquare size={15} />Client SMS</div><h2 id="client-sms-title" className="mt-2 text-xl font-bold text-[#102a43]">{client ? client.name : "Choose a client"}</h2><p className="mt-1 text-sm text-slate-500">{client ? `Recipient: ${client.phone}` : "Search and select the individual client you want to message."}</p></div><button type="button" onClick={onClose} disabled={sending} aria-label="Close SMS composer" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X size={18} /></button></div>
    {!client ? <><div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto]"><label className="relative block"><span className="sr-only">Search clients</span><Search size={16} className="absolute left-3 top-3 text-slate-400" /><input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, phone, client ID..." className="w-full rounded-lg border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-500" /></label><label className="text-sm"><span className="sr-only">Filter by client status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "All" | ClientStatus)} className="h-full w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm"><option value="All">All statuses</option><option value="Active">Active</option><option value="Inactive">Inactive</option></select></label></div><div className="mt-3 max-h-72 overflow-y-auto rounded-lg border border-slate-100">{eligibleClients.map((item) => { const hasPhone = Boolean(item.phone && item.phone !== "—"); return <button key={item.id} type="button" disabled={!hasPhone} onClick={() => { setClient(item); setMessage(""); setError(""); }} className="flex w-full items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 text-left last:border-b-0 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"><span className="min-w-0"><strong className="block truncate text-sm text-slate-800">{item.name}</strong><span className="mt-1 block truncate text-xs text-slate-500">{item.phone && item.phone !== "—" ? item.phone : "No phone number on file"} · {item.id}</span></span><span className="shrink-0 text-xs font-semibold text-blue-700">{hasPhone ? "Select" : "Unavailable"}</span></button>; })}{!eligibleClients.length && <p className="p-6 text-center text-sm text-slate-400">No clients match your search and filter.</p>}</div></> : <form onSubmit={submit}><button type="button" onClick={() => { setClient(null); setError(""); }} disabled={sending} className="mt-4 text-xs font-semibold text-blue-700 hover:underline">Change recipient</button><label className="mt-4 block text-sm font-semibold text-slate-700">Message<textarea autoFocus required maxLength={1600} value={message} onChange={(event) => setMessage(event.target.value)} rows={6} placeholder="Write a message to this client..." className="mt-2 w-full resize-y rounded-lg border border-slate-200 p-3 text-sm font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label><div className="mt-1 flex justify-between text-xs text-slate-400"><span>Sent through Arkesel SMS</span><span>{message.length}/1,600</span></div>{error && <p role="alert" className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}<p className="mt-3 text-xs text-slate-400">SMS charges may apply. Confirm the recipient and message before sending.</p><div className="mt-6 flex justify-end gap-3"><button type="button" disabled={sending} onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 disabled:opacity-50">Cancel</button><button type="submit" disabled={sending || !message.trim()} className="inline-flex items-center gap-2 rounded-lg bg-[#102a43] px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{sending ? "Sending..." : <><Send size={15} />Send SMS</>}</button></div></form>}
    {!client && <div className="mt-5 flex justify-end"><button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600">Cancel</button></div>}
  </section></div>;
}

function EmptyState({ text }: { text: string }) { return <p className="py-3 text-sm text-slate-400">{text}</p>; }

type BankerRecord = Awaited<ReturnType<typeof loadBankerManagement>>["bankers"][number];
type BankerBranch = Awaited<ReturnType<typeof loadBankerManagement>>["branches"][number];

function BankerManagement({ bankers, branches, clients, query, setQuery, onAdd, onSelect, onRefresh, canDelete, onDelete, onNotice }: { bankers: BankerRecord[]; branches: BankerBranch[]; clients: Client[]; query: string; setQuery: (value: string) => void; onAdd: () => void; onSelect: (id: string) => void; onRefresh: () => Promise<void>; canDelete: boolean; onDelete: (banker: BankerRecord) => void; onNotice: (message: string) => void }) {
  const filtered = bankers.filter((banker) => `${banker.name} ${banker.employeeNumber} ${banker.branch} ${banker.jobTitle}`.toLowerCase().includes(query.toLowerCase()));
  const toggle = async (banker: BankerRecord) => {
    const result = await updateBanker({ id: banker.id, branchId: banker.branchId, jobTitle: banker.jobTitle, phone: banker.phone, status: banker.status === "Active" ? "inactive" : "active" });
    if (!result.ok) return onNotice(result.message);
    onNotice(result.message);
    await onRefresh();
  };
  return <><div className="mb-7 flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><p className="mb-1 text-sm font-medium text-slate-500">People operations</p><h2 className="text-2xl font-bold tracking-tight">Banker management</h2><p className="mt-1 text-sm text-slate-500">Manage field teams, targets, collections, commissions, and activity.</p></div><button onClick={onAdd} className="flex items-center justify-center gap-2 rounded-lg bg-[#102a43] px-4 py-2.5 text-sm font-semibold text-white"><Plus size={16} />Create banker</button></div><div className="rounded-xl border border-slate-200 bg-white shadow-sm"><div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row"><div className="relative max-w-md flex-1"><Search size={16} className="absolute left-3 top-3 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search banker, employee number, or branch..." className="w-full rounded-lg border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-500" /></div></div><div className="overflow-x-auto"><table className="w-full min-w-[950px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-400"><tr><th className="px-5 py-3 font-semibold">Banker</th><th className="px-5 py-3 font-semibold">Branch</th><th className="px-5 py-3 font-semibold">Clients</th><th className="px-5 py-3 font-semibold">Today target</th><th className="px-5 py-3 font-semibold">Collection</th><th className="px-5 py-3 font-semibold">Commission</th><th className="px-5 py-3 font-semibold">Status</th><th /></tr></thead><tbody className="divide-y divide-slate-100">{filtered.map((banker) => <tr key={banker.id} className="hover:bg-slate-50"><td className="px-5 py-4"><button onClick={() => onSelect(banker.id)} className="flex items-center gap-3 text-left"><div className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-50 text-xs font-bold text-violet-700">{banker.name.split(" ").map((part) => part[0]).join("").slice(0, 2)}</div><div><div className="font-semibold">{banker.name}</div><div className="mt-1 text-xs text-slate-400">{banker.employeeNumber} · {banker.jobTitle}</div></div></button></td><td className="px-5 py-4 text-slate-600">{banker.branch}</td><td className="px-5 py-4 font-semibold">{banker.clients}</td><td className="px-5 py-4">{moneyDisplay(banker.target)}</td><td className="px-5 py-4 font-semibold text-emerald-700">{moneyDisplay(banker.collections)}</td><td className="px-5 py-4 font-semibold text-blue-700">{moneyDisplay(banker.commissions)}</td><td className="px-5 py-4"><Badge tone={banker.status === "Active" ? "green" : "slate"}>{banker.status}</Badge></td><td className="px-5 py-4 text-right"><button onClick={() => toggle(banker)} className="text-xs font-semibold text-blue-700">{banker.status === "Active" ? "Deactivate" : "Activate"}</button>{canDelete && <button onClick={() => onDelete(banker)} className="ml-2 rounded-lg p-2 text-rose-600 hover:bg-rose-50" aria-label={`Delete banker account for ${banker.name}`} title="Delete banker account"><Trash2 size={16} /></button>}</td></tr>)}</tbody></table>{filtered.length === 0 && <div className="p-10 text-center text-sm text-slate-500">No bankers found.</div>}</div></div></>;
}

function moneyDisplay(value: number) { return `GH₵${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }

function BankerModal({ branches, onClose, onSaved }: { branches: BankerBranch[]; onClose: () => void; onSaved: (message: string) => Promise<void> }) {
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", password: "", phone: "", employeeNumber: "", jobTitle: "Banker", branchId: branches[0]?.id ?? "" });
  const [error, setError] = useState("");
  const update = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async () => { const result = await createBanker(form); if (!result.ok) return setError(result.message); await onSaved(result.message); };
  return <Modal title="Create banker" onClose={onClose}><div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1"><div className="grid gap-4 sm:grid-cols-2">{(["firstName", "lastName", "email", "password", "phone", "employeeNumber", "jobTitle"] as const).map((key) => <label key={key} className="block text-sm font-medium text-slate-700">{key === "employeeNumber" ? "Employee number" : key === "firstName" ? "First name" : key === "lastName" ? "Last name" : key === "jobTitle" ? "Job title" : key[0].toUpperCase() + key.slice(1)}<input type={key === "password" ? "password" : key === "email" ? "email" : "text"} value={form[key]} onChange={(event) => update(key, event.target.value)} className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-500" /></label>)}<label className="block text-sm font-medium text-slate-700">Branch<select value={form.branchId} onChange={(event) => update("branchId", event.target.value)} className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"><option value="">Select branch</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name} ({branch.code})</option>)}</select></label></div>{error && <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}<div className="flex justify-end gap-3"><button onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600">Cancel</button><button onClick={submit} className="rounded-lg bg-[#102a43] px-4 py-2 text-sm font-semibold text-white">Create banker</button></div></div></Modal>;
}

function BankerDashboard({ banker, clients, onClose, onNotice }: { banker?: BankerRecord; clients: Client[]; onClose: () => void; onNotice: (message: string) => void }) {
  const [target, setTarget] = useState(String(banker?.target ?? ""));
  const [selectedClients, setSelectedClients] = useState<string[]>([]);
  if (!banker) return null;
  const assigned = clients.filter((client) => client.bankerId === banker.id || selectedClients.includes(client.id));
  const saveTarget = async () => { const result = await setBankerTarget(banker.id, Number(target)); onNotice(result.message); };
  const saveAssignments = async () => { const result = await assignClientsToBanker(banker.id, selectedClients); onNotice(result.message); };
  return <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/35 p-4 backdrop-blur-sm sm:p-8"><div className="mx-auto max-w-6xl rounded-2xl bg-[#f6f8fb] shadow-2xl"><div className="flex items-center justify-between rounded-t-2xl border-b border-slate-200 bg-white px-5 py-4"><button onClick={onClose} className="text-sm font-semibold text-slate-600">Back to bankers</button><button onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X size={18} /></button></div><div className="p-5 sm:p-7"><div className="mb-6 flex items-start justify-between"><div><p className="text-sm text-slate-500">Banker dashboard</p><h2 className="text-2xl font-bold">{banker.name}</h2><p className="mt-1 text-sm text-slate-500">{banker.employeeNumber} · {banker.branch}</p></div><Badge tone={banker.status === "Active" ? "green" : "slate"}>{banker.status}</Badge></div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Today's target" value={moneyDisplay(banker.target)} icon={<TargetIcon />} /><Metric label="Today's collection" value={moneyDisplay(banker.collections)} icon={<CircleDollarSign size={18} />} /><Metric label="Outstanding collection" value={moneyDisplay(Math.max(banker.target - banker.collections, 0))} icon={<WalletCards size={18} />} /><Metric label="Assigned clients" value={String(banker.clients)} icon={<Users size={18} />} /><Metric label="Visits" value={String(banker.visits)} icon={<MapPin size={18} />} /><Metric label="Commission" value={moneyDisplay(banker.commissions)} icon={<DollarSign size={18} />} /></div><div className="mt-6 grid gap-6 lg:grid-cols-2"><section className="rounded-xl border border-slate-200 bg-white p-5"><h3 className="font-bold">Set today's target</h3><div className="mt-3 flex gap-2"><input value={target} onChange={(event) => setTarget(event.target.value)} type="number" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /><button onClick={saveTarget} className="rounded-lg bg-[#102a43] px-4 py-2 text-sm font-semibold text-white">Save</button></div></section><section className="rounded-xl border border-slate-200 bg-white p-5"><h3 className="font-bold">Assign clients</h3><div className="mt-3 max-h-36 space-y-2 overflow-y-auto">{clients.map((client) => <label key={client.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selectedClients.includes(client.id)} onChange={(event) => setSelectedClients((current) => event.target.checked ? [...current, client.id] : current.filter((id) => id !== client.id))} />{client.name}</label>)}</div><button onClick={saveAssignments} className="mt-3 rounded-lg bg-[#102a43] px-4 py-2 text-sm font-semibold text-white">Save assignments</button></section></div><div className="mt-6 grid gap-6 lg:grid-cols-3"><ListCard title="Recent collections" rows={banker.collectionsRows.map((row) => `${String(row.description ?? "Collection")} · ${moneyDisplay(Number(row.collected_amount ?? 0))}`)} /><ListCard title="Commissions" rows={banker.commissionRows.map((row) => `${String(row.description ?? "Commission")} · ${moneyDisplay(Number(row.amount ?? 0))}`)} /><ListCard title="Recent activity" rows={banker.activity.map((row) => `${String(row.action)} · ${new Date(String(row.created_at)).toLocaleDateString()}`)} /></div><div className="mt-6 rounded-xl border border-slate-200 bg-white p-5"><h3 className="font-bold">Assigned clients</h3><div className="mt-3 divide-y divide-slate-100">{assigned.map((client) => <div key={client.id} className="flex justify-between py-3 text-sm"><span>{client.name}</span><span className="text-slate-500">{client.phone}</span></div>)}{!assigned.length && <EmptyState text="No clients assigned." />}</div></div></div></div></div>;
}

function AccountManagement({ accounts, clients, types, query, setQuery, onAdd, onSelect, onRefresh, onNotice }: { accounts: AdminAccount[]; clients: Client[]; types: { id: string; name: string; code: string }[]; query: string; setQuery: (value: string) => void; onAdd: () => void; onSelect: (account: AdminAccount) => void; onRefresh: () => Promise<void>; onNotice: (message: string) => void }) {
  const filtered = accounts.filter((account) => `${account.accountNumber} ${account.clientName} ${account.typeName}`.toLowerCase().includes(query.toLowerCase()));
  const toggle = async (account: AdminAccount) => { try { await setAdminAccountStatus(account.id, account.status !== "Active"); await onRefresh(); onNotice("Account status updated."); } catch (error) { onNotice(error instanceof Error ? error.message : "Unable to update account."); } };
  return <section className="space-y-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold text-[#102a43]">Accounts</h2><p className="text-sm text-slate-500">Manage account lifecycle and review controlled financial activity.</p></div><button onClick={onAdd} disabled={!clients.length || !types.length} className="rounded-lg bg-[#102a43] px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">+ Open account</button></div><div className="flex items-center gap-3"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search account, client or type..." className="w-full max-w-md rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500" /></div><div className="overflow-hidden rounded-xl border border-slate-200 bg-white"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Account</th><th className="px-4 py-3">Client</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Balance</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Actions</th></tr></thead><tbody>{filtered.map((account) => <tr key={account.id} className="border-t border-slate-100"><td className="px-4 py-3 font-semibold">{account.accountNumber}<div className="text-xs text-slate-400">{account.currency}</div></td><td className="px-4 py-3">{account.clientName}</td><td className="px-4 py-3">{account.typeName}</td><td className="px-4 py-3 font-semibold">{account.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td><td className="px-4 py-3"><span className="rounded-full bg-slate-100 px-2 py-1 text-xs">{account.status}</span></td><td className="space-x-2 px-4 py-3"><button onClick={() => onSelect(account)} className="font-semibold text-blue-700">View</button>{account.status !== "Closed" && <button onClick={() => void toggle(account)} className="font-semibold text-slate-600">{account.status === "Active" ? "Freeze" : "Activate"}</button>}</td></tr>)}</tbody></table>{!filtered.length && <p className="p-8 text-center text-sm text-slate-500">No accounts found.</p>}</div></section>;
}

function AccountModal({ clients, types, onClose, onSaved }: { clients: Client[]; types: { id: string; name: string; code: string }[]; onClose: () => void; onSaved: (message: string) => Promise<void> }) {
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [typeId, setTypeId] = useState(types[0]?.id ?? "");
  const [currency, setCurrency] = useState("GHS");
  const [dailyLimit, setDailyLimit] = useState("0");
  const [monthlyLimit, setMonthlyLimit] = useState("0");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const save = async () => { setSaving(true); setError(""); try { await createAdminAccount({ clientId, accountTypeId: typeId, currency, dailyLimit: Number(dailyLimit) || 0, monthlyLimit: Number(monthlyLimit) || 0 }); await onSaved("Account opened successfully."); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to open account."); } finally { setSaving(false); } };
  return <Modal title="Open account" onClose={onClose}><div className="space-y-4"><p className="rounded-lg bg-blue-50 p-3 text-sm text-blue-800">New accounts start at a zero balance. Balances can only change through approved financial transactions.</p><label className="block text-sm font-semibold">Client<select value={clientId} onChange={(event) => setClientId(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 p-2.5 font-normal">{clients.map((client) => <option key={client.id} value={client.id}>{client.name} · {client.id}</option>)}</select></label><label className="block text-sm font-semibold">Account type<select value={typeId} onChange={(event) => setTypeId(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 p-2.5 font-normal">{types.map((type) => <option key={type.id} value={type.id}>{type.name} ({type.code})</option>)}</select></label><label className="block text-sm font-semibold">Currency<input value="GHS" readOnly className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 p-2.5 uppercase" /></label><div className="grid grid-cols-2 gap-3"><label className="text-sm font-semibold">Daily limit<input type="number" min="0" value={dailyLimit} onChange={(event) => setDailyLimit(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 p-2.5 font-normal" /></label><label className="text-sm font-semibold">Monthly limit<input type="number" min="0" value={monthlyLimit} onChange={(event) => setMonthlyLimit(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 p-2.5 font-normal" /></label></div>{error && <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}<div className="flex justify-end gap-2"><button onClick={onClose} className="rounded-lg border px-4 py-2 text-sm">Cancel</button><button onClick={() => void save()} disabled={saving || !clientId || !typeId || currency.length !== 3} className="rounded-lg bg-[#102a43] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Opening..." : "Open account"}</button></div></div></Modal>;
}

function AccountStatement({ account, onClose, onToggle }: { account: AdminAccount; onClose: () => void; onToggle: () => Promise<void> }) {
  return <Modal title={`${account.accountNumber} · statement`} onClose={onClose}><div className="space-y-4"><div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-4 text-sm"><div><span className="text-slate-500">Client</span><p className="font-semibold">{account.clientName}</p></div><div><span className="text-slate-500">Status</span><p className="font-semibold">{account.status}</p></div><div><span className="text-slate-500">Balance</span><p className="font-semibold">{account.currency} {account.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p></div><div><span className="text-slate-500">Limits</span><p className="font-semibold">{account.dailyLimit.toLocaleString()} daily / {account.monthlyLimit.toLocaleString()} monthly</p></div></div><div className="overflow-hidden rounded-lg border"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Reference</th><th className="p-3">Type</th><th className="p-3">Amount</th><th className="p-3">Status</th><th className="p-3">Date</th></tr></thead><tbody>{account.transactions.map((transaction) => <tr key={transaction.id} className="border-t"><td className="p-3 font-medium">{transaction.reference}</td><td className="p-3">{transaction.type}</td><td className="p-3">{transaction.amount.toLocaleString()}</td><td className="p-3">{transaction.status}</td><td className="p-3">{new Date(transaction.date).toLocaleDateString()}</td></tr>)}</tbody></table>{!account.transactions.length && <p className="p-6 text-center text-sm text-slate-500">No transactions recorded.</p>}</div><div className="flex justify-end"><button onClick={() => void onToggle()} disabled={account.status === "Closed"} className="rounded-lg bg-[#102a43] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{account.status === "Active" ? "Freeze account" : "Activate account"}</button></div></div></Modal>;
}

function CollectionMetric({ label, value, hint, tone = "slate" }: { label: string; value: string; hint: string; tone?: "slate" | "green" | "amber" | "rose" }) {
  const toneClass = tone === "green" ? "bg-emerald-50 text-emerald-700" : tone === "amber" ? "bg-amber-50 text-amber-700" : tone === "rose" ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-600";
  return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><span className={`inline-flex h-8 items-center rounded-lg px-2.5 text-[11px] font-bold uppercase tracking-wide ${toneClass}`}>{label}</span><p className="mt-3 text-xl font-bold text-[#102a43]">{value}</p><p className="mt-1 text-xs text-slate-500">{hint}</p></div>;
}

function CollectionManagement({ collections, clients, loans, query, setQuery, onAdd, onSelect, onRecord, canDelete, onDelete, onNotice }: { collections: CollectionRow[]; clients: Client[]; loans: CollectionLoan[]; query: string; setQuery: (value: string) => void; onAdd: () => void; onSelect: (collection: CollectionRow) => void; onRecord: (collection: CollectionRow) => void; canDelete: boolean; onDelete: (collection: CollectionRow) => void; onNotice: (message: string) => void }) {
  const [statusFilter, setStatusFilter] = useState<"all" | "outstanding" | "overdue" | "paid">("all");
  const filtered = collections.filter((item) => {
    const matchesQuery = `${item.clientName} ${item.clientNumber} ${item.reference} ${item.loanNumber} ${item.frequency} ${item.status}`.toLowerCase().includes(query.toLowerCase());
    const matchesStatus = statusFilter === "all"
      || (statusFilter === "outstanding" ? item.remaining > 0 : statusFilter === "overdue" ? item.isOverdue : item.status === "paid");
    return matchesQuery && matchesStatus;
  });
  const totals = collections.reduce((acc, item) => ({ scheduled: acc.scheduled + item.totalAmount, collected: acc.collected + item.collectedAmount, outstanding: acc.outstanding + item.remaining }), { scheduled: 0, collected: 0, outstanding: 0 });
  const overdueCount = collections.filter((item) => item.isOverdue).length;
  const openCount = collections.filter((item) => item.remaining > 0).length;
  const firstOpen = collections.find((item) => item.remaining > 0);
  const tone = (status: string) => status === "paid" ? "green" : status === "overdue" ? "red" : status === "partially_paid" ? "amber" : "blue";
  const statusOptions = [["all", "All"], ["outstanding", "Outstanding"], ["overdue", "Overdue"], ["paid", "Paid"]] as const;
  return <section className="space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-xl font-bold text-[#102a43]">Collections</h2><p className="mt-1 text-sm text-slate-500">Recording a payment here also reduces the linked loan balance.</p></div><div className="flex gap-2"><button onClick={onAdd} className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Create schedule</button><button onClick={() => firstOpen && onRecord(firstOpen)} disabled={!firstOpen} className="rounded-lg bg-[#102a43] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Record collection</button></div></div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><CollectionMetric label="Scheduled" value={moneyDisplay(totals.scheduled)} hint={`${collections.length} schedule${collections.length === 1 ? "" : "s"} · ${openCount} open`} /><CollectionMetric label="Collected" value={moneyDisplay(totals.collected)} hint="Posting against loans" tone="green" /><CollectionMetric label="Outstanding" value={moneyDisplay(totals.outstanding)} hint="Still to collect" tone="amber" /><CollectionMetric label="Overdue" value={String(overdueCount)} hint="Past the due date" tone={overdueCount ? "rose" : "slate"} /></div>
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center lg:justify-between"><div className="relative w-full lg:max-w-md"><Search size={16} className="absolute left-3 top-3 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search client, loan, reference or status..." className="w-full rounded-lg border border-slate-200 py-2.5 pl-9 pr-4 text-sm outline-none focus:border-blue-500" /></div><div className="flex flex-wrap gap-2">{statusOptions.map(([value, label]) => <button key={value} onClick={() => setStatusFilter(value)} className={`rounded-lg px-3 py-2 text-xs font-semibold ${statusFilter === value ? "bg-[#102a43] text-white" : "border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{label}</button>)}</div></div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1080px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-400"><tr><th className="p-4">Client</th><th className="p-4">Loan</th><th className="p-4">Due date</th><th className="p-4">Collected</th><th className="p-4">Loan balance</th><th className="p-4">Status</th><th className="p-4">Actions</th></tr></thead>
          <tbody>
            {filtered.map((item) => {
              const client = clients.find((entry) => entry.id === item.clientId);
              const clientLoanCount = loans.filter((loan) => loan.clientId === item.clientId).length;
              const needsLink = !item.loanId && clientLoanCount > 1;
              return <tr key={item.id} className="border-t border-slate-100 align-top hover:bg-slate-50">
                <td className="p-4"><div className="flex items-center gap-3">{client?.avatarUrl ? <img src={client.avatarUrl} alt={`${item.clientName} profile`} className="h-9 w-9 shrink-0 rounded-full object-cover" /> : <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#e5f0f7] text-xs font-bold text-[#1d4e6d]">{item.clientName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</div>}<div className="min-w-0"><div className="font-semibold text-slate-900">{item.clientName}</div><div className="mt-0.5 text-xs text-slate-400">{item.clientNumber || client?.branch || "—"} · {item.reference}</div></div></div></td>
                <td className="p-4">{item.loanNumber ? <div><div className="font-semibold text-slate-700">{item.loanNumber}</div><div className="mt-0.5 text-xs text-slate-400">Repayments post here</div></div> : <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${needsLink ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"}`}>{needsLink ? "Choose a loan when collecting" : "Auto-links on payment"}</span>}</td>
                <td className="p-4 text-slate-600">{item.dueDate ? new Date(item.dueDate).toLocaleDateString() : "—"}{item.isOverdue && <span className="mt-1 block text-xs font-semibold text-rose-600">Overdue</span>}</td>
                <td className="p-4"><div className="font-semibold text-slate-900">{moneyDisplay(item.collectedAmount)} <span className="font-normal text-slate-400">of {moneyDisplay(item.totalAmount)}</span></div><div className="mt-2 h-1.5 w-40 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${item.progress}%` }} /></div><div className="mt-1 text-xs text-slate-500">{moneyDisplay(item.remaining)} remaining</div></td>
                <td className="p-4">{item.loanOutstanding === null ? <span className="text-slate-400">—</span> : <span className="font-semibold text-[#102a43]">{moneyDisplay(item.loanOutstanding)}</span>}</td>
                <td className="p-4"><Badge tone={tone(item.status) as "green" | "red" | "amber" | "blue"}>{item.status.replace("_", " ")}</Badge><div className="mt-2 text-xs capitalize text-slate-400">{item.frequency}</div></td>
                <td className="p-4"><div className="flex flex-wrap items-center gap-3">{item.remaining > 0 ? <button onClick={() => onRecord(item)} className="rounded-lg bg-[#102a43] px-3 py-2 text-xs font-semibold text-white hover:bg-[#1d4e6d]">Collect</button> : <span className="text-xs font-semibold text-emerald-700">Completed</span>}<button onClick={() => onSelect(item)} className="text-xs font-semibold text-blue-700">History</button>{canDelete && <button onClick={() => onDelete(item)} className="text-xs font-semibold text-rose-600">Delete</button>}</div></td>
              </tr>;
            })}
          </tbody>
        </table>
        {!filtered.length && <p className="p-10 text-center text-sm text-slate-500">No collection schedules match this view.</p>}
      </div>
    </div>
  </section>;
}
function CollectionScheduleModal({ clients, accounts, onClose, onSaved }: { clients: CollectionClient[]; accounts: CollectionAccount[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const clientAccounts = accounts.filter((account) => account.clientId === clientId);
  const [accountId, setAccountId] = useState(clientAccounts[0]?.id ?? "");
  const [total, setTotal] = useState(""); const [amount, setAmount] = useState(""); const [dueDate, setDueDate] = useState(new Date().toISOString().slice(0, 10)); const [frequency, setFrequency] = useState<"daily" | "weekly" | "monthly">("daily"); const [error, setError] = useState(""); const [saving, setSaving] = useState(false);
  useEffect(() => { setAccountId(clientAccounts[0]?.id ?? ""); }, [clientId]);
  const save = async () => { setSaving(true); setError(""); try { const totalAmount = Number(total); const scheduledAmount = Number(amount); if (!clientId || !accountId || totalAmount <= 0 || scheduledAmount <= 0 || scheduledAmount > totalAmount) throw new Error("Select a client and account, then enter valid collection amounts."); await createCollectionSchedule({ clientId, accountId, totalAmount, amount: scheduledAmount, dueDate, frequency }); await onSaved(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to create schedule."); } finally { setSaving(false); } };
  return <Modal title="Create collection schedule" onClose={onClose}><div className="space-y-5"><div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4"><div className="flex items-start gap-3"><CircleDollarSign size={19} className="mt-0.5 text-blue-700" /><div><h3 className="text-sm font-bold text-[#102a43]">Plan a repayment schedule</h3><p className="mt-1 text-xs leading-5 text-slate-600">Assign the collection to a client account and define how much should be collected and when.</p></div></div></div><section className="rounded-2xl border border-slate-200 p-4"><div className="mb-4 flex items-center gap-2"><Users size={16} className="text-blue-700" /><h3 className="text-sm font-bold text-slate-900">Client and account</h3></div><div className="space-y-4"><label className="block text-sm font-semibold text-slate-700">Client<select value={clientId} onChange={(event) => setClientId(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white p-2.5 font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100">{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label><label className="block text-sm font-semibold text-slate-700">Collection account{clientAccounts.length ? <select value={accountId} onChange={(event) => setAccountId(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white p-2.5 font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100">{clientAccounts.map((account) => <option key={account.id} value={account.id}>{account.accountNumber} · {account.currency} · {moneyDisplay(account.balance)}</option>)}</select> : <div className="mt-1.5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-normal text-amber-800">No account is available for this client.</div>}</label></div></section><section className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4"><div className="mb-4 flex items-center gap-2"><Calendar size={16} className="text-blue-700" /><h3 className="text-sm font-bold text-slate-900">Schedule details</h3></div><div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold text-slate-700">Total amount (GH₵)<input type="number" min="0" step="0.01" value={total} onChange={(event) => setTotal(event.target.value)} placeholder="e.g. 5,000" className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white p-2.5 font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label><label className="text-sm font-semibold text-slate-700">Installment (GH₵)<input type="number" min="0" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="e.g. 500" className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white p-2.5 font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label><label className="text-sm font-semibold text-slate-700">First due date<input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white p-2.5 font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label><label className="text-sm font-semibold text-slate-700">Frequency<select value={frequency} onChange={(event) => setFrequency(event.target.value as typeof frequency)} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white p-2.5 font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label></div></section>{error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}<div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4"><button onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button><button onClick={() => void save()} disabled={saving || !clientAccounts.length} className="rounded-lg bg-[#102a43] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#1d4e6d] disabled:cursor-not-allowed disabled:opacity-50">{saving ? "Saving..." : "Create schedule"}</button></div></div></Modal>;
}

function RecordCollectionModal({ collections, accounts, onClose, onSaved }: { collections: CollectionRow[]; accounts: CollectionAccount[]; onClose: () => void; onSaved: (message: string) => Promise<void> }) {
  const [collectionId, setCollectionId] = useState(collections[0]?.id ?? ""); const collection = collections.find((item) => item.id === collectionId) ?? collections[0]; const clientAccounts = accounts.filter((account) => account.clientId === collection?.clientId && account.status === "active"); const [accountId, setAccountId] = useState(clientAccounts[0]?.id ?? ""); const [amount, setAmount] = useState(""); const [method, setMethod] = useState<"cash" | "bank_transfer" | "card" | "mobile_money" | "direct_debit" | "other">("cash"); const [description, setDescription] = useState(""); const [error, setError] = useState(""); const [saving, setSaving] = useState(false);
  useEffect(() => { setAccountId(clientAccounts[0]?.id ?? ""); }, [collectionId]);
  const save = async () => { if (!collection) return; setSaving(true); setError(""); try { const value = Number(amount); if (!accountId || value <= 0 || value > collection.totalAmount - collection.collectedAmount) throw new Error("Enter an amount within the outstanding collection balance."); const result = await recordCollection({ collectionId: collection.id, clientId: collection.clientId, accountId, amount: value, method, description, idempotencyKey: crypto.randomUUID() }); await onSaved(`Collection confirmed. Receipt ${result.receipt_reference}`); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to record collection."); } finally { setSaving(false); } };
  return <Modal title="Record collection" onClose={onClose}><div className="space-y-5"><div className="rounded-2xl bg-[#102a43] p-4 text-white"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-blue-200">Payment confirmation</p><h3 className="mt-1 text-lg font-bold">{collection?.clientName ?? "Select a collection"}</h3><p className="mt-1 text-xs text-blue-100">{collection?.reference ?? "No schedule selected"}</p></div><CircleDollarSign size={22} className="text-blue-200" /></div>{collection && <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/15 pt-3 text-sm"><div><p className="text-xs text-blue-200">Collected</p><p className="mt-1 font-bold">{moneyDisplay(collection.collectedAmount)}</p></div><div><p className="text-xs text-blue-200">Remaining</p><p className="mt-1 font-bold text-amber-200">{moneyDisplay(collection.totalAmount - collection.collectedAmount)}</p></div></div>}</div><section className="rounded-2xl border border-slate-200 p-4"><label className="block text-sm font-semibold text-slate-700">Collection schedule<select value={collectionId} onChange={(event) => setCollectionId(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white p-2.5 font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100">{collections.map((item) => <option key={item.id} value={item.id}>{item.clientName} · {item.reference} · {moneyDisplay(item.totalAmount - item.collectedAmount)} remaining</option>)}</select></label><label className="mt-4 block text-sm font-semibold text-slate-700">Account{clientAccounts.length ? <select value={accountId} onChange={(event) => setAccountId(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white p-2.5 font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100">{clientAccounts.map((account) => <option key={account.id} value={account.id}>{account.accountNumber} · {account.currency}</option>)}</select> : <div className="mt-1.5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-normal text-amber-800">No active account is available for this collection.</div>}</label></section><section className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4"><div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold text-slate-700 sm:col-span-2">Payment amount (GH₵)<input type="number" min="0" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder={collection ? `Up to ${moneyDisplay(collection.totalAmount - collection.collectedAmount)}` : "Enter amount"} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white p-2.5 text-lg font-semibold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label><label className="text-sm font-semibold text-slate-700 sm:col-span-2">Payment method<select value={method} onChange={(event) => setMethod(event.target.value as typeof method)} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white p-2.5 font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"><option value="cash">Cash</option><option value="bank_transfer">Bank transfer</option><option value="mobile_money">Mobile money</option><option value="card">Card</option><option value="direct_debit">Direct debit</option></select></label><label className="text-sm font-semibold text-slate-700 sm:col-span-2">Note <span className="font-normal text-slate-400">(optional)</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white p-2.5 font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" rows={2} placeholder="Add a payment note or reference..." /></label></div></section>{error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}<div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4"><button onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button><button onClick={() => void save()} disabled={saving || !collection || !clientAccounts.length} className="rounded-lg bg-[#102a43] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#1d4e6d] disabled:cursor-not-allowed disabled:opacity-50">{saving ? "Confirming..." : "Confirm & issue receipt"}</button></div></div></Modal>;
}

function CollectionHistory({ collection, onClose, onRecord }: { collection: CollectionRow; accounts: CollectionAccount[]; onClose: () => void; onRecord: () => void }) {
  return <Modal title={`${collection.clientName} · collection history`} onClose={onClose}><div className="space-y-4"><div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-4 text-sm"><div><span className="text-slate-500">Schedule</span><p className="font-semibold capitalize">{collection.frequency}</p></div><div><span className="text-slate-500">Status</span><p className="font-semibold capitalize">{collection.status.replace("_", " ")}</p></div><div><span className="text-slate-500">Collected</span><p className="font-semibold">{moneyDisplay(collection.collectedAmount)} / {moneyDisplay(collection.totalAmount)}</p></div><div><span className="text-slate-500">Account</span><p className="font-semibold">{collection.accountNumber}</p></div></div><div className="divide-y rounded-lg border">{collection.history.map((payment) => <div key={payment.id} className="flex items-center justify-between p-3 text-sm"><div><p className="font-semibold">{payment.reference}</p><p className="text-xs text-slate-500">{payment.method.replace("_", " ")} · {new Date(payment.paidAt).toLocaleString()}</p></div><span className="font-semibold text-emerald-700">{moneyDisplay(payment.amount)}</span></div>)}{!collection.history.length && <p className="p-6 text-center text-sm text-slate-500">No collection payments recorded.</p>}</div>{collection.status !== "paid" && <div className="flex justify-end"><button onClick={onRecord} className="rounded-lg bg-[#102a43] px-4 py-2 text-sm font-semibold text-white">Record payment</button></div>}</div></Modal>;
}

function TransactionManagement({ transactions, query, setQuery, onAdd, onRefresh, canDelete, selectedIds, onSelectionChange, onDelete }: { transactions: AdminTransaction[]; query: string; setQuery: (value: string) => void; onAdd: () => void; onRefresh: () => Promise<void>; canDelete: boolean; selectedIds: string[]; onSelectionChange: (ids: string[]) => void; onDelete: (ids: string[]) => void }) {
  const filtered = transactions.filter((item) => `${item.reference} ${item.type} ${item.clientName} ${item.accountNumber} ${item.status}`.toLowerCase().includes(query.toLowerCase()));
  const allFilteredSelected = filtered.length > 0 && filtered.every((item) => selectedIds.includes(item.id));
  const toggleAll = () => {
    if (allFilteredSelected) {
      const filteredIds = new Set(filtered.map((item) => item.id));
      onSelectionChange(selectedIds.filter((id) => !filteredIds.has(id)));
    } else {
      onSelectionChange([...new Set([...selectedIds, ...filtered.map((item) => item.id)])]);
    }
  };
  const toggleOne = (id: string) => onSelectionChange(
    selectedIds.includes(id) ? selectedIds.filter((selectedId) => selectedId !== id) : [...selectedIds, id],
  );
  return <section className="space-y-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold text-[#102a43]">Financial transactions</h2><p className="text-sm text-slate-500">Posted balances will be adjusted when eligible ledger transactions are deleted. Loan-linked transactions require deleting the loan instead.</p></div><button onClick={onAdd} className="rounded-lg bg-[#102a43] px-4 py-2.5 text-sm font-semibold text-white">+ New transaction</button></div><div className="flex flex-wrap items-center gap-2"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search reference, client, account or status..." className="w-full max-w-md rounded-lg border border-slate-200 px-3 py-2 text-sm" /><button onClick={() => void onRefresh()} className="rounded-lg border px-3 py-2 text-sm font-semibold">Refresh</button>{canDelete && selectedIds.length > 0 && <><span className="text-sm text-slate-600">{selectedIds.length} selected</span><button onClick={() => onDelete(selectedIds)} className="rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-700">Delete selected</button><button onClick={() => onSelectionChange([])} className="rounded-lg border px-3 py-2 text-sm font-semibold text-slate-600">Clear selection</button></>}</div><div className="overflow-x-auto rounded-xl border border-slate-200 bg-white"><table className="w-full min-w-[1050px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>{canDelete && <th className="p-4"><input type="checkbox" checked={allFilteredSelected} onChange={toggleAll} aria-label="Select all filtered transactions" /></th>}<th className="p-4">Reference</th><th className="p-4">Type</th><th className="p-4">Client/account</th><th className="p-4">Amount</th><th className="p-4">Status</th><th className="p-4">Recorded by</th><th className="p-4">Created</th>{canDelete && <th className="p-4">Actions</th>}</tr></thead><tbody>{filtered.map((item) => <tr key={item.id} className="border-t border-slate-100">{canDelete && <td className="p-4"><input type="checkbox" checked={selectedIds.includes(item.id)} onChange={() => toggleOne(item.id)} aria-label={`Select transaction ${item.reference}`} /></td>}<td className="p-4 font-semibold">{item.reference}</td><td className="p-4 capitalize">{item.type.replace("_", " ")}</td><td className="p-4">{item.clientName}<div className="text-xs text-slate-400">{item.accountNumber}</div></td><td className="p-4 font-semibold">{item.currency === "GHS" ? "GH₵" : item.currency} {item.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td><td className="p-4"><Badge tone={item.status === "completed" || item.status === "posted" ? "green" : item.status === "failed" ? "red" : "amber"}>{item.status}</Badge></td><td className="p-4 text-slate-600">{item.recordedBy}</td><td className="p-4 text-slate-500">{new Date(item.createdAt).toLocaleString()}</td>{canDelete && <td className="p-4"><button onClick={() => onDelete([item.id])} className="rounded-lg p-2 text-rose-600 hover:bg-rose-50" aria-label={`Delete transaction ${item.reference}`} title="Delete transaction"><Trash2 size={16} /></button></td>}</tr>)}</tbody></table>{!filtered.length && <p className="p-8 text-center text-sm text-slate-500">No transactions found.</p>}</div></section>;
}

function LoanManagement({ loans, clients, query, setQuery, onAdd, onProduct, onSelect, onStatus, canDelete, onDelete, onNotice }: { loans: AdminLoan[]; clients: Client[]; query: string; setQuery: (value: string) => void; onAdd: () => void | Promise<void>; onProduct: () => void; onSelect: (loan: AdminLoan) => void; onStatus: (loan: AdminLoan, status: "pending" | "disbursed") => Promise<void>; canDelete: boolean; onDelete: (loan: AdminLoan) => void; onNotice: (message: string) => void }) {
  const filtered = loans.filter((loan) => `${loan.loanNumber} ${loan.clientName} ${loan.productName} ${loan.status}`.toLowerCase().includes(query.toLowerCase()));
  const tone = (status: string) => status === "active" || status === "repaid" ? "green" : status === "defaulted" ? "red" : status === "approved" ? "blue" : "amber";
  return <section className="space-y-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold text-[#102a43]">Loan management</h2><p className="text-sm text-slate-500">Products, applications, approval, disbursement, repayments, interest, and overdue monitoring.</p></div><div className="flex gap-2"><button onClick={onProduct} className="rounded-lg border px-4 py-2.5 text-sm font-semibold">Loan products</button><button onClick={onAdd} className="rounded-lg bg-[#102a43] px-4 py-2.5 text-sm font-semibold text-white">New application</button></div></div><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search loan number, client, product or status..." className="w-full max-w-md rounded-lg border border-slate-200 px-3 py-2 text-sm" /><div className="overflow-x-auto rounded-xl border border-slate-200 bg-white"><table className="w-full min-w-[1000px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-4">Client</th><th className="p-4">Loan</th><th className="p-4">Product</th><th className="p-4">Principal</th><th className="p-4">Outstanding</th><th className="p-4">Status</th><th className="p-4">Actions</th></tr></thead><tbody>{filtered.map((loan) => { const client = clients.find((item) => item.id === loan.clientId); const displayStatus = loan.status === "active" ? "disbursed" : loan.status === "approved" ? "pending" : loan.status; return <tr key={loan.id} className="border-t border-slate-100"><td className="p-4"><button type="button" onClick={() => onSelect(loan)} className="flex items-center gap-2 text-left"><ClientAvatar client={client ?? { id: loan.clientId, initials: loan.clientName.slice(0, 2).toUpperCase(), avatarUrl: "", applicationId: null, hasApplication: false, applicationDecision: "none", name: loan.clientName, email: "", phone: "", status: "Active", kyc: "Pending", banker: "", bankerId: null, branch: "", branchId: "", address: "", dob: "", gender: "", idType: "", idNumber: "", joined: "", accounts: [], savings: [], transactions: [], loans: [], payments: [], documents: [], tickets: [] }} size="h-9 w-9" /><span>{loan.clientName}</span></button></td><td className="p-4 font-semibold">{loan.loanNumber}<div className="text-xs text-slate-400">{loan.termMonths} months · {loan.interestRate}%</div></td><td className="p-4">{loan.productName}</td><td className="p-4">GH₵{loan.principal.toLocaleString()}</td><td className="p-4 font-semibold">GH₵{loan.outstanding.toLocaleString()}</td><td className="p-4"><select value={displayStatus === "disbursed" ? "disbursed" : "pending"} onChange={(event) => void onStatus(loan, event.target.value as "pending" | "disbursed")} disabled={displayStatus === "disbursed"} className="rounded-full border-0 bg-slate-50 px-2.5 py-1 text-xs font-semibold capitalize"><option value="pending">Pending</option><option value="disbursed">Disbursed</option></select></td><td className="p-4"><div className="flex items-center gap-3"><button onClick={() => onSelect(loan)} className="font-semibold text-blue-700">View history</button>{canDelete && loan.disbursedAmount !== null && <button onClick={() => onDelete(loan)} className="rounded-lg p-2 text-rose-600 hover:bg-rose-50" aria-label={`Delete disbursed loan ${loan.loanNumber}`} title="Delete disbursed loan"><Trash2 size={16} /></button>}</div></td></tr>; })}</tbody></table>{!filtered.length && <PortalEmptyState title="No loans found" description="Create a loan application or adjust your search." action={<button onClick={onAdd} className="rounded-lg bg-[#102a43] px-4 py-2 text-sm font-semibold text-white">Create application</button>} />}</div></section>;
}

function LoanProductModal({ products, onClose, onSaved }: { products: LoanProduct[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState({ name: "", code: "", rate: "", term: "", min: "", max: "", startDays: "30" }); const [error, setError] = useState(""); const [saving, setSaving] = useState(false);
  const save = async () => {
    setError("");
    const name = form.name.trim();
    const code = form.code.trim().toUpperCase();
    const interestRate = Number(form.rate);
    const termMonths = Number(form.term);
    const minimumAmount = Number(form.min);
    const maximumAmount = Number(form.max);
    const repaymentStartDays = Number(form.startDays);
    if (!name || !/^[A-Z0-9_-]+$/.test(code)) return setError("Enter a product name and a code using only letters, numbers, hyphens, or underscores.");
    if (!Number.isFinite(interestRate) || interestRate < 0 || interestRate > 100) return setError("Interest rate must be between 0 and 100.");
    if (!Number.isInteger(termMonths) || termMonths <= 0) return setError("Term must be a whole number of months.");
    if (![7, 30].includes(repaymentStartDays)) return setError("Choose whether repayments start next week or next month.");
    if (!Number.isFinite(minimumAmount) || minimumAmount <= 0 || !Number.isFinite(maximumAmount) || maximumAmount < minimumAmount) return setError("Enter valid minimum and maximum amounts.");
    if (products.some((product) => product.code.toUpperCase() === code)) return setError("That product code already exists.");
    setSaving(true);
    try { await createLoanProduct({ name, code, interestRate, termMonths, minimumAmount, maximumAmount, repaymentStartDays }); setForm({ name: "", code: "", rate: "", term: "", min: "", max: "", startDays: "30" }); await onSaved(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to create loan product. Check that you have administrator permission."); } finally { setSaving(false); }
  };
  return <Modal title="Loan product management" onClose={onClose}><div className="space-y-6"><section><div className="mb-3 flex items-center justify-between"><div><h3 className="font-bold text-[#102a43]">Active products</h3><p className="text-xs text-slate-500">Available for new loan applications</p></div></div>{products.length ? <div className="space-y-3">{products.map((product) => <div key={product.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><p className="font-bold text-slate-900">{product.name}</p><Badge tone="green">Active</Badge></div><p className="mt-1 text-xs font-medium uppercase tracking-wide text-slate-400">{product.code}</p></div><p className="font-bold text-[#102a43]">GH₵{product.minimumAmount.toLocaleString()} – GH₵{product.maximumAmount.toLocaleString()}</p></div><div className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3 text-xs"><div><p className="text-slate-400">Interest</p><p className="mt-1 font-semibold text-slate-700">{product.interestRate}%</p></div><div><p className="text-slate-400">Term</p><p className="mt-1 font-semibold text-slate-700">{product.termMonths} months</p></div><div><p className="text-slate-400">First payment</p><p className="mt-1 font-semibold text-slate-700">{product.repaymentStartDays === 7 ? "Next week" : "Next month"}</p></div></div></div>)}</div> : <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50 p-5 text-center text-sm text-amber-800">No active loan products yet. Create the first product below.</div>}</section><section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4"><div className="mb-4"><h3 className="font-bold text-[#102a43]">Create a loan product</h3><p className="mt-1 text-xs text-slate-500">Use a unique code and set the repayment terms your team will offer.</p></div><div className="grid gap-3 sm:grid-cols-2"><label className="block text-sm font-semibold text-slate-700 sm:col-span-2">Product name<input type="text" placeholder="e.g. Standard Micro Loan" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white p-2.5 font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label><label className="block text-sm font-semibold text-slate-700">Product code<input type="text" placeholder="e.g. STANDARD_MICRO" value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white p-2.5 font-normal uppercase outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label><label className="block text-sm font-semibold text-slate-700">Interest rate (%)<input type="number" min="0" max="100" step="0.01" placeholder="10" value={form.rate} onChange={(event) => setForm((current) => ({ ...current, rate: event.target.value }))} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white p-2.5 font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label><label className="block text-sm font-semibold text-slate-700">Term (months)<input type="number" min="1" step="1" placeholder="12" value={form.term} onChange={(event) => setForm((current) => ({ ...current, term: event.target.value }))} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white p-2.5 font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label><label className="block text-sm font-semibold text-slate-700">Minimum amount (GH₵)<input type="number" min="0" placeholder="100" value={form.min} onChange={(event) => setForm((current) => ({ ...current, min: event.target.value }))} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white p-2.5 font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label><label className="block text-sm font-semibold text-slate-700">Maximum amount (GH₵)<input type="number" min="0" placeholder="100000" value={form.max} onChange={(event) => setForm((current) => ({ ...current, max: event.target.value }))} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white p-2.5 font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label><label className="block text-sm font-semibold text-slate-700 sm:col-span-2">First repayment<select value={form.startDays} onChange={(event) => setForm((current) => ({ ...current, startDays: event.target.value }))} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white p-2.5 font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"><option value="7">Next week (7 days after disbursement)</option><option value="30">Next month (30 days after disbursement)</option></select></label></div></section>{error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}<div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button><button type="button" onClick={() => void save()} disabled={saving} className="rounded-lg bg-[#102a43] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#1d4e6d] disabled:cursor-not-allowed disabled:opacity-50">{saving ? "Creating product..." : "Create product"}</button></div></div></Modal>;
}

function LoanApplicationModal({ clients, accounts, products, onClose, onSaved }: { clients: Client[]; accounts: AdminAccount[]; products: LoanProduct[]; onClose: () => void; onSaved: (message: string) => Promise<void> }) {
  const [clientId, setClientId] = useState(clients[0]?.id ?? ""); const [productId, setProductId] = useState(products[0]?.id ?? ""); const clientAccounts = accounts.filter((account) => account.clientId === clientId && account.status === "Active"); const [accountId, setAccountId] = useState(clientAccounts[0]?.id ?? ""); const [amount, setAmount] = useState(""); const [error, setError] = useState(""); const [saving, setSaving] = useState(false);
  useEffect(() => setAccountId(clientAccounts[0]?.id ?? ""), [clientId]);
  useEffect(() => { if (products.length && !products.some((product) => product.id === productId)) setProductId(products[0].id); }, [products, productId]);
  const save = async () => { setSaving(true); setError(""); try { const value = Number(amount); const product = products.find((item) => item.id === productId); if (!clientId || !accountId || !product || value < product.minimumAmount || value > product.maximumAmount) throw new Error("Select a client, active account, product, and an amount within product limits."); const result = await createLoanApplication({ clientId, productId, accountId, amount: value }); await onSaved(`Loan application ${result.application_number} submitted for review.`); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to submit application."); } finally { setSaving(false); } };
  const selectedClient = clients.find((client) => client.id === clientId);
  const selectedProduct = products.find((product) => product.id === productId);
  return <Modal title="New loan application" onClose={onClose}><div className="space-y-5">
    <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4"><div className="mb-4 flex items-center gap-2"><Users size={17} className="text-blue-700" /><div><h3 className="text-sm font-bold text-slate-900">Applicant details</h3><p className="text-xs text-slate-500">Select the client and account receiving the loan.</p></div></div><div className="space-y-4"><label className="block text-sm font-semibold text-slate-700">Client<select value={clientId} onChange={(event) => setClientId(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white p-2.5 font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100">{clients.map((client) => <option key={client.id} value={client.id}>{client.name} · {client.id}</option>)}</select></label><label className="block text-sm font-semibold text-slate-700">Disbursement account{clientAccounts.length ? <select value={accountId} onChange={(event) => setAccountId(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white p-2.5 font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100">{clientAccounts.map((account) => <option key={account.id} value={account.id}>{account.accountNumber} · {account.currency} · {moneyDisplay(account.balance)}</option>)}</select> : <div className="mt-1.5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-normal text-amber-800">No active account is available for this client.</div>}</label>{selectedClient && <div className="flex items-center gap-3 rounded-lg border border-blue-100 bg-blue-50 p-3"><ClientAvatar client={selectedClient} size="h-9 w-9" /><div><p className="text-sm font-semibold text-slate-800">{selectedClient.name}</p><p className="text-xs text-slate-500">{selectedClient.phone || selectedClient.email || "Client profile"}</p></div></div>}</div></section>
    <section className="rounded-2xl border border-slate-200 p-4"><div className="mb-4 flex items-center gap-2"><SlidersHorizontal size={17} className="text-blue-700" /><div><h3 className="text-sm font-bold text-slate-900">Loan terms</h3><p className="text-xs text-slate-500">Choose an active product and enter the requested principal.</p></div></div><div className="space-y-4"><label className="block text-sm font-semibold text-slate-700">Loan product{products.length ? <select value={productId} onChange={(event) => setProductId(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white p-2.5 font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100">{products.map((product) => <option key={product.id} value={product.id}>{product.name} · {product.interestRate}% · {product.termMonths} months</option>)}</select> : <div className="mt-1.5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-normal text-amber-800">No active loan products are configured. Create a loan product first.</div>}</label><label className="block text-sm font-semibold text-slate-700">Principal amount (GH₵)<input type="number" min={selectedProduct?.minimumAmount ?? 0} max={selectedProduct?.maximumAmount} step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder={selectedProduct ? `${selectedProduct.minimumAmount.toLocaleString()} – ${selectedProduct.maximumAmount.toLocaleString()}` : "Enter amount"} className="mt-1.5 w-full rounded-lg border border-slate-200 p-2.5 font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />{selectedProduct && <span className="mt-1.5 block text-xs text-slate-500">Allowed range: GH₵{selectedProduct.minimumAmount.toLocaleString()} – GH₵{selectedProduct.maximumAmount.toLocaleString()}</span>}</label></div>{selectedProduct && <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 sm:grid-cols-3"><div><p className="text-xs text-slate-400">Interest</p><p className="mt-1 text-sm font-bold text-slate-800">{selectedProduct.interestRate}%</p></div><div><p className="text-xs text-slate-400">Term</p><p className="mt-1 text-sm font-bold text-slate-800">{selectedProduct.termMonths} months</p></div><div><p className="text-xs text-slate-400">First payment</p><p className="mt-1 text-sm font-bold text-slate-800">{selectedProduct.repaymentStartDays === 7 ? "Next week" : "Next month"}</p></div></div>}</section>
    {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-4"><p className="text-xs text-slate-400">Application will remain pending until reviewed.</p><div className="flex gap-2"><button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button><button type="button" onClick={() => void save()} disabled={saving || !products.length || !clientAccounts.length} className="rounded-lg bg-[#102a43] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#1d4e6d] disabled:cursor-not-allowed disabled:opacity-50">{saving ? "Submitting..." : "Submit application"}</button></div></div>
  </div></Modal>;
}

function LoanDetail({ loan, accounts, onClose, onRefresh }: { loan: AdminLoan; accounts: AdminAccount[]; onClose: () => void; onRefresh: (message: string) => Promise<void> }) {
  const approve = async () => { try { await approveLoan(loan.id, loan.principal); await onRefresh("Loan approved."); } catch (error) { onRefresh(error instanceof Error ? error.message : "Unable to approve loan."); } };
  const disburse = async () => { try { await disburseLoan(loan.id); await onRefresh("Loan disbursed and repayment schedule created."); } catch (error) { onRefresh(error instanceof Error ? error.message : "Unable to disburse loan."); } };
  const totalScheduled = loan.repayments.reduce((total, item) => total + item.principal + item.interest, 0);
  const paidScheduled = loan.repayments.reduce((total, item) => total + item.paid, 0);
  return <Modal title={`${loan.loanNumber} · installment plan`} onClose={onClose}><div className="space-y-5"><div className="flex items-start justify-between rounded-xl bg-[#102a43] p-4 text-white"><div><p className="text-xs uppercase tracking-wide text-blue-200">Repayment schedule</p><p className="mt-1 text-lg font-bold">{loan.clientName}</p><p className="mt-1 text-sm text-blue-100">{loan.termMonths} monthly installments · {loan.interestRate}% interest</p></div><Badge tone={loan.status === "active" ? "green" : loan.status === "repaid" ? "blue" : "amber"}>{loan.status}</Badge></div><div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><div className="rounded-xl border border-slate-200 p-3"><p className="text-xs text-slate-500">Disbursed</p><p className="mt-1 font-bold text-slate-900">GH₵{(loan.disbursedAmount ?? 0).toLocaleString()}</p></div><div className="rounded-xl border border-slate-200 p-3"><p className="text-xs text-slate-500">Outstanding</p><p className="mt-1 font-bold text-slate-900">GH₵{loan.outstanding.toLocaleString()}</p></div><div className="rounded-xl border border-slate-200 p-3"><p className="text-xs text-slate-500">Scheduled</p><p className="mt-1 font-bold text-slate-900">GH₵{totalScheduled.toLocaleString()}</p></div><div className="rounded-xl border border-slate-200 p-3"><p className="text-xs text-slate-500">Paid</p><p className="mt-1 font-bold text-emerald-700">GH₵{paidScheduled.toLocaleString()}</p></div></div><div><div className="mb-2 flex items-center justify-between"><h3 className="font-semibold text-slate-900">Installments</h3><span className="text-xs text-slate-500">{loan.repayments.length} payments</span></div><div className="overflow-hidden rounded-xl border border-slate-200"><div className="max-h-72 overflow-y-auto divide-y divide-slate-100">{loan.repayments.map((item) => <div key={item.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 p-3 text-sm"><div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-blue-700">{item.installment}</div><div><p className="font-medium text-slate-800">Due {new Date(item.dueDate).toLocaleDateString()}</p><p className="text-xs capitalize text-slate-500">{item.status} · Principal GH₵{item.principal.toLocaleString()}</p></div><div className="text-right"><p className="font-semibold text-slate-900">GH₵{(item.principal + item.interest).toLocaleString()}</p><p className="text-xs text-slate-500">Paid GH₵{item.paid.toLocaleString()}</p></div></div>)}{!loan.repayments.length && <p className="p-8 text-center text-sm text-slate-500">No repayment schedule yet.</p>}</div></div></div><div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">Close</button>{loan.status === "pending" && <button onClick={() => void approve()} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white">Approve</button>}{loan.status === "approved" && <button onClick={() => void disburse()} className="rounded-lg bg-[#102a43] px-4 py-2 text-sm font-semibold text-white">Disburse</button>}</div></div></Modal>;
}

function TransactionModal({ accounts, onClose, onSaved }: { accounts: AdminAccount[]; onClose: () => void; onSaved: (message: string) => Promise<void> }) {
  const [type, setType] = useState<"deposit" | "withdrawal" | "transfer" | "fee" | "refund" | "adjustment" | "collection" | "payment">("deposit");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [destinationAccountId, setDestinationAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const save = async () => { setSaving(true); setError(""); try { const value = Number(amount); if (!accountId || value <= 0) throw new Error("Select an account and enter an amount greater than zero."); if (type === "transfer" && (!destinationAccountId || destinationAccountId === accountId)) throw new Error("Select a different destination account."); const result = await executeFinancialTransaction({ type, accountId, destinationAccountId: type === "transfer" ? destinationAccountId : undefined, amount: value, currency: "GHS", description, idempotencyKey: crypto.randomUUID(), metadata: { source: "admin_portal" } }); await onSaved(`Transaction ${result.reference} completed.`); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to complete transaction."); } finally { setSaving(false); } };
  return <Modal title="New financial transaction" onClose={onClose}><div className="space-y-4"><p className="rounded-lg bg-blue-50 p-3 text-sm text-blue-800">Completed transactions are immutable. Use a reversal or adjustment for corrections.</p><label className="block text-sm font-semibold">Transaction type<select value={type} onChange={(event) => setType(event.target.value as typeof type)} className="mt-1 w-full rounded-lg border p-2.5 font-normal"><option value="deposit">Deposit</option><option value="withdrawal">Withdrawal</option><option value="transfer">Transfer</option><option value="fee">Fee</option><option value="refund">Refund</option><option value="adjustment">Adjustment</option><option value="collection">Collection</option><option value="payment">Payment</option></select></label><label className="block text-sm font-semibold">Account<select value={accountId} onChange={(event) => setAccountId(event.target.value)} className="mt-1 w-full rounded-lg border p-2.5 font-normal">{accounts.map((account) => <option key={account.id} value={account.id}>{account.accountNumber} · {account.clientName} · GH₵{account.balance.toLocaleString()}</option>)}</select></label>{type === "transfer" && <label className="block text-sm font-semibold">Destination account<select value={destinationAccountId} onChange={(event) => setDestinationAccountId(event.target.value)} className="mt-1 w-full rounded-lg border p-2.5 font-normal"><option value="">Select destination</option>{accounts.filter((account) => account.id !== accountId).map((account) => <option key={account.id} value={account.id}>{account.accountNumber} · {account.clientName}</option>)}</select></label>}<label className="block text-sm font-semibold">Amount (GH₵)<input type="number" min="0" value={amount} onChange={(event) => setAmount(event.target.value)} className="mt-1 w-full rounded-lg border p-2.5 font-normal" /></label><label className="block text-sm font-semibold">Description<textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={2} className="mt-1 w-full rounded-lg border p-2.5 font-normal" /></label>{error && <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}<div className="flex justify-end gap-2"><button onClick={onClose} className="rounded-lg border px-4 py-2 text-sm">Cancel</button><button onClick={() => void save()} disabled={saving || !accounts.length} className="rounded-lg bg-[#102a43] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Processing..." : "Confirm transaction"}</button></div></div></Modal>;
}

function Metric({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) { return <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center gap-2 text-blue-700">{icon}<span className="text-xs font-medium text-slate-500">{label}</span></div><div className="mt-3 text-xl font-bold">{value}</div></div>; }
function ListCard({ title, rows }: { title: string; rows: string[] }) { return <section className="rounded-xl border border-slate-200 bg-white p-5"><h3 className="font-bold">{title}</h3><div className="mt-3 space-y-3">{rows.map((row, index) => <div key={`${row}-${index}`} className="border-b border-slate-100 pb-2 text-sm text-slate-600">{row}</div>)}{!rows.length && <EmptyState text="No activity recorded." />}</div></section>; }
function TargetIcon() { return <TrendingUp size={18} />; }

function CompanyView() {
  const [company, setCompany] = useState<AdminCompany | null>(null);
  const [form, setForm] = useState({ name: "", legalName: "", registrationNumber: "", email: "", phone: "", address: "" });
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  useEffect(() => { loadAdminCompany().then((value) => { setCompany(value); if (value) setForm(value); }).catch((reason: Error) => setError(reason.message)); }, []);
  const update = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const save = async () => { if (!form.name.trim()) return setError("Company name is required."); try { await saveAdminCompany(form, company?.id); const latest = await loadAdminCompany(); setCompany(latest); setSaved("Company profile saved. You can now create branches."); setError(""); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to save company profile."); } };
  return <><div className="mb-7"><p className="mb-1 text-sm font-medium text-slate-500">Administration</p><h2 className="text-2xl font-bold tracking-tight">Company profile</h2><p className="mt-1 text-sm text-slate-500">Create your company profile before adding branches, bankers, or other company records.</p></div><div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]"><section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"><div className="mb-6"><h3 className="font-bold">Business information</h3><p className="mt-1 text-xs text-slate-500">This information is used by branches and company operations.</p></div><div className="grid gap-4 sm:grid-cols-2">{(["name", "legalName", "registrationNumber", "email", "phone", "address"] as const).map((key) => <label key={key} className="block text-sm font-medium text-slate-700">{key === "legalName" ? "Legal business name" : key === "registrationNumber" ? "Registration number" : key[0].toUpperCase() + key.slice(1)}<input value={form[key]} onChange={(event) => update(key, event.target.value)} type={key === "email" ? "email" : "text"} className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-500" /></label>)}</div>{error && <p className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}{saved && <p className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{saved}</p>}<button onClick={save} className="mt-6 rounded-lg bg-[#102a43] px-4 py-2.5 text-sm font-semibold text-white">{company ? "Save changes" : "Create company profile"}</button></section><section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"><div className="mb-6 flex items-center justify-between"><div><h3 className="font-bold">Company settings</h3><p className="mt-1 text-xs text-slate-500">Control how your company operates.</p></div><Settings2 size={18} className="text-slate-400" /></div><div className="space-y-5"><Toggle label="Require approval for withdrawals" enabled /><Toggle label="Send daily collection summary" enabled /><Toggle label="Allow banker self-assignment" /><Toggle label="Enable email notifications" enabled /></div></section></div></>;
}

function Info({ label, value }: { label: string; value: string }) { return <div className="min-w-0"><div className="text-xs font-medium text-slate-400">{label}</div><div className="mt-1 break-words text-sm font-semibold text-slate-700">{value}</div></div>; }
function Toggle({ label, enabled = false }: { label: string; enabled?: boolean }) { const [on, setOn] = useState(enabled); return <div className="flex items-center justify-between gap-4"><span className="text-sm text-slate-600">{label}</span><button onClick={() => setOn(!on)} className={`relative h-6 w-11 rounded-full transition ${on ? "bg-[#1d6fa5]" : "bg-slate-200"}`}><span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition ${on ? "left-6" : "left-1"}`} /></button></div>; }
function RolesView({ roles, onAction }: { roles: AdminRole[]; onAction: () => void }) { return <><div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="mb-1 text-sm font-medium text-slate-500">Administration</p><h2 className="text-2xl font-bold tracking-tight">Roles & permissions</h2><p className="mt-1 text-sm text-slate-500">Control what each team member can see and do.</p></div><button onClick={onAction} className="flex items-center justify-center gap-2 rounded-lg bg-[#102a43] px-4 py-2.5 text-sm font-semibold text-white"><Plus size={16} />Create role</button></div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{roles.map((role) => <div key={role.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-600"><ShieldCheck size={19} /></div><h3 className="mt-4 font-bold">{role.name}</h3><p className="mt-1 min-h-10 text-sm text-slate-500">{role.description || "No description provided."}</p><div className="mt-4 border-t border-slate-100 pt-4 text-xs font-semibold text-slate-600">{role.users.toLocaleString()} users</div></div>)}{!roles.length && <p className="text-sm text-slate-500">No roles found.</p>}</div></>; }
function WavesIcon() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M2 12c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2M2 17c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2M2 7c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2" /></svg>; }
