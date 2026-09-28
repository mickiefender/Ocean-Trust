import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const ADMIN_ROLES = new Set(["super_admin", "company_admin", "admin"]);

export async function requireAdministrator() {
  const session = await createClient();
  const { data, error: authError } = await session.auth.getUser();
  if (authError || !data.user) {
    throw new Error("Your session has expired. Sign in again to manage administrator records.");
  }

  const admin = createAdminClient();
  const { data: assignments, error } = await admin
    .from("user_roles")
    .select("role:roles(name)")
    .eq("profile_id", data.user.id);
  if (error) throw new Error(error.message);

  const isAdministrator = ((assignments ?? []) as unknown as { role?: { name?: string } | { name?: string }[] | null }[])
    .some((assignment) => {
      const role = Array.isArray(assignment.role) ? assignment.role[0] : assignment.role;
      return ADMIN_ROLES.has(String(role?.name ?? "").trim().toLowerCase());
    });

  if (!isAdministrator) {
    throw new Error("Your account does not have permission to delete administrator records.");
  }

  return { admin, userId: data.user.id };
}

export async function ensureAnotherAdministratorRemains(
  admin: ReturnType<typeof createAdminClient>,
  profileId: string,
): Promise<void> {
  const { data: assignments, error } = await admin
    .from("user_roles")
    .select("profile_id,role:roles(name)");
  if (error) throw new Error(error.message);

  const administratorIds = new Set(
    ((assignments ?? []) as unknown as { profile_id: string; role?: { name?: string } | { name?: string }[] | null }[])
      .filter((assignment) => {
        const role = Array.isArray(assignment.role) ? assignment.role[0] : assignment.role;
        return ADMIN_ROLES.has(String(role?.name ?? "").trim().toLowerCase());
      })
      .map((assignment) => assignment.profile_id),
  );
  if (administratorIds.has(profileId) && administratorIds.size <= 1) {
    throw new Error("The last administrator cannot be deleted. Assign another administrator first.");
  }
}
