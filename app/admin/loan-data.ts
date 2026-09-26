import { createClient } from "@/lib/supabase/client";

export type AdminLoan = {
  id: string; loanNumber: string; clientId: string; clientName: string; accountId: string | null;
  productName: string; principal: number; interestRate: number; termMonths: number; outstanding: number;
  approvedAmount: number | null; disbursedAmount: number | null;
  status: string; maturityDate: string | null; createdAt: string;
  repayments: { id: string; installment: number; dueDate: string; principal: number; interest: number; paid: number; status: string }[];
};
export type LoanProduct = { id: string; name: string; code: string; interestRate: number; termMonths: number; minimumAmount: number; maximumAmount: number; repaymentStartDays: number };
type Row = Record<string, unknown>;
const one = (value: unknown): Row | null => Array.isArray(value) ? ((value[0] as Row | undefined) ?? null) : (value as Row | null);

export async function loadAdminLoans(): Promise<{ loans: AdminLoan[]; products: LoanProduct[] }> {
  const supabase = createClient();
  const [{ data, error }, { data: applications, error: applicationError }, { data: products, error: productError }] = await Promise.all([
    supabase.from("loans").select("id,loan_number,client_id,account_id,principal_amount,interest_rate,term_months,outstanding_amount,status,maturity_date,created_at,client:clients(full_name,client_number),loan_product:loan_products(name),repayments:loan_repayments(id,installment_number,due_date,principal_amount,interest_amount,paid_amount,status)").order("created_at", { ascending: false }),
    supabase.from("loan_applications").select("id,application_number,client_id,account_id,principal_amount,interest_rate,duration_months,decision,created_at,client:clients(full_name,client_number),loan_product:loan_products(name)").order("created_at", { ascending: false }),
    supabase.from("loan_products").select("id,name,code,interest_rate,term_months,minimum_amount,maximum_amount,repayment_start_days").eq("status", "active").order("name"),
  ]);
  if (error) throw new Error(error.message); if (applicationError) throw new Error(applicationError.message); if (productError) throw new Error(productError.message);
  const today = new Date().toISOString().slice(0, 10);
  return {
    loans: [
      ...((applications ?? []) as unknown as Row[]).filter((row) => row.decision === "pending").map((row) => {
        const client = one(row.client); const product = one(row.loan_product);
        return { id: String(row.id), loanNumber: String(row.application_number), clientId: String(row.client_id), clientName: String(client?.full_name ?? client?.client_number ?? "Unnamed client"), accountId: row.account_id ? String(row.account_id) : null, productName: String(product?.name ?? "Loan application"), principal: Number(row.principal_amount), interestRate: Number(row.interest_rate), termMonths: Number(row.duration_months), outstanding: Number(row.principal_amount), approvedAmount: null, disbursedAmount: null, status: "pending", maturityDate: null, createdAt: String(row.created_at), repayments: [] };
      }),
      ...((data ?? []) as unknown as Row[]).map((row) => {
      const client = one(row.client); const product = one(row.loan_product);
      const repayments = ((row.repayments as Row[] | null) ?? []).map((repayment) => {
        const dueDate = String(repayment.due_date); const rawStatus = String(repayment.status);
        return { id: String(repayment.id), installment: Number(repayment.installment_number), dueDate, principal: Number(repayment.principal_amount), interest: Number(repayment.interest_amount), paid: Number(repayment.paid_amount), status: rawStatus === "pending" && dueDate < today ? "overdue" : rawStatus };
      });
        const status = String(row.status);
        const principal = Number(row.principal_amount);
        return { id: String(row.id), loanNumber: String(row.loan_number), clientId: String(row.client_id), clientName: String(client?.full_name ?? client?.client_number ?? "Unnamed client"), accountId: row.account_id ? String(row.account_id) : null, productName: String(product?.name ?? "Loan"), principal, interestRate: Number(row.interest_rate), termMonths: Number(row.term_months), outstanding: Number(row.outstanding_amount), approvedAmount: ["approved", "active", "repaid", "defaulted"].includes(status) ? principal : null, disbursedAmount: ["active", "repaid", "defaulted"].includes(status) ? principal : null, status, maturityDate: row.maturity_date ? String(row.maturity_date) : null, createdAt: String(row.created_at), repayments };
      }),
    ],
    products: ((products ?? []) as unknown as Row[]).map((row) => ({ id: String(row.id), name: String(row.name), code: String(row.code), interestRate: Number(row.interest_rate), termMonths: Number(row.term_months), minimumAmount: Number(row.minimum_amount), maximumAmount: Number(row.maximum_amount), repaymentStartDays: Number(row.repayment_start_days ?? 30) })),
  };
}

export async function createLoanProduct(input: { name: string; code: string; interestRate: number; termMonths: number; minimumAmount: number; maximumAmount: number; repaymentStartDays: number }) {
  const { error } = await createClient().from("loan_products").insert({ name: input.name.trim(), code: input.code.trim().toUpperCase(), interest_rate: input.interestRate, term_months: input.termMonths, minimum_amount: input.minimumAmount, maximum_amount: input.maximumAmount, repayment_start_days: input.repaymentStartDays, status: "active" });
  if (error) throw new Error(error.message);
}

export async function createLoanApplication(input: { clientId: string; productId: string; accountId: string; amount: number }) {
  const { data, error } = await createClient().rpc("create_loan_application", { p_client_id: input.clientId, p_product_id: input.productId, p_account_id: input.accountId, p_amount: input.amount, p_currency: "GHS" }).single();
  if (error) throw new Error(error.message);
  return data as { id: string; application_number: string };
}

export async function approveLoan(id: string, approvedAmount: number) {
  const { error } = await createClient().rpc("approve_loan_application", { p_application_id: id, p_amount: approvedAmount });
  if (error) throw new Error(error.message);
}

export async function disburseLoan(id: string) {
  const { error } = await createClient().rpc("disburse_loan", { p_loan_id: id });
  if (error) throw new Error(error.message);
}

export async function recordLoanRepayment(input: { loanId: string; accountId: string; amount: number; idempotencyKey: string }) {
  const { data, error } = await createClient().rpc("record_loan_repayment", { p_loan_id: input.loanId, p_account_id: input.accountId, p_amount: input.amount, p_idempotency_key: input.idempotencyKey }).single();
  if (error) throw new Error(error.message);
  return data as { transaction_reference: string };
}
