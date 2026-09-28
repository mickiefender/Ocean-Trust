"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ensureAnotherAdministratorRemains, requireAdministrator } from "./authorization";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function throwDeleteError(error: { code?: string; message: string }): never {
  if (error.code === "PGRST202" || error.message.includes("Could not find the function")) {
    throw new Error("The admin deletion database migrations have not been applied or the schema cache has not refreshed. Apply all pending migrations, including 20260927100000_admin_record_deletion.sql, 20260927103000_admin_transaction_deletion.sql, 20260927113000_delete_linked_transaction_reversals.sql, 20260927120000_allow_loan_transaction_history_deletion.sql, 20260927123000_fix_admin_transaction_delete_balance_ambiguity.sql, 20260927130000_allow_internal_loan_ledger_removal.sql, and 20260927131000_retry_internal_loan_ledger_removal.sql, then retry.");
  }
  throw new Error(error.message);
}

function requireUuid(value: string, label: string): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value.trim())) {
    throw new Error(`A valid ${label} reference is required.`);
  }
  return value.trim();
}

export async function deleteCollection(collectionId: string): Promise<void> {
  const id = requireUuid(collectionId, "collection");
  await requireAdministrator();

  const session = await createClient();
  const { error } = await session.rpc("delete_collection_history", {
    p_collection_id: id,
  });
  if (error) throwDeleteError(error);

  revalidatePath("/admin");
}

export async function deleteDisbursedLoan(loanId: string): Promise<void> {
  const id = requireUuid(loanId, "loan");
  await requireAdministrator();

  const session = await createClient();
  const { error } = await session.rpc("delete_disbursed_loan", {
    p_loan_id: id,
  });
  if (error) throwDeleteError(error);

  revalidatePath("/admin");
}

export async function deleteFinancialTransactions(transactionIds: string[]): Promise<number> {
  if (
    !Array.isArray(transactionIds)
    || transactionIds.length === 0
    || transactionIds.length > 200
    || transactionIds.some((id) => typeof id !== "string" || !UUID_PATTERN.test(id.trim()))
  ) {
    throw new Error("Select between 1 and 200 valid transactions.");
  }
  const ids = transactionIds.map((id) => id.trim());
  if (new Set(ids).size !== ids.length) {
    throw new Error("The selection contains duplicate transaction references.");
  }

  await requireAdministrator();
  const session = await createClient();
  const { data, error } = await session.rpc("delete_financial_transactions", {
    p_transaction_ids: ids,
  });
  if (error) throwDeleteError(error);
  if (typeof data !== "number" || !Number.isSafeInteger(data) || data < ids.length) {
    throw new Error("The database did not confirm deletion of every selected transaction and linked loan history.");
  }

  revalidatePath("/admin");
  return data;
}

export async function deleteBankerAccount(bankerId: string): Promise<string> {
  const id = requireUuid(bankerId, "banker");
  const { admin, userId } = await requireAdministrator();

  const { data: banker, error: lookupError } = await admin
    .from("bankers")
    .select("id,profile_id,profile:profiles(first_name,last_name)")
    .eq("id", id)
    .maybeSingle();
  if (lookupError) throw new Error(lookupError.message);
  if (!banker) throw new Error("That banker account could not be found.");
  if (banker.profile_id === userId) {
    throw new Error("You cannot delete the banker account you are currently using.");
  }
  await ensureAnotherAdministratorRemains(admin, banker.profile_id);

  const profile = Array.isArray(banker.profile) ? banker.profile[0] : banker.profile;
  const bankerName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "Banker";
  const { error } = await admin.auth.admin.deleteUser(banker.profile_id);
  if (error) throw new Error(error.message);

  revalidatePath("/admin");
  return bankerName;
}

export async function deleteAdminUser(profileId: string): Promise<string> {
  const id = requireUuid(profileId, "user");
  const { admin, userId } = await requireAdministrator();
  if (id === userId) {
    throw new Error("You cannot delete the account you are currently using.");
  }

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id,first_name,last_name")
    .eq("id", id)
    .maybeSingle();
  if (profileError) throw new Error(profileError.message);
  if (!profile) throw new Error("That user could not be found.");

  await ensureAnotherAdministratorRemains(admin, id);

  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) throw new Error(error.message);

  revalidatePath("/admin");
  return [profile.first_name, profile.last_name].filter(Boolean).join(" ") || "User";
}
