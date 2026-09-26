"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type SmsTemplateCategory =
  | "new_application"
  | "pending_application"
  | "approved_application"
  | "payment_reminder"
  | "successful_loan_payment"
  | "custom";

export type SmsTemplate = {
  id: string;
  name: string;
  category: SmsTemplateCategory;
  message: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type SmsTemplateInput = {
  id?: string;
  name: string;
  category: SmsTemplateCategory;
  message: string;
  is_active?: boolean;
};

const categories: SmsTemplateCategory[] = [
  "new_application",
  "pending_application",
  "approved_application",
  "payment_reminder",
  "successful_loan_payment",
  "custom",
];
const adminRoles = new Set(["admin", "super_admin", "company_admin"]);

async function requireSmsAdmin() {
  const sessionClient = await createClient();
  const { data: authData, error: authError } = await sessionClient.auth.getUser();
  if (authError || !authData.user) {
    throw new Error("Your session has expired. Sign in again to manage SMS templates.");
  }

  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from("user_roles")
    .select("role:roles(name)")
    .eq("profile_id", authData.user.id);
  if (error) throw new Error(`Unable to verify admin access: ${error.message}`);

  const assignments = (data ?? []) as unknown as Array<{
    role?: { name?: string } | Array<{ name?: string }>;
  }>;
  const hasAdminRole = assignments.some((assignment) => {
    const role = Array.isArray(assignment.role) ? assignment.role[0] : assignment.role;
    return role?.name ? adminRoles.has(role.name) : false;
  });
  if (!hasAdminRole) {
    throw new Error("Only company administrators can manage SMS templates.");
  }

  return { adminClient, userId: authData.user.id };
}

export async function loadSmsTemplates(): Promise<SmsTemplate[]> {
  const { adminClient } = await requireSmsAdmin();
  const { data, error } = await adminClient
    .from("sms_templates")
    .select("id,name,category,message,is_active,created_at,updated_at")
    .order("category")
    .order("name");
  if (error) throw new Error(`Unable to load SMS templates: ${error.message}`);
  return (data ?? []) as unknown as SmsTemplate[];
}

export async function saveSmsTemplate(input: SmsTemplateInput): Promise<void> {
  const { adminClient, userId } = await requireSmsAdmin();
  if (!input || typeof input !== "object") {
    throw new Error("Provide valid SMS template details.");
  }
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const message = typeof input.message === "string" ? input.message.trim() : "";

  if (input.id && !isUuid(input.id)) {
    throw new Error("Select a valid SMS template to update.");
  }
  if (!name || name.length > 100) {
    throw new Error("Template name must be between 1 and 100 characters.");
  }
  if (typeof input.category !== "string" || !categories.includes(input.category as SmsTemplateCategory)) {
    throw new Error("Select a valid template category.");
  }
  if (!message || message.length > 1600) {
    throw new Error("Template messages must be between 1 and 1,600 characters.");
  }
  if (input.is_active !== undefined && typeof input.is_active !== "boolean") {
    throw new Error("Template active status must be true or false.");
  }

  const record = {
    name,
    category: input.category,
    message,
    is_active: input.is_active ?? true,
  };
  const result = input.id
    ? await adminClient.from("sms_templates").update(record).eq("id", input.id)
    : await adminClient
        .from("sms_templates")
        .insert({ ...record, created_by: userId });
  if (result.error) throw new Error(`Unable to save SMS template: ${result.error.message}`);
  revalidatePath("/admin/sms-templates");
}

export async function setSmsTemplateActive(id: string, active: boolean): Promise<void> {
  const { adminClient } = await requireSmsAdmin();
  if (!isUuid(id)) throw new Error("Select a valid SMS template.");
  const { error } = await adminClient
    .from("sms_templates")
    .update({ is_active: active })
    .eq("id", id);
  if (error) throw new Error(`Unable to update SMS template: ${error.message}`);
  revalidatePath("/admin/sms-templates");
}

export async function deleteSmsTemplate(id: string): Promise<void> {
  const { adminClient } = await requireSmsAdmin();
  if (!isUuid(id)) throw new Error("Select a valid SMS template.");
  const { error } = await adminClient.from("sms_templates").delete().eq("id", id);
  if (error) throw new Error(`Unable to delete SMS template: ${error.message}`);
  revalidatePath("/admin/sms-templates");
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
