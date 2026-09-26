import { createAdminClient } from "@/lib/supabase/admin";
import {
  CLIENT_SELECT,
  mapClientRecord,
  text,
  type AdminClient,
  type Row,
} from "./client-mapper";
import {
  formatClientNumber,
  type BankerOption,
  type BranchOption,
  type IntakePayload,
  type LoanApplicationRowPayload,
} from "./client-intake";

export type DbClient = ReturnType<typeof createAdminClient>;

export type { BankerOption, BranchOption };

const DEFAULT_COMPANY_NAME = "Ocean Trust Micro Credit";
const DEFAULT_COMPANY_REGISTRATION = "OT-MC-0001";
const DEFAULT_BRANCH_NAME = "Head Office";
const DEFAULT_BRANCH_CODE = "BR-001";
const CLIENT_NUMBER_PATTERN = /^OT-\d{4}-(\d{1,6})$/;
const MAX_CLIENT_NUMBER_SEQUENCE = 999_999;

type DbErrorShape = { message?: string; code?: string; details?: string | null };

export function describeDbError(error: unknown): string {
  const dbError = (error ?? {}) as DbErrorShape;
  const code = dbError.code ?? "";
  const detail = `${dbError.details ?? ""} ${dbError.message ?? ""}`;

  if (code === "23505") {
    if (detail.includes("national_id")) {
      return "Another client is already registered with that national ID number.";
    }
    if (detail.includes("client_number")) {
      return "That account number is already used by a client in this branch.";
    }
    if (detail.includes("application_number")) {
      return "That loan application number is already in use.";
    }
    return "A record with those details already exists.";
  }
  if (code === "23503") return "A linked record is missing. Check the selected branch.";
  if (code === "23514") return "One of the values does not meet the required rules.";
  if (code === "23502") return "A required field was not provided.";
  if (code === "42P01") {
    return "The database is missing required tables. Apply the latest Supabase migration and try again.";
  }
  if (code === "42703") {
    return "The database is missing required columns. Apply the latest Supabase migration and try again.";
  }
  return dbError.message || "Something went wrong while saving. Please try again.";
}

export async function loadBranchOptions(admin: DbClient): Promise<BranchOption[]> {
  const { data, error } = await admin
    .from("branches")
    .select("id,name,code")
    .order("name", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as Row[]).map((row) => ({
    id: text(row.id),
    name: text(row.name),
    code: text(row.code),
  }));
}

export async function loadBankerOptions(admin: DbClient): Promise<BankerOption[]> {
  const { data, error } = await admin
    .from("bankers")
    .select("id,branch_id,profile:profiles(first_name,last_name)")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as Row[]).map((row) => {
    const profile = (row.profile ?? null) as Row | null;
    const name = [text(profile?.first_name), text(profile?.last_name)]
      .filter(Boolean)
      .join(" ");
    return {
      id: text(row.id),
      name: name || "Unnamed banker",
      branchId: text(row.branch_id),
    };
  });
}

export async function resolveBranchId(
  admin: DbClient,
  preferredBranchId: string,
): Promise<string> {
  const preferred = preferredBranchId.trim();
  if (preferred) {
    const { data, error } = await admin
      .from("branches")
      .select("id")
      .eq("id", preferred)
      .maybeSingle();
    if (error) throw error;
    if (data?.id) return String(data.id);
  }

  const { data: existing, error: existingError } = await admin
    .from("branches")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing?.id) return String(existing.id);

  return createDefaultBranch(admin);
}

