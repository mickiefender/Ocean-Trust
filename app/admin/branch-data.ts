import { createClient } from "@/lib/supabase/client";

export type AdminBranch = {
  id: string;
  name: string;
  code: string;
  address: string;
  manager: string;
  clients: number;
  status: "Active" | "Inactive";
};

export async function loadAdminBranches(): Promise<AdminBranch[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from("branches").select("id,name,code,address,status,manager:profiles(first_name,last_name),clients(id)").order("name");
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => {
    const manager = (Array.isArray(row.manager) ? row.manager[0] : row.manager) as Record<string, unknown> | null;
    return {
      id: String(row.id), name: String(row.name), code: String(row.code), address: String(row.address ?? ""),
      manager: [manager?.first_name, manager?.last_name].filter(Boolean).join(" ") || "Unassigned",
      clients: Array.isArray(row.clients) ? row.clients.length : 0,
      status: row.status === "active" ? "Active" : "Inactive",
    };
  });
}

export async function createAdminBranch(input: { name: string; code: string; address: string }) {
  const supabase = createClient();
  const { data: company, error: companyError } = await supabase.from("companies").select("id").order("created_at").limit(1).maybeSingle();
  if (companyError) throw new Error(companyError.message);
  if (!company?.id) throw new Error("Create a company profile before creating a branch.");
  const { error } = await supabase.from("branches").insert({ company_id: company.id, name: input.name.trim(), code: input.code.trim(), address: input.address.trim() || null, status: "active" });
  if (error) throw new Error(error.message);
}
