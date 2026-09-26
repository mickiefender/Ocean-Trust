"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { AdminClient, Row } from "./client-mapper";
import { text } from "./client-mapper";
import {
  buildIntakePayload,
  emptyIntakeValues,
  formatApplicationNumber,
  validateIntake,
  type ClientIntakeValues,
  type IntakeErrors,
} from "./client-intake";
import {
  createRepositoryClient,
  describeDbError,
  insertClientGraph,
  loadBankerOptions,
  loadBranchOptions,
  loadClientById,
  nextClientNumber,
  resolveBranchId,
  updateClientGraph,
  type BankerOption,
  type BranchOption,
  type DbClient,
} from "./client-repository";

export type ClientFormOptions = {
  branches: BranchOption[];
  bankers: BankerOption[];
};

export type IntakeActionResult =
  | { ok: true; client: AdminClient; message: string }
  | { ok: false; fieldErrors: IntakeErrors; message: string };

export type AccountNumberResult =
  | { ok: true; accountNumber: string; branchId: string }
  | { ok: false; message: string };

const CLIENT_MANAGER_ROLES = ["super_admin", "company_admin", "admin", "manager", "banker"];
const ACCOUNT_NUMBER_ATTEMPTS = 3;

function isClientNumberConflict(error: unknown): boolean {
  const dbError = (error ?? {}) as { code?: string; message?: string; details?: string | null };
  if (dbError.code !== "23505") return false;
  return `${dbError.details ?? ""} ${dbError.message ?? ""}`.includes("client_number");
}

/**
 * Confirms the caller is signed in and holds a role that may manage clients.
 * A fresh installation has no role assignments yet, so the first signed-in
 * operator is allowed through — the same bootstrap rule used by /setup.
 */
async function requireOperator(): Promise<void> {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  const user = authData?.user;
  if (!user) {
    throw new Error("Your session has expired. Sign in again to manage clients.");
  }

  const admin = createRepositoryClient();
  const { data, error } = await admin.from("user_roles").select("profile_id, role:roles(name)");
  if (error) throw error;

  const assignments = (data ?? []) as Row[];
  if (assignments.length === 0) return;

  const permitted = assignments.some((assignment) => {
    if (text(assignment.profile_id) !== user.id) return false;
    const role = (assignment.role ?? null) as Row | null;
    return CLIENT_MANAGER_ROLES.includes(text(role?.name));
  });

  if (!permitted) {
    throw new Error("Your account does not have permission to manage clients.");
  }
}

async function requireAdministrator(): Promise<void> {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  const user = authData?.user;
  if (!user) {
    throw new Error("Your session has expired. Sign in again to manage applications.");
  }

  const admin = createRepositoryClient();
  const { data, error } = await admin
    .from("user_roles")
    .select("profile_id, role:roles(name)")
    .eq("profile_id", user.id);
  if (error) throw error;

  const permitted = ((data ?? []) as Row[]).some((assignment) => {
    const role = (assignment.role ?? null) as Row | null;
    return (
      text(assignment.profile_id) === user.id &&
      ["super_admin", "company_admin", "admin"].includes(text(role?.name).toLowerCase())
    );
  });

  if (!permitted) {
    throw new Error("Your account does not have permission to delete applications.");
  }
}

export async function loadClientFormOptions(): Promise<ClientFormOptions> {
  await requireOperator();
  const admin = createRepositoryClient();
  const [branches, bankers] = await Promise.all([
    loadBranchOptions(admin),
    loadBankerOptions(admin),
  ]);
  return { branches, bankers };
}

export async function suggestAccountNumber(branchId: string): Promise<AccountNumberResult> {
  try {
    await requireOperator();
    const admin = createRepositoryClient();
    const resolvedBranchId = await resolveBranchId(admin, branchId);
    const accountNumber = await nextClientNumber(admin, resolvedBranchId);
    return { ok: true, accountNumber, branchId: resolvedBranchId };
  } catch (error) {
    return { ok: false, message: describeDbError(error) };
  }
}

async function insertWithAccountNumberRetry(
  admin: DbClient,
  values: ClientIntakeValues,
  branchId: string,
): Promise<string> {
  let accountNumber = values.accountNumber.trim();

  for (let attempt = 0; attempt < ACCOUNT_NUMBER_ATTEMPTS; attempt += 1) {
    const payload = buildIntakePayload(
      { ...values, branchId, accountNumber },
      formatApplicationNumber(),
    );
    try {
      return await insertClientGraph(admin, payload, values.bankerId);
    } catch (error) {
      const lastAttempt = attempt === ACCOUNT_NUMBER_ATTEMPTS - 1;
      if (!isClientNumberConflict(error) || lastAttempt) throw error;
      accountNumber = await nextClientNumber(admin, branchId);
    }
  }

  throw new Error("Unable to allocate a free account number. Please try again.");
}