async function createDefaultBranch(admin: DbClient): Promise<string> {
  const { data: existingCompany, error: companyError } = await admin
    .from("companies")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (companyError) throw companyError;

  let companyId = existingCompany?.id ? String(existingCompany.id) : "";

  if (!companyId) {
    const { data: createdCompany, error: createCompanyError } = await admin
      .from("companies")
      .insert({
        name: DEFAULT_COMPANY_NAME,
        legal_name: DEFAULT_COMPANY_NAME,
        registration_number: DEFAULT_COMPANY_REGISTRATION,
        status: "active",
      })
      .select("id")
      .single();
    if (createCompanyError) throw createCompanyError;
    companyId = String(createdCompany.id);
  }

  const { data: createdBranch, error: createBranchError } = await admin
    .from("branches")
    .insert({
      company_id: companyId,
      name: DEFAULT_BRANCH_NAME,
      code: DEFAULT_BRANCH_CODE,
      status: "active",
    })
    .select("id")
    .single();

  if (!createBranchError && createdBranch?.id) return String(createdBranch.id);

  const { data: fallback } = await admin
    .from("branches")
    .select("id")
    .eq("company_id", companyId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (fallback?.id) return String(fallback.id);

  throw createBranchError ?? new Error("Unable to prepare a branch for this client.");
}

export async function nextClientNumber(admin: DbClient, branchId: string): Promise<string> {
  const { data, error } = await admin
    .from("clients")
    .select("client_number")
    .eq("branch_id", branchId);
  if (error) throw error;

  const used = new Set(((data ?? []) as Row[]).map((row) => text(row.client_number)));
  const highest = Array.from(used).reduce((max, value) => {
    const match = CLIENT_NUMBER_PATTERN.exec(value);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);

  let sequence = highest + 1;
  let candidate = formatClientNumber(sequence);
  while (used.has(candidate) && sequence < MAX_CLIENT_NUMBER_SEQUENCE) {
    sequence += 1;
    candidate = formatClientNumber(sequence);
  }
  return candidate;
}

export async function loadClientById(admin: DbClient, clientId: string): Promise<AdminClient> {
  const { data, error } = await admin
    .from("clients")
    .select(CLIENT_SELECT)
    .eq("id", clientId)
    .single();
  if (error) throw error;
  return mapClientRecord(data as unknown as Row, []);
}

async function syncBankerAssignment(
  admin: DbClient,
  clientId: string,
  bankerId: string,
): Promise<void> {
  const { data: current, error } = await admin
    .from("client_banker_assignments")
    .select("id,banker_id")
    .eq("client_id", clientId)
    .eq("status", "active");
  if (error) throw error;

  const active = (current ?? []) as Row[];
  const target = bankerId.trim();

  if (target && active.some((row) => text(row.banker_id) === target)) return;
  if (!target && active.length === 0) return;

  if (active.length) {
    const { error: endError } = await admin
      .from("client_banker_assignments")
      .update({ status: "inactive", ended_at: new Date().toISOString() })
      .eq("client_id", clientId)
      .eq("status", "active");
    if (endError) throw endError;
  }

  if (target) {
    const { error: assignError } = await admin
      .from("client_banker_assignments")
      .insert({ client_id: clientId, banker_id: target, status: "active" });
    if (assignError) throw assignError;
  }
}

export async function insertClientGraph(
  admin: DbClient,
  payload: IntakePayload,
  bankerId: string,
): Promise<string> {
  const { data, error } = await admin
    .from("clients")
    .insert(payload.client)
    .select("id")
    .single();
  if (error) throw error;

  const clientId = String(data.id);

  try {
    const { data: accountType, error: accountTypeError } = await admin
      .from("account_types")
      .select("id")
      .eq("status", "active")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (accountTypeError) throw accountTypeError;
    if (!accountType) throw new Error("No active account type is configured. Add an account type before creating a client.");

    const { error: accountError } = await admin.from("accounts").insert({
      client_id: clientId,
      account_type_id: accountType.id,
      account_number: `OT-ACC-${payload.client.client_number}`,
      currency: "GHS",
      balance: 0,
      available_balance: 0,
      status: "active",
    });
    if (accountError) throw accountError;

    if (payload.guarantors.length) {
      const { error: guarantorError } = await admin
        .from("client_guarantors")
        .insert(payload.guarantors.map((guarantor) => ({ ...guarantor, client_id: clientId })));
      if (guarantorError) throw guarantorError;
    }

    if (payload.loanApplication) {
      const { error: loanError } = await admin
        .from("loan_applications")
        .insert({ ...payload.loanApplication, client_id: clientId });
      if (loanError) throw loanError;
    }

    await syncBankerAssignment(admin, clientId, bankerId);
  } catch (error) {
    await admin.from("clients").delete().eq("id", clientId);
    throw error;
  }

  return clientId;
}

function loanUpdatePayload(loan: LoanApplicationRowPayload) {
  return {
    principal_amount: loan.principal_amount,
    interest_rate: loan.interest_rate,
    processing_fee: loan.processing_fee,
    duration_months: loan.duration_months,
    payment_mode: loan.payment_mode,
    currency: loan.currency,
    applicant_signature: loan.applicant_signature,
    application_date: loan.application_date,
    decision: loan.decision,
    approved_amount: loan.approved_amount,
    approved_interest_rate: loan.approved_interest_rate,
    approved_processing_fee: loan.approved_processing_fee,
    approved_duration_months: loan.approved_duration_months,
    officer_signature: loan.officer_signature,
    remarks: loan.remarks,
    reviewed_at: loan.reviewed_at,
  };
}

export async function updateClientGraph(
  admin: DbClient,
  clientId: string,
  payload: IntakePayload,
  bankerId: string,
): Promise<string> {
  const { data, error } = await admin
    .from("clients")
    .update(payload.client)
    .eq("id", clientId)
    .select("id")
    .single();
  if (error) throw error;
  if (!data) throw new Error("That client could not be found.");

  const { error: clearError } = await admin
    .from("client_guarantors")
    .delete()
    .eq("client_id", clientId);
  if (clearError) throw clearError;

  if (payload.guarantors.length) {
    const { error: guarantorError } = await admin
      .from("client_guarantors")
      .insert(payload.guarantors.map((guarantor) => ({ ...guarantor, client_id: clientId })));
    if (guarantorError) throw guarantorError;
  }

  if (payload.loanApplication) {
    const { data: existing, error: existingError } = await admin
      .from("loan_applications")
      .select("id")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingError) throw existingError;

    if (existing?.id) {
      const { error: updateError } = await admin
        .from("loan_applications")
        .update(loanUpdatePayload(payload.loanApplication))
        .eq("id", existing.id);
      if (updateError) throw updateError;
    } else {
      const { error: insertError } = await admin
        .from("loan_applications")
        .insert({ ...payload.loanApplication, client_id: clientId });
      if (insertError) throw insertError;
    }
  }

  await syncBankerAssignment(admin, clientId, bankerId);

  return clientId;
}

export function createRepositoryClient(): DbClient {
  return createAdminClient();
}
