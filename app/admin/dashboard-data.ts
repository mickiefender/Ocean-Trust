import { createClient } from "@/lib/supabase/client";

export type AdminUser = { id: string; initials: string; name: string; email: string; role: string; branch: string; status: string };
export type AdminRole = { id: string; name: string; description: string; users: number };

const relation = (value: unknown): Record<string, unknown> | null => Array.isArray(value) ? ((value[0] as Record<string, unknown> | undefined) ?? null) : (value as Record<string, unknown> | null);

export async function loadAdminUsers(): Promise<AdminUser[]> {
  const supabase = createClient();
  const [{ data, error }, { data: assignments, error: assignmentError }, { data: branches, error: branchError }] = await Promise.all([
    supabase.from("profiles").select("id,first_name,last_name,status,branch_id").order("created_at", { ascending: false }),
    supabase.from("user_roles").select("profile_id,role:roles(name)"),
    supabase.from("branches").select("id,name"),
  ]);
  if (error || assignmentError || branchError) throw new Error(error?.message ?? assignmentError?.message ?? branchError?.message ?? "Unable to load users.");
  const branchById = new Map(((branches ?? []) as unknown as Record<string, unknown>[]).map((branch) => [String(branch.id), String(branch.name)]));
  const assignmentsByProfile = new Map<string, Record<string, unknown>>();
  ((assignments ?? []) as unknown as Record<string, unknown>[]).forEach((assignment) => assignmentsByProfile.set(String(assignment.profile_id), assignment));
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => {
    const name = `${String(row.first_name ?? "")} ${String(row.last_name ?? "")}`.trim() || "Unnamed user";
    const role = relation(assignmentsByProfile.get(String(row.id))?.role);
    return { id: String(row.id), initials: name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase(), name, email: "", role: String(role?.name ?? "Unassigned"), branch: branchById.get(String(row.branch_id)) ?? "Unassigned", status: String(row.status ?? "inactive") === "active" ? "Active" : "Inactive" };
  });
}

export async function loadAdminRoles(): Promise<AdminRole[]> {
  const supabase = createClient();
  const [{ data, error }, { data: assignments, error: assignmentError }] = await Promise.all([
    supabase.from("roles").select("id,name,description").order("name"),
    supabase.from("user_roles").select("role_id"),
  ]);
  if (error || assignmentError) throw new Error(error?.message ?? assignmentError?.message ?? "Unable to load roles.");
  const counts = new Map<string, number>();
  ((assignments ?? []) as unknown as Record<string, unknown>[]).forEach((assignment) => {
    const id = String(assignment.role_id);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  });
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => ({ id: String(row.id), name: String(row.name), description: String(row.description ?? ""), users: counts.get(String(row.id)) ?? 0 }));
}