export async function createClientIntake(
  values: ClientIntakeValues,
): Promise<IntakeActionResult> {
  const fieldErrors = validateIntake(values);
  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors, message: "Please correct the highlighted fields." };
  }

  try {
    await requireOperator();
    const admin = createRepositoryClient();
    const branchId = await resolveBranchId(admin, values.branchId);
    const clientId = await insertWithAccountNumberRetry(admin, values, branchId);
    const client = await loadClientById(admin, clientId);
    revalidatePath("/admin");
    return { ok: true, client, message: `${client.name} was added successfully.` };
  } catch (error) {
    return { ok: false, fieldErrors: {}, message: describeDbError(error) };
  }
}

export async function updateClientIntake(
  values: ClientIntakeValues,
): Promise<IntakeActionResult> {
  const clientId = values.clientId;
  if (!clientId) {
    return { ok: false, fieldErrors: {}, message: "That client reference is missing." };
  }

  const fieldErrors = validateIntake(values);
  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors, message: "Please correct the highlighted fields." };
  }

  try {
    await requireOperator();
    const admin = createRepositoryClient();
    const branchId = await resolveBranchId(admin, values.branchId);
    const payload = buildIntakePayload(
      { ...values, branchId },
      formatApplicationNumber(),
    );
    await updateClientGraph(admin, clientId, payload, values.bankerId);
    const client = await loadClientById(admin, clientId);
    revalidatePath("/admin");
    return { ok: true, client, message: `${client.name} was updated.` };
  } catch (error) {
    return { ok: false, fieldErrors: {}, message: describeDbError(error) };
  }
}

export async function setClientStatus(clientId: string, active: boolean): Promise<IntakeActionResult> {
  if (!clientId) {
    return { ok: false, fieldErrors: {}, message: "That client reference is missing." };
  }

  try {
    await requireOperator();
    const admin = createRepositoryClient();
    const { error } = await admin
      .from("clients")
      .update({ status: active ? "active" : "inactive" })
      .eq("id", clientId);
    if (error) throw error;

    const client = await loadClientById(admin, clientId);
    revalidatePath("/admin");
    return {
      ok: true,
      client,
      message: `${client.name} is now ${active ? "active" : "inactive"}.`,
    };
  } catch (error) {
    return { ok: false, fieldErrors: {}, message: describeDbError(error) };
  }

}

export async function deleteClientApplication(applicationId: string): Promise<void> {
  if (typeof applicationId !== "string" || !applicationId.trim()) {
    throw new Error("That application reference is missing.");
  }

  await requireAdministrator();
  const admin = createRepositoryClient();
  const { data, error } = await admin
    .from("loan_applications")
    .delete()
    .eq("id", applicationId.trim())
    .select("id")
    .maybeSingle();

  if (error) throw new Error(describeDbError(error));
  if (!data) throw new Error("That application could not be found.");

  revalidatePath("/admin");
}

