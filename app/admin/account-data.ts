import { createClient } from "@/lib/supabase/client";

export type AdminAccount = {
  id: string;
  accountNumber: string;
  clientId: string;
  clientName: string;
  typeId: string;
  typeName: string;
  currency: string;
  balance: number;
  availableBalance: number;
  status: "Pending" | "Active" | "Frozen" | "Closed";
  dailyLimit: number;
  monthlyLimit: number;
  openedAt: string;
  transactions: { id: string; reference: string; type: string; amount: number; status: string; description: string; date: string }[];
};

type Row = Record<string, unknown>;
const relation = (row: Row, key: string): Row | null => {
  const value = row[key];
  return Array.isArray(value) ? ((value[0] as Row | undefined) ?? null) : (value as Row | null);
};
const statusLabel = (value: unknown): AdminAccount["status"] => ({ pending: "Pending", active: "Active", frozen: "Frozen", closed: "Closed" }[String(value)] ?? "Pending") as AdminAccount["status"];

export async function loadAdminAccounts(): Promise<{ accounts: AdminAccount[]; types: { id: string; name: string; code: string }[] }> {
  const supabase = createClient();
  const [{ data, error }, { data: types, error: typeError }] = await Promise.all([
    supabase.from("accounts").select("id,account_number,client_id,currency,balance,available_balance,status,daily_limit,monthly_limit,opened_at,client:clients(id,full_name,client_number),account_type:account_types(id,name,code),transactions(id,reference,type,amount,status,description,created_at)").order("created_at", { ascending: false }),
    supabase.from("account_types").select("id,name,code").eq("status", "active").order("name"),
  ]);
  if (error) throw new Error(error.message);
  if (typeError) throw new Error(typeError.message);
  const accounts = ((data ?? []) as unknown as Row[]).map((row) => {
    const client = relation(row, "client");
    const type = relation(row, "account_type");
    const transactions = ((row.transactions as Row[] | null) ?? []).map((transaction) => ({ id: String(transaction.id), reference: String(transaction.reference), type: String(transaction.type), amount: Number(transaction.amount ?? 0), status: String(transaction.status), description: String(transaction.description ?? ""), date: String(transaction.created_at) }));
    return { id: String(row.id), accountNumber: String(row.account_number), clientId: String(row.client_id), clientName: String(client?.full_name ?? client?.client_number ?? "Unnamed client"), typeId: String(type?.id ?? row.account_type_id), typeName: String(type?.name ?? "Account"), currency: String(row.currency), balance: Number(row.balance ?? 0), availableBalance: Number(row.available_balance ?? 0), status: statusLabel(row.status), dailyLimit: Number(row.daily_limit ?? 0), monthlyLimit: Number(row.monthly_limit ?? 0), openedAt: String(row.opened_at), transactions };
  });
  return { accounts, types: ((types ?? []) as unknown as Row[]).map((type) => ({ id: String(type.id), name: String(type.name), code: String(type.code) })) };
}

export async function createAdminAccount(input: { clientId: string; accountTypeId: string; currency: string; dailyLimit: number; monthlyLimit: number }) {
  const supabase = createClient();
  const { data: latest, error: lookupError } = await supabase.from("accounts").select("account_number").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (lookupError) throw new Error(lookupError.message);
  const previous = String(latest?.account_number ?? "").match(/(\d+)$/);
  const next = String((previous ? Number(previous[1]) : 0) + 1).padStart(8, "0");
  const { error } = await supabase.from("accounts").insert({ client_id: input.clientId, account_type_id: input.accountTypeId, account_number: `OT-ACC-${next}`, currency: "GHS", balance: 0, available_balance: 0, daily_limit: Math.max(0, input.dailyLimit), monthly_limit: Math.max(0, input.monthlyLimit), status: "active" });
  if (error) throw new Error(error.message);
}

export async function setAdminAccountStatus(id: string, active: boolean) {
  const { error } = await createClient().from("accounts").update({ status: active ? "active" : "frozen" }).eq("id", id);
  if (error) throw new Error(error.message);
}
