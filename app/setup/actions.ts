"use server";

import { createAdminClient } from "@/lib/supabase/admin";

type SetupResult = {
  error?: string;
  success?: boolean;
};

export async function createInitialAdmin(
  _previousState: SetupResult,
  formData: FormData,
): Promise<SetupResult> {
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!firstName || !lastName || !email || password.length < 8) {
    return {
      error: "Enter a first name, last name, valid email, and password of at least 8 characters.",
    };
  }

  const supabase = createAdminClient();
  const { data: existingLock, error: lockLookupError } = await supabase
    .from("system_settings")
    .select("key")
    .eq("key", "initial_admin_setup_completed")
    .maybeSingle();

  if (lockLookupError) return { error: "Unable to verify setup status." };
  if (existingLock) return { error: "Initial admin setup has already been completed." };

  const { error: lockError } = await supabase.from("system_settings").insert({
    key: "initial_admin_setup_completed",
    value: { email, completed_at: new Date().toISOString() },
    description: "One-time initial administrator setup lock.",
    is_secret: true,
  });

  if (lockError) {
    if (lockError.code === "23505") {
      return { error: "Initial admin setup has already been completed." };
    }
    return { error: "Unable to reserve initial admin setup." };
  }

  const { data: authUser, error: createUserError } =
    await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { first_name: firstName, last_name: lastName },
    });

  if (createUserError || !authUser.user) {
    await supabase
      .from("system_settings")
      .delete()
      .eq("key", "initial_admin_setup_completed");
    return { error: createUserError?.message ?? "Unable to create admin account." };
  }

  const { data: role, error: roleLookupError } = await supabase
    .from("roles")
    .select("id")
    .eq("name", "super_admin")
    .single();

  if (roleLookupError || !role) {
    await supabase.auth.admin.deleteUser(authUser.user.id);
    await supabase
      .from("system_settings")
      .delete()
      .eq("key", "initial_admin_setup_completed");
    return { error: "The super_admin role is not available. Run the database migrations first." };
  }

  const { error: assignmentError } = await supabase.from("user_roles").insert({
    profile_id: authUser.user.id,
    role_id: role.id,
  });

  if (assignmentError) {
    await supabase.auth.admin.deleteUser(authUser.user.id);
    await supabase
      .from("system_settings")
      .delete()
      .eq("key", "initial_admin_setup_completed");
    return { error: "Unable to assign the super_admin role." };
  }

  await supabase
    .from("profiles")
    .update({ status: "active" })
    .eq("id", authUser.user.id);

  return { success: true };
}
