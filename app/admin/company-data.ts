import { createClient } from "@/lib/supabase/client";

export type AdminCompany = {
  id: string;
  name: string;
  legalName: string;
  registrationNumber: string;
  email: string;
  phone: string;
  address: string;
};

export async function loadAdminCompany(): Promise<AdminCompany | null> {
  const { data, error } = await createClient().from("companies").select("id,name,legal_name,registration_number,email,phone,address").order("created_at").limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return { id: data.id, name: data.name, legalName: data.legal_name ?? "", registrationNumber: data.registration_number ?? "", email: data.email ?? "", phone: data.phone ?? "", address: data.address ?? "" };
}

export async function saveAdminCompany(company: Omit<AdminCompany, "id">, id?: string) {
  const supabase = createClient();
  const payload = { name: company.name.trim(), legal_name: company.legalName.trim() || null, registration_number: company.registrationNumber.trim() || null, email: company.email.trim() || null, phone: company.phone.trim() || null, address: company.address.trim() || null, status: "active" as const };
  const result = id ? await supabase.from("companies").update(payload).eq("id", id) : await supabase.from("companies").insert(payload);
  if (result.error) throw new Error(result.error.message);
}
