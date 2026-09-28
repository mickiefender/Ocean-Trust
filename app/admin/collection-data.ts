import { createClient } from "@/lib/supabase/client";
import {
  clientLabel,
  rowList,
  rowNumber,
  rowValue,
  type DataRow,
} from "./record-labels";

export type CollectionPayment = {
  id: string;
  reference: string;
  amount: number;
  method: string;
  paidAt: string;
  loanId: string | null;
};

export type CollectionRow = {
  id: string;
  clientId: string;
  clientName: string;
  clientNumber: string;
  accountId: string | null;
  accountNumber: string;
  loanId: string | null;
  loanNumber: string;
  loanOutstanding: number | null;
  totalAmount: number;
  collectedAmount: number;
  remaining: number;
  progress: number;
  dueDate: string;
  status: string;
  isOverdue: boolean;
  frequency: string;
  scheduledAmount: number;
  method: string;
  reference: string;
  history: CollectionPayment[];
};

export type CollectionAccount = {
  id: string;
  clientId: string;
  accountNumber: string;
  currency: string;
  balance: number;
  status: string;
};

export type CollectionClient = { id: string; name: string };

export type CollectionLoan = {
  id: string;
  clientId: string;
  loanNumber: string;
  productName: string;
  outstanding: number;
  status: string;
};

export type RecordCollectionResult = {
  collection_id: string;
  transaction_id: string;
  transaction_reference: string;
  receipt_reference: string;
  loan_id: string | null;
  loan_outstanding: number | null;
  collection_status: string;
};

export type CollectionPaymentMethod =
  | "cash"
  | "bank_transfer"
  | "card"
  | "mobile_money"
  | "direct_debit"
  | "other";

export type CollectionBundle = {
  collections: CollectionRow[];
  accounts: CollectionAccount[];
  clients: CollectionClient[];
  loans: CollectionLoan[];
};

export async function loadCollections(): Promise<CollectionBundle> {
  const supabase = createClient();
  const [collectionResult, accountResult, clientResult, loanResult] = await Promise.all([
    supabase
      .from("collections")
      .select(
        "id,client_id,account_id,loan_id,reference,total_amount,collected_amount,due_date,status,collection_method,client:clients(full_name,first_name,last_name,client_number),account:accounts(account_number),loan:loans(id,loan_number,outstanding_amount,status),collection_schedules(frequency,amount,next_due_date,active),payments(id,reference,amount,method,paid_at,loan_id)",
      )
      .order("due_date", { ascending: false }),
    supabase
      .from("accounts")
      .select("id,client_id,account_number,currency,balance,status")
      .order("account_number"),
    supabase
      .from("clients")
      .select("id,full_name,first_name,last_name,client_number")
      .order("full_name"),
    supabase
      .from("loans")
      .select("id,client_id,loan_number,outstanding_amount,status,loan_product:loan_products(name)")
      .order("created_at", { ascending: false }),
  ]);

  if (collectionResult.error) throw new Error(collectionResult.error.message);
  if (accountResult.error) throw new Error(accountResult.error.message);
  if (clientResult.error) throw new Error(clientResult.error.message);
  if (loanResult.error) throw new Error(loanResult.error.message);

  const today = new Date().toISOString().slice(0, 10);

  const collections: CollectionRow[] = ((collectionResult.data ?? []) as unknown as DataRow[]).map(
    (row) => {
      const client = rowValue(row.client);
      const account = rowValue(row.account);
      const loan = rowValue(row.loan);
      const schedules = rowList(row.collection_schedules);
      const schedule = schedules.find((item) => item.active !== false) ?? schedules[0];
      const dueDate = String(schedule?.next_due_date ?? row.due_date ?? "");
      const totalAmount = rowNumber(row.total_amount);
      const collectedAmount = rowNumber(row.collected_amount);
      const remaining = Math.max(totalAmount - collectedAmount, 0);
      const rawStatus = String(row.status ?? "pending");
      const isOverdue = remaining > 0 && rawStatus !== "cancelled" && dueDate < today;

      return {
        id: String(row.id),
        clientId: String(row.client_id),
        clientName: clientLabel(client, "Unnamed client"),
        clientNumber: String(client?.client_number ?? ""),
        accountId: row.account_id ? String(row.account_id) : null,
        accountNumber: String(account?.account_number ?? "Unassigned"),
        loanId: row.loan_id ? String(row.loan_id) : null,
        loanNumber: String(loan?.loan_number ?? ""),
        loanOutstanding: loan ? rowNumber(loan.outstanding_amount) : null,
        totalAmount,
        collectedAmount,
        remaining,
        progress:
          totalAmount > 0 ? Math.min(100, Math.round((collectedAmount / totalAmount) * 100)) : 0,
        dueDate,
        status: isOverdue ? "overdue" : rawStatus,
        isOverdue,
        frequency: String(schedule?.frequency ?? "once"),
        scheduledAmount: rowNumber(schedule?.amount ?? row.total_amount),
        method: String(row.collection_method ?? "cash"),
        reference: String(row.reference),
        history: rowList(row.payments)
          .map((payment) => ({
            id: String(payment.id),
            reference: String(payment.reference),
            amount: rowNumber(payment.amount),
            method: String(payment.method),
            paidAt: String(payment.paid_at),
            loanId: payment.loan_id ? String(payment.loan_id) : null,
          }))
          .sort((a, b) => b.paidAt.localeCompare(a.paidAt)),
      };
    },
  );

  return {
    collections,
    accounts: ((accountResult.data ?? []) as unknown as DataRow[]).map((row) => ({
      id: String(row.id),
      clientId: String(row.client_id),
      accountNumber: String(row.account_number),
      currency: String(row.currency),
      balance: rowNumber(row.balance),
      status: String(row.status),
    })),
    clients: ((clientResult.data ?? []) as unknown as DataRow[]).map((row) => ({
      id: String(row.id),
      name: clientLabel(row, "Unnamed client"),
    })),
    loans: ((loanResult.data ?? []) as unknown as DataRow[])
      .map((row) => ({
        id: String(row.id),
        clientId: String(row.client_id),
        loanNumber: String(row.loan_number),
        productName: String(rowValue(row.loan_product)?.name ?? "Loan"),
        outstanding: rowNumber(row.outstanding_amount),
        status: String(row.status),
      }))
      .filter((loan) => loan.status === "active" && loan.outstanding > 0),
  };
}

