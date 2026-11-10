import { createClient } from "@/lib/supabase/client";

export type AdminLoan = {
  id: string; loanNumber: string; clientId: string; clientName: string; accountId: string | null;
  productName: string; principal: number; interestRate: number; termMonths: number; outstanding: number;
  approvedAmount: number | null; disbursedAmount: number | null;
  status: string; source: "loan" | "application" | "legacy_application"; maturityDate: string | null; createdAt: string;
  repayments: { id: string; installment: number; dueDate: string; principal: number; interest: number; paid: number; status: string }[];
};
export type LoanProduct = { id: string; name: string; code: string; interestRate: number; termMonths: number; minimumAmount: number; maximumAmount: number; repaymentStartDays: number };
type Row = Record<string, unknown>;
const one = (value: unknown): Row | null => Array.isArray(value) ? ((value[0] as Row | undefined) ?? null) : (value as Row | null);

export async function loadAdminLoans(): Promise<{ loans: AdminLoan[]; products: LoanProduct[] }> {
  const supabase = createClient();
  const [{ data, error }, { data: applications, error: applicationError }, { data: clients, error: clientError }, { data: products, error: productError }] = await Promise.all([
    supabase.from("loans").select("id,loan_number,client_id,account_id,principal_amount,interest_rate,term_months,outstanding_amount,status,maturity_date,created_at,client:clients(full_name,client_number),loan_product:loan_products(name),repayments:loan_repayments(id,installment_number,due_date,principal_amount,interest_amount,paid_amount,status)").order("created_at", { ascending: false }),
    supabase.from("loan_applications").select("id,loan_id,application_number,client_id,account_id,principal_amount,interest_rate,duration_months,decision,approved_amount,approved_interest_rate,approved_duration_months,created_at,client:clients(full_name,client_number),loan_product:loan_products(name)").order("created_at", { ascending: false }),
    supabase.from("clients").select("id,client_number,full_name,loan_principal_amount,loan_interest_rate,loan_duration,approved_amount,official_interest_rate,official_duration,created_at").eq("loan_approved", true),
    supabase.from("loan_products").select("id,name,code,interest_rate,term_months,minimum_amount,maximum_amount,repayment_start_days").eq("status", "active").order("name"),
  ]);
  if (error) throw new Error(error.message); if (applicationError) throw new Error(applicationError.message); if (clientError) throw new Error(clientError.message); if (productError) throw new Error(productError.message);
  const today = new Date().toISOString().slice(0, 10);
  const clientsWithLoanRecords = new Set([
    ...((data ?? []) as unknown as Row[]).map((row) => String(row.client_id)),
    ...((applications ?? []) as unknown as Row[]).map((row) => String(row.client_id)),
  ]);
  return {
    loans: [
      ...((applications ?? []) as unknown as Row[]).filter((row) => row.decision === "pending" && !row.loan_id).map((row) => {
        const client = one(row.client); const product = one(row.loan_product);
        return { id: String(row.id), loanNumber: String(row.application_number), clientId: String(row.client_id), clientName: String(client?.full_name ?? client?.client_number ?? "Unnamed client"), accountId: row.account_id ? String(row.account_id) : null, productName: String(product?.name ?? "Loan application"), principal: Number(row.principal_amount), interestRate: Number(row.interest_rate), termMonths: Number(row.duration_months), outstanding: Number(row.principal_amount), approvedAmount: null, disbursedAmount: null, status: "pending", source: "application" as const, maturityDate: null, createdAt: String(row.created_at), repayments: [] };
      }),
      ...((applications ?? []) as unknown as Row[]).filter((row) => row.decision === "approved" && !row.loan_id).map((row) => {
        const client = one(row.client); const product = one(row.loan_product);
        const approvedAmount = Number(row.approved_amount ?? row.principal_amount);
        return { id: `legacy-application:${String(row.id)}`, loanNumber: String(row.application_number), clientId: String(row.client_id), clientName: String(client?.full_name ?? client?.client_number ?? "Unnamed client"), accountId: row.account_id ? String(row.account_id) : null, productName: String(product?.name ?? "Approved application"), principal: approvedAmount, interestRate: Number(row.approved_interest_rate ?? row.interest_rate), termMonths: Number(row.approved_duration_months ?? row.duration_months), outstanding: 0, approvedAmount, disbursedAmount: null, status: "approved", source: "legacy_application" as const, maturityDate: null, createdAt: String(row.created_at), repayments: [] };
      }),
      ...((clients ?? []) as unknown as Row[]).filter((row) => !clientsWithLoanRecords.has(String(row.id))).flatMap((row) => {
        const approvedAmount = Number(row.approved_amount ?? row.loan_principal_amount);
        if (!Number.isFinite(approvedAmount) || approvedAmount <= 0) return [];
        const rawTerm = String(row.official_duration ?? row.loan_duration ?? "");
        const termValue = Number(rawTerm.replace(/[^\d.]/g, ""));
        const termMonths = /year/i.test(rawTerm) ? termValue * 12 : termValue;
        return [{
          id: `legacy-client:${String(row.id)}`,
          loanNumber: `LEGACY-${String(row.client_number)}`,
          clientId: String(row.id),
          clientName: String(row.full_name ?? row.client_number ?? "Unnamed client"),
          accountId: null,
          productName: "Approved legacy loan",
          principal: approvedAmount,
          interestRate: Number(row.official_interest_rate ?? row.loan_interest_rate ?? 0),
          termMonths: Number.isFinite(termMonths) ? termMonths : 0,
          outstanding: 0,
          approvedAmount,
          disbursedAmount: null,
          status: "approved",
          source: "legacy_application" as const,
          maturityDate: null,
          createdAt: String(row.created_at),
          repayments: [],
        }];
      }),
      ...((data ?? []) as unknown as Row[]).map((row) => {
      const client = one(row.client); const product = one(row.loan_product);
      const repayments = ((row.repayments as Row[] | null) ?? []).map((repayment) => {
        const dueDate = String(repayment.due_date); const rawStatus = String(repayment.status);
        return { id: String(repayment.id), installment: Number(repayment.installment_number), dueDate, principal: Number(repayment.principal_amount), interest: Number(repayment.interest_amount), paid: Number(repayment.paid_amount), status: rawStatus === "pending" && dueDate < today ? "overdue" : rawStatus };
      });
        const status = String(row.status);
        const principal = Number(row.principal_amount);
        return { id: String(row.id), loanNumber: String(row.loan_number), clientId: String(row.client_id), clientName: String(client?.full_name ?? client?.client_number ?? "Unnamed client"), accountId: row.account_id ? String(row.account_id) : null, productName: String(product?.name ?? "Loan"), principal, interestRate: Number(row.interest_rate), termMonths: Number(row.term_months), outstanding: Number(row.outstanding_amount), approvedAmount: ["approved", "active", "repaid", "defaulted"].includes(status) ? principal : null, disbursedAmount: ["active", "repaid", "defaulted"].includes(status) ? principal : null, status, source: "loan" as const, maturityDate: row.maturity_date ? String(row.maturity_date) : null, createdAt: String(row.created_at), repayments };
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

export async function editLoanAmount(id: string, amount: number) {
  const recordId = id.startsWith("legacy-application:") ? id.slice("legacy-application:".length) : id;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(recordId)) {
    throw new Error("This legacy loan has no editable loan application record.");
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Loan amount must be greater than zero.");
  }
  const { error } = await createClient().rpc("update_loan_amount", { p_record_id: recordId, p_amount: amount });
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
