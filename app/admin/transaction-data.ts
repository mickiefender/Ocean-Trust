import { createClient } from "@/lib/supabase/client";

export type AdminTransaction = { id: string; reference: string; type: string; amount: number; currency: string; status: string; accountNumber: string; clientId: string; clientName: string; createdAt: string; recordedBy: string };
export async function loadAdminTransactions(): Promise<AdminTransaction[]> {
  const supabase = createClient();
  const [{ data, error }, { data: auditRows, error: auditError }] = await Promise.all([
    supabase.from("transactions").select("id,reference,type,amount,currency,status,created_at,account:accounts(account_number,client_id),client:clients(id,full_name,client_number)").order("created_at", { ascending: false }).limit(200),
    supabase.from("audit_logs").select("record_id,table_name,new_values,profile:profiles(first_name,last_name,email)").in("table_name", ["transactions", "collections"]).order("created_at", { ascending: false }).limit(500),
  ]);
  if (error) throw new Error(error.message);
  if (auditError) throw new Error(auditError.message);
  const auditByTransaction = new Map<string, string>();
  for (const audit of (auditRows ?? []) as unknown as Record<string, unknown>[]) {
    const values = (audit.new_values ?? {}) as Record<string, unknown>;
    const transactionId = String(audit.table_name === "transactions" ? audit.record_id ?? "" : values.transaction_id ?? "");
    if (!transactionId || auditByTransaction.has(transactionId)) continue;
    const profile = Array.isArray(audit.profile) ? audit.profile[0] as Record<string, unknown> | undefined : audit.profile as Record<string, unknown> | null;
    const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim() || String(profile?.email ?? "");
    auditByTransaction.set(transactionId, name || "Unknown user");
  }
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => {
    const account = Array.isArray(row.account) ? row.account[0] as Record<string, unknown> | undefined : row.account as Record<string, unknown> | null;
    const client = Array.isArray(row.client) ? row.client[0] as Record<string, unknown> | undefined : row.client as Record<string, unknown> | null;
    return { id: String(row.id), reference: String(row.reference), type: String(row.type), amount: Number(row.amount), currency: String(row.currency), status: String(row.status), accountNumber: String(account?.account_number ?? "—"), clientId: String(client?.id ?? account?.client_id ?? ""), clientName: String(client?.full_name ?? client?.client_number ?? "—"), createdAt: String(row.created_at), recordedBy: auditByTransaction.get(String(row.id)) ?? "System" };
  });
}

export async function executeFinancialTransaction(input: { type: "deposit" | "withdrawal" | "transfer" | "fee" | "refund" | "adjustment" | "collection" | "payment"; accountId: string; destinationAccountId?: string; amount: number; currency: string; description: string; idempotencyKey: string; metadata?: Record<string, unknown> }) {
  const { data, error } = await createClient().rpc("execute_financial_transaction", { p_type: input.type, p_account_id: input.accountId, p_destination_account_id: input.destinationAccountId || null, p_amount: input.amount, p_currency: input.currency, p_idempotency_key: input.idempotencyKey, p_description: input.description || null, p_metadata: input.metadata ?? {}, p_reversal_of: null }).single();
  if (error) throw new Error(error.message);
  return data as { id: string; reference: string; status: string };
}