export async function recordCollection(input: {
  collectionId: string;
  clientId: string;
  accountId: string;
  amount: number;
  method: CollectionPaymentMethod;
  description: string;
  idempotencyKey: string;
}): Promise<RecordCollectionResult> {
  const { data, error } = await createClient()
    .rpc("record_collection", {
      p_collection_id: input.collectionId,
      p_client_id: input.clientId,
      p_account_id: input.accountId,
      p_amount: input.amount,
      p_method: input.method,
      p_idempotency_key: input.idempotencyKey,
      p_description: input.description || null,
    })
    .single();

  if (error) throw new Error(error.message);

  const result = data as unknown as DataRow;

  return {
    collection_id: String(result.collection_id),
    transaction_id: String(result.transaction_id),
    transaction_reference: String(result.transaction_reference),
    receipt_reference: String(result.receipt_reference),
    loan_id: result.loan_id ? String(result.loan_id) : null,
    loan_outstanding:
      result.loan_outstanding === null || result.loan_outstanding === undefined
        ? null
        : rowNumber(result.loan_outstanding),
    collection_status: String(result.collection_status ?? ""),
  };
}

export async function createCollectionSchedule(input: {
  clientId: string;
  accountId: string;
  loanId?: string | null;
  totalAmount: number;
  amount: number;
  dueDate: string;
  frequency: "daily" | "weekly" | "monthly";
}) {
  const supabase = createClient();
  const reference = `SCH-${crypto.randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;

  const { data: collection, error } = await supabase
    .from("collections")
    .insert({
      client_id: input.clientId,
      account_id: input.accountId,
      loan_id: input.loanId || null,
      reference,
      total_amount: input.totalAmount,
      due_date: input.dueDate,
      status: "pending",
    })
    .select("id")
    .single();

  if (error || !collection) {
    throw new Error(error?.message ?? "Unable to create collection schedule.");
  }

  const { error: scheduleError } = await supabase.from("collection_schedules").insert({
    collection_id: collection.id,
    frequency: input.frequency,
    next_due_date: input.dueDate,
    amount: input.amount,
    active: true,
  });
  if (scheduleError) throw new Error(scheduleError.message);
}

export async function linkCollectionToLoan(collectionId: string, loanId: string) {
  const { error } = await createClient().rpc("link_collection_to_loan", {
    p_collection_id: collectionId,
    p_loan_id: loanId,
  });
  if (error) throw new Error(error.message);
}