export async function sendClientSms(clientId: string, message: string): Promise<{ recipient: string }> {
  await requireOperator();
  if (typeof clientId !== "string" || typeof message !== "string") {
    throw new Error("A client and SMS message are required.");
  }
  const normalizedClientId = clientId.trim();
  const smsBody = message.trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(normalizedClientId)) {
    throw new Error("Select a valid client before sending an SMS.");
  }
  if (!smsBody) throw new Error("Enter a message before sending.");
  if (smsBody.length > 1600) throw new Error("SMS messages cannot exceed 1,600 characters.");

  const apiKey = process.env.ARKESEL_API_KEY;
  const sender = process.env.ARKESEL_SENDER_ID?.trim();
  if (!apiKey || !sender) {
    throw new Error("SMS is not configured. Set ARKESEL_API_KEY and ARKESEL_SENDER_ID on the server.");
  }

  const admin = createRepositoryClient();
  const { data: client, error: clientError } = await admin
    .from("clients")
    .select("id,phone")
    .eq("id", normalizedClientId)
    .single();
  if (clientError) throw new Error(describeDbError(clientError));
  const storedPhone = String(client.phone ?? "").trim();
  if (!storedPhone) throw new Error("This client does not have a phone number on file.");
  const digits = storedPhone.replace(/\D/g, "");
  const countryCode = (process.env.ARKESEL_DEFAULT_COUNTRY_CODE ?? "232").replace(/\D/g, "");
  if (!/^[1-9]\d{0,2}$/.test(countryCode)) {
    throw new Error("ARKESEL_DEFAULT_COUNTRY_CODE must be a valid 1–3 digit country calling code.");
  }
  const recipient = storedPhone.startsWith("+")
    ? digits
    : digits.startsWith("00")
      ? digits.slice(2)
      : digits.startsWith("0")
        ? `${countryCode}${digits.slice(1)}`
        : digits;
  if (!/^[1-9]\d{7,14}$/.test(recipient)) {
    throw new Error("The client's phone number must include a valid international country code or be a local number starting with 0.");
  }

  const response = await fetch("https://sms.arkesel.com/api/v2/sms/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": apiKey },
    body: JSON.stringify({ sender, message: smsBody, recipients: [recipient] }),
    signal: AbortSignal.timeout(20_000),
  });
  const responseText = await response.text();
  let providerResponse: Record<string, unknown> = {};
  if (responseText) {
    try {
      const parsed: unknown = JSON.parse(responseText);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        providerResponse = parsed as Record<string, unknown>;
      }
    } catch {
      if (response.ok) throw new Error("Arkesel returned an unreadable response. Check the SMS provider configuration.");
    }
  }
  const providerStatus = String(providerResponse.status ?? "").toLowerCase();
  if (!response.ok || ["error", "failed", "failure"].includes(providerStatus)) {
    const providerMessage = String(providerResponse.message ?? providerResponse.error ?? "").trim();
    throw new Error(providerMessage || `Arkesel could not send the SMS (HTTP ${response.status}).`);
  }

  return { recipient };
}

export async function createBankerApplication(
  input: Pick<ClientIntakeValues, "fullName" | "email" | "phone" | "dateOfBirth" | "gender" | "nationalId" | "address" | "maritalStatus" | "religion" | "occupation" | "occupationType" | "businessLocation" | "residence" | "businessDuration" | "guarantors" | "principalAmount" | "interestRate" | "processingFee" | "durationMonths" | "paymentMode">,
): Promise<IntakeActionResult> {
  try {
    const supabase = await createClient("banker");
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) throw new Error("Your session has expired. Sign in again.");
    const admin = createRepositoryClient();
    const { data: banker, error: bankerError } = await admin.from("bankers").select("id,branch_id,status").eq("profile_id", authData.user.id).single();
    if (bankerError || !banker || banker.status !== "active") throw new Error("Only an active banker can submit client applications.");
    const accountNumber = await nextClientNumber(admin, String(banker.branch_id));
    const values: ClientIntakeValues = { ...emptyIntakeValues(String(banker.branch_id)), accountNumber, bankerId: String(banker.id), ...input, applicationDate: new Date().toISOString().slice(0, 10), includeLoan: true, loanApproved: "" };
    const result = await createClientIntake(values);
    if (result.ok) {
      const profileName = [authData.user.user_metadata?.first_name, authData.user.user_metadata?.last_name].filter(Boolean).join(" ") || "Banker";
      try {
        await notifyAdmins("New client application", `${profileName} submitted a new application for ${result.client.name}.`, "info");
      } catch (notificationError) {
        console.error("Unable to notify administrators about a new banker application", notificationError);
      }
    }
    return result;
  } catch (error) {
    return { ok: false, fieldErrors: {}, message: describeDbError(error) };
  }

  async function notifyAdmins(title: string, message: string, type: "info" | "success" | "warning" | "error") {
    const admin = createRepositoryClient();
    const { data: assignments, error } = await admin.from("user_roles").select("profile_id,role:roles(name)");
    if (error) throw new Error(error.message);
    const profileIds = ((assignments ?? []) as unknown as Record<string, unknown>[])
      .filter((row) => {
        const role = Array.isArray(row.role) ? row.role[0] as Record<string, unknown> | undefined : row.role as Record<string, unknown> | null;
        return ["admin", "company_admin", "super_admin"].includes(String(role?.name ?? "").trim().toLowerCase());
      })
      .map((row) => String(row.profile_id));
    if (profileIds.length) {
      const { error: insertError } = await admin.from("notifications").insert(profileIds.map((profile_id) => ({ profile_id, title, message, type })));
      if (insertError) throw new Error(insertError.message);
    }
  }
}
