"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type Result = { ok: true; message: string } | { ok: false; message: string };
const db = () => createAdminClient();

export type BankerDashboardData = {
  banker: { name: string; employeeNumber: string; jobTitle: string; branch: string };
  clients: { id: string; name: string; phone: string; status: string }[];
  applications: { id: string; number: string; clientName: string; amount: number; decision: string; date: string }[];
  collections: { id: string; clientName: string; amount: number; status: string; date: string }[];
};

export async function loadBankerDashboard(): Promise<BankerDashboardData> {
  const session = await createClient("banker");
  const { data: authData } = await session.auth.getUser();
  if (!authData.user) throw new Error("Your session has expired. Sign in again.");

  const admin = db();
  const { data: bankerRow, error: bankerError } = await admin
    .from("bankers")
    .select("id,employee_number,job_title,status,branch:branches(name),profile:profiles(first_name,last_name)")
    .eq("profile_id", authData.user.id)
    .single();
  if (bankerError) throw new Error(bankerError.message);
  if (!bankerRow) throw new Error("No banker profile is linked to this signed-in account.");
  if (String(bankerRow.status).toLowerCase() !== "active") throw new Error("This banker account is inactive.");

  const banker = bankerRow as unknown as Record<string, unknown>;
  const profile = (Array.isArray(banker.profile) ? banker.profile[0] : banker.profile) as Record<string, unknown> | null;
  const branch = (Array.isArray(banker.branch) ? banker.branch[0] : banker.branch) as Record<string, unknown> | null;
  const { data: assignments, error: assignmentError } = await admin.from("client_banker_assignments").select("client_id").eq("banker_id", banker.id).eq("status", "active");
  if (assignmentError) throw new Error(assignmentError.message);
  const clientIds = ((assignments ?? []) as unknown as Record<string, unknown>[]).map((row) => String(row.client_id));
  const [{ data: clients, error: clientsError }, { data: applications, error: applicationsError }, { data: collections, error: collectionsError }] = await Promise.all([
    clientIds.length ? admin.from("clients").select("id,full_name,first_name,last_name,phone,status").in("id", clientIds).order("created_at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
    clientIds.length ? admin.from("loan_applications").select("id,application_number,client_id,principal_amount,decision,application_date,client:clients(full_name,first_name,last_name)").in("client_id", clientIds).order("created_at", { ascending: false }).limit(20) : Promise.resolve({ data: [], error: null }),
    admin.from("collections").select("id,client_id,collected_amount,status,created_at,client:clients(full_name,first_name,last_name)").eq("banker_id", banker.id).order("created_at", { ascending: false }).limit(10),
  ]);
  if (clientsError) throw new Error(clientsError.message);
  if (applicationsError) throw new Error(applicationsError.message);
  if (collectionsError) throw new Error(collectionsError.message);
  const nameOf = (row: Record<string, unknown> | null) => String(row?.full_name ?? ([row?.first_name, row?.last_name].filter(Boolean).join(" ") || "Unnamed client"));
  const clientRows = (clients ?? []) as unknown as Record<string, unknown>[];
  return {
    banker: { name: [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "Banker", employeeNumber: String(banker.employee_number), jobTitle: String(banker.job_title ?? "Banker"), branch: String(branch?.name ?? "Unassigned") },
    clients: clientRows.map((row) => ({ id: String(row.id), name: nameOf(row), phone: String(row.phone ?? ""), status: String(row.status ?? "active") })),
    applications: ((applications ?? []) as unknown as Record<string, unknown>[]).map((row) => ({ id: String(row.id), number: String(row.application_number), clientName: nameOf(Array.isArray(row.client) ? (row.client[0] as Record<string, unknown> | undefined) ?? null : row.client as Record<string, unknown> | null), amount: Number(row.principal_amount), decision: String(row.decision), date: String(row.application_date) })),
    collections: ((collections ?? []) as unknown as Record<string, unknown>[]).map((row) => ({ id: String(row.id), clientName: nameOf(Array.isArray(row.client) ? (row.client[0] as Record<string, unknown> | undefined) ?? null : row.client as Record<string, unknown> | null), amount: Number(row.collected_amount), status: String(row.status), date: String(row.created_at) })),
  };
}

export async function loadBankerManagement() {
  const admin = db();
  const [{ data: bankers, error: bankerError }, { data: branches, error: branchError }] = await Promise.all([
    admin.from("bankers").select("id,profile_id,branch_id,employee_number,job_title,hire_date,status,created_at,profile:profiles(first_name,last_name,phone),branch:branches(id,name),assignments:client_banker_assignments(id,status,client_id),targets:banker_targets(target_date,target_amount),visits:banker_visits(id,visited_at)").order("created_at", { ascending: false }),
    admin.from("branches").select("id,name,code").order("name"),
  ]);
  if (bankerError) throw new Error(bankerError.message);
  if (branchError) throw new Error(branchError.message);
  const bankerRows = (bankers ?? []) as Record<string, unknown>[];
  const ids = bankerRows.map((row) => String(row.id));
  const [{ data: collections, error: collectionError }, { data: commissions, error: commissionError }, { data: audit, error: auditError }] = await Promise.all([
    ids.length ? admin.from("collections").select("banker_id,collected_amount,status,created_at,client:clients(full_name,client_number)").in("banker_id", ids).order("created_at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
    ids.length ? admin.from("commissions").select("banker_id,amount,paid_at,created_at,description").in("banker_id", ids).order("created_at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
    admin.from("audit_logs").select("profile_id,action,table_name,created_at").order("created_at", { ascending: false }).limit(100),
  ]);
  if (collectionError) throw new Error(collectionError.message);
  if (commissionError) throw new Error(commissionError.message);
  if (auditError) throw new Error(auditError.message);
  return {
    bankers: bankerRows.map((row) => {
      const profile = (Array.isArray(row.profile) ? row.profile[0] : row.profile) as Record<string, unknown> | null;
      const branch = (Array.isArray(row.branch) ? row.branch[0] : row.branch) as Record<string, unknown> | null;
      const assignments = (row.assignments as Record<string, unknown>[] | null) ?? [];
      const targets = (row.targets as Record<string, unknown>[] | null) ?? [];
      const visits = (row.visits as Record<string, unknown>[] | null) ?? [];
      const bankerId = String(row.id);
      const bankerCollections = ((collections ?? []) as Record<string, unknown>[]).filter((item) => String(item.banker_id) === bankerId);
      const bankerCommissions = ((commissions ?? []) as Record<string, unknown>[]).filter((item) => String(item.banker_id) === bankerId);
      return {
        id: bankerId, profileId: String(row.profile_id), name: [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "Unnamed banker",
        phone: String(profile?.phone ?? ""), employeeNumber: String(row.employee_number), jobTitle: String(row.job_title ?? "Banker"),
        branchId: String(branch?.id ?? row.branch_id), branch: String(branch?.name ?? "Unassigned"), status: row.status === "active" ? "Active" : "Inactive",
        clients: assignments.filter((item) => item.status === "active").length, visits: visits.length,
        target: Number(targets.find((target) => String(target.target_date) === new Date().toISOString().slice(0, 10))?.target_amount ?? 0),
        collections: bankerCollections.reduce((sum, item) => sum + Number(item.collected_amount ?? 0), 0),
        commissions: bankerCommissions.reduce((sum, item) => sum + Number(item.amount ?? 0), 0),
        collectionsRows: bankerCollections.slice(0, 10), commissionRows: bankerCommissions.slice(0, 10),
        activity: ((audit ?? []) as Record<string, unknown>[]).filter((item) => String(item.profile_id) === String(row.profile_id)).slice(0, 10),
      };
    }),
    branches: branches ?? [],
  };
}

export async function createBanker(input: { email: string; password: string; firstName: string; lastName: string; phone: string; employeeNumber: string; jobTitle: string; branchId: string }): Promise<Result> {
  const admin = db();
  if (!input.email || input.password.length < 8 || !input.firstName || !input.lastName || !input.branchId) return { ok: false, message: "Complete the required banker fields and use a password of at least 8 characters." };
  const { data: auth, error: authError } = await admin.auth.admin.createUser({ email: input.email.trim().toLowerCase(), password: input.password, email_confirm: true, user_metadata: { first_name: input.firstName.trim(), last_name: input.lastName.trim() } });
  if (authError || !auth.user) return { ok: false, message: authError?.message ?? "Unable to create banker login." };
  const { error: profileError } = await admin.from("profiles").update({ first_name: input.firstName.trim(), last_name: input.lastName.trim(), phone: input.phone.trim() || null, status: "active" }).eq("id", auth.user.id);
  const { data: banker, error: bankerError } = await admin.from("bankers").insert({ profile_id: auth.user.id, branch_id: input.branchId, employee_number: input.employeeNumber.trim(), job_title: input.jobTitle.trim() || "Banker", status: "active" }).select("id").single();
  const { data: role } = await admin.from("roles").select("id").eq("name", "banker").single();
  if (profileError || bankerError || !banker || !role) {
    await admin.auth.admin.deleteUser(auth.user.id);
    return { ok: false, message: profileError?.message ?? bankerError?.message ?? "Unable to create banker record." };
  }
  const { error: roleError } = await admin.from("user_roles").insert({ profile_id: auth.user.id, role_id: role.id });
  if (roleError) return { ok: false, message: roleError.message };
  return { ok: true, message: "Banker created successfully." };
}

export async function updateBanker(input: { id: string; branchId: string; jobTitle: string; phone: string; status: "active" | "inactive" }): Promise<Result> {
  const admin = db();
  const { data: banker, error: lookupError } = await admin.from("bankers").select("profile_id").eq("id", input.id).single();
  if (lookupError || !banker) return { ok: false, message: lookupError?.message ?? "Banker not found." };
  const { error } = await admin.from("bankers").update({ branch_id: input.branchId, job_title: input.jobTitle, status: input.status }).eq("id", input.id);
  if (error) return { ok: false, message: error.message };
  const { error: profileError } = await admin.from("profiles").update({ phone: input.phone || null }).eq("id", banker.profile_id);
  return profileError ? { ok: false, message: profileError.message } : { ok: true, message: "Banker updated successfully." };
}

export async function assignClientsToBanker(bankerId: string, clientIds: string[]): Promise<Result> {
  const admin = db();
  const { error: endError } = await admin.from("client_banker_assignments").update({ status: "inactive", ended_at: new Date().toISOString() }).eq("banker_id", bankerId).eq("status", "active");
  if (endError) return { ok: false, message: endError.message };
  if (!clientIds.length) return { ok: true, message: "Client assignments cleared." };
  const { error } = await admin.from("client_banker_assignments").insert(clientIds.map((clientId) => ({ banker_id: bankerId, client_id: clientId, status: "active" })));
  return error ? { ok: false, message: error.message } : { ok: true, message: "Clients assigned successfully." };
}

export async function setBankerTarget(bankerId: string, targetAmount: number, targetDate = new Date().toISOString().slice(0, 10)): Promise<Result> {
  const admin = db();
  const { error } = await admin.from("banker_targets").upsert({ banker_id: bankerId, target_date: targetDate, target_amount: targetAmount }, { onConflict: "banker_id,target_date" });
  return error ? { ok: false, message: error.message } : { ok: true, message: "Target saved successfully." };
}
