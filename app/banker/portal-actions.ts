"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { CollectionPaymentMethod, RecordCollectionResult } from "@/app/admin/collection-data";

type Row = Record<string, unknown>;
const db = () => createAdminClient();
const one = (value: unknown): Row | null =>
  Array.isArray(value) ? ((value[0] as Row | undefined) ?? null) : ((value as Row | null) ?? null);
const nameOf = (row: Row | null) =>
  String(row?.full_name ?? "").trim() ||
  [row?.first_name, row?.last_name].filter(Boolean).join(" ") ||
  "Unnamed client";

async function bankerContext() {
  const session = await createClient("banker");
  const { data } = await session.auth.getUser();
  if (!data.user) throw new Error("Your session has expired. Sign in again.");
  const { data: banker, error } = await db()
    .from("bankers")
    .select("id,profile_id,status,employee_number,branch:branches(name),profile:profiles(first_name,last_name,phone,email)")
    .eq("profile_id", data.user.id)
    .single();
  if (error) throw new Error(error.message);
  if (!banker) throw new Error("No banker profile is linked to this signed-in account.");
  if (String(banker.status).toLowerCase() !== "active") throw new Error("This banker account is inactive.");
  return banker as unknown as Row;
}

async function assignedClientIds(bankerId: string) {
  const { data, error } = await db()
    .from("client_banker_assignments")
    .select("client_id")
    .eq("banker_id", bankerId)
    .eq("status", "active");
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Row[]).map((row) => String(row.client_id));
}

export async function loadBankerClients() {
  const banker = await bankerContext();
  const ids = await assignedClientIds(String(banker.id));
  if (!ids.length) return [];
  const { data, error } = await db()
    .from("clients")
    .select("id,client_number,full_name,first_name,last_name,email,phone,residence,business_location,occupation_type,status,created_at")
    .in("id", ids)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Row[]).map((row) => ({
    id: String(row.id), clientNumber: String(row.client_number ?? ""), name: nameOf(row),
    email: String(row.email ?? ""), phone: String(row.phone ?? ""), address: String(row.residence ?? row.business_location ?? ""),
    occupation: String(row.occupation_type ?? ""), status: String(row.status ?? "active"), createdAt: String(row.created_at),
  }));
}

export async function loadBankerMapCustomers() {
  const banker = await bankerContext();
  const ids = await assignedClientIds(String(banker.id));
  if (!ids.length) return [];
  const admin = db();
  const [{ data: clients, error: clientError }, { data: collections, error: collectionError }] = await Promise.all([
    admin.from("clients").select("id,client_number,full_name,first_name,last_name,phone,address,residence,business_location,latitude,longitude").in("id", ids),
    admin.from("collections").select("id,client_id,total_amount,collected_amount,due_date,status,priority").eq("banker_id", banker.id).in("client_id", ids).order("due_date", { ascending: true }),
  ]);
  if (clientError) throw new Error(clientError.message);
  if (collectionError) throw new Error(collectionError.message);
  const today = new Date();
  const day = today.toISOString().slice(0, 10);
  const collectionRows = (collections ?? []) as unknown as Row[];
  return ((clients ?? []) as unknown as Row[]).map((client) => {
    const clientCollections = collectionRows.filter((item) => String(item.client_id) === String(client.id));
    const active = clientCollections.find((item) => String(item.status) !== "paid") ?? clientCollections[0];
    const dueDate = String(active?.due_date ?? "");
    const dueDay = dueDate.slice(0, 10);
    const status = active ? String(active.status ?? "upcoming") : "upcoming";
    const mapStatus = status === "paid" ? "completed" : dueDay < day && dueDay ? "overdue" : dueDay === day ? "due_today" : "upcoming";
    return {
      id: String(client.id), name: nameOf(client), phone: String(client.phone ?? ""),
      address: String(client.address ?? client.residence ?? client.business_location ?? ""),
      latitude: client.latitude === null || client.latitude === undefined ? null : Number(client.latitude),
      longitude: client.longitude === null || client.longitude === undefined ? null : Number(client.longitude),
      amountDue: active ? Math.max(Number(active.total_amount ?? 0) - Number(active.collected_amount ?? 0), 0) : 0,
      status: mapStatus, priority: String(active?.priority ?? "") === "high" || String(active?.priority ?? "") === "urgent",
      dueDate, collectionId: active?.id ? String(active.id) : null,
    };
  });
}

export async function loadBankerClient(clientId: string) {
  const banker = await bankerContext();
  const ids = await assignedClientIds(String(banker.id));
  if (!ids.includes(clientId)) throw new Error("You can only view clients assigned to you.");
  const admin = db();
  const [{ data: client, error: clientError }, { data: loans, error: loanError }, { data: payments, error: paymentError }, { data: visits, error: visitError }, { data: documents, error: documentError }] = await Promise.all([
    admin.from("clients").select("id,client_number,full_name,first_name,last_name,email,phone,date_of_birth,national_id,address,residence,business_location,occupation,occupation_type,gender,marital_status,religion,business_duration,status,created_at").eq("id", clientId).single(),
    admin.from("loans").select("id,loan_number,principal_amount,outstanding_amount,status,created_at").eq("client_id", clientId).order("created_at", { ascending: false }),
    admin.from("payments").select("id,reference,amount,method,paid_at,status").eq("client_id", clientId).order("paid_at", { ascending: false }).limit(20),
    admin.from("banker_visits").select("id,visited_at,notes,created_at").eq("client_id", clientId).eq("banker_id", banker.id).order("visited_at", { ascending: false }),
    admin.from("client_documents").select("id,document_type,file_name,verified_at").eq("client_id", clientId).order("created_at", { ascending: false }),
  ]);
  if (clientError) throw new Error(clientError.message);
  if (loanError) throw new Error(loanError.message);
  if (paymentError) throw new Error(paymentError.message);
  if (visitError) throw new Error(visitError.message);
  if (documentError) throw new Error(documentError.message);
  const row = client as unknown as Row;
  return {
    client: { id: String(row.id), clientNumber: String(row.client_number ?? ""), name: nameOf(row), email: String(row.email ?? ""), phone: String(row.phone ?? ""), dateOfBirth: String(row.date_of_birth ?? "").slice(0, 10), nationalId: String(row.national_id ?? ""), address: String(row.address ?? row.residence ?? row.business_location ?? ""), occupation: String(row.occupation ?? row.occupation_type ?? ""), status: String(row.status ?? "active"), createdAt: String(row.created_at) },
    loans: ((loans ?? []) as unknown as Row[]).map((item) => ({ id: String(item.id), number: String(item.loan_number ?? ""), principal: Number(item.principal_amount ?? 0), outstanding: Number(item.outstanding_amount ?? 0), status: String(item.status ?? "") })),
    payments: ((payments ?? []) as unknown as Row[]).map((item) => ({ id: String(item.id), reference: String(item.reference ?? ""), amount: Number(item.amount ?? 0), method: String(item.method ?? ""), paidAt: String(item.paid_at ?? ""), status: String(item.status ?? "") })),
    visits: ((visits ?? []) as unknown as Row[]).map((item) => ({ id: String(item.id), visitedAt: String(item.visited_at), notes: String(item.notes ?? "") })),
    documents: ((documents ?? []) as unknown as Row[]).map((item) => ({ id: String(item.id), type: String(item.document_type), name: String(item.file_name), status: item.verified_at ? "Verified" : "Pending" })),
  };
}

export async function updateBankerClient(input: { clientId: string; fullName: string; email: string; phone: string; dateOfBirth: string; nationalId: string; address: string; occupation: string }) {
  const banker = await bankerContext();
  const ids = await assignedClientIds(String(banker.id));
  if (!ids.includes(input.clientId)) throw new Error("You can only edit clients assigned to you.");
  const names = input.fullName.trim().split(/\s+/);
  const { error } = await db().from("clients").update({
    full_name: input.fullName.trim(),
    first_name: names[0] || null,
    last_name: names.slice(1).join(" ") || null,
    email: input.email.trim() || null,
    phone: input.phone.trim() || null,
    date_of_birth: input.dateOfBirth || null,
    national_id: input.nationalId.trim() || null,
    address: input.address.trim() || null,
    occupation: input.occupation.trim() || null,
  }).eq("id", input.clientId);
  if (error) throw new Error(error.message);
  revalidatePath("/banker/clients");
  revalidatePath(`/banker/clients/${input.clientId}`);
}

export async function uploadBankerClientDocuments(clientId: string, documents: { type: string; file: File }[]) {
  const banker = await bankerContext();
  const ids = await assignedClientIds(String(banker.id));
  if (!ids.includes(clientId)) throw new Error("You can only upload documents for clients assigned to you.");
  const admin = db();
  for (const document of documents) {
    const extension = document.file.name.split(".").pop()?.toLowerCase() || "bin";
    const storagePath = `${clientId}/${document.type}-${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await admin.storage.from("client-documents").upload(storagePath, document.file, { upsert: false, contentType: document.file.type || undefined });
    if (uploadError) throw new Error(`Unable to upload ${document.file.name}: ${uploadError.message}`);
    const { error: recordError } = await admin.from("client_documents").insert({ client_id: clientId, document_type: document.type, storage_path: storagePath, file_name: document.file.name, mime_type: document.file.type || null });
    if (recordError) throw new Error(`Unable to save ${document.file.name}: ${recordError.message}`);
  }
  revalidatePath(`/banker/clients/${clientId}`);
}

export async function loadBankerCollections() {
  const banker = await bankerContext();
  const assignedIds = await assignedClientIds(String(banker.id));
  if (!assignedIds.length) return [];
  const { data, error } = await db()
    .from("collections")
    .select("id,client_id,account_id,total_amount,collected_amount,due_date,status,reference,client:clients(full_name,first_name,last_name,client_number)")
    .in("client_id", assignedIds)
    .order("due_date", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Row[]).map((row) => ({
    id: String(row.id), clientId: String(row.client_id), clientName: nameOf(one(row.client)),
    clientNumber: String(one(row.client)?.client_number ?? ""), total: Number(row.total_amount ?? 0),
    collected: Number(row.collected_amount ?? 0), remaining: Math.max(Number(row.total_amount ?? 0) - Number(row.collected_amount ?? 0), 0),
    accountId: String(row.account_id ?? ""),
    dueDate: String(row.due_date ?? ""), status: String(row.status ?? ""), reference: String(row.reference ?? ""),
  }));
}

export async function recordBankerCollection(input: {
  collectionId: string;
  clientId: string;
  accountId: string;
  amount: number;
  method: CollectionPaymentMethod;
  description: string;
  idempotencyKey: string;
}) {
  const banker = await bankerContext();
  const assignedIds = await assignedClientIds(String(banker.id));
  if (!assignedIds.includes(input.clientId)) {
    throw new Error("You can only record collections for clients assigned to you.");
  }
  const admin = db();
  const { data: collection, error: collectionError } = await admin
    .from("collections")
    .select("id,client_id,banker_id,account_id,client:clients(full_name,first_name,last_name)")
    .eq("id", input.collectionId)
    .eq("client_id", input.clientId)
    .maybeSingle();
  if (collectionError) throw new Error(collectionError.message);
  if (!collection) throw new Error("This collection schedule was not found for your assigned client.");
  if (String(collection.account_id ?? "") !== input.accountId) {
    throw new Error("The selected account does not belong to this collection.");
  }
  const session = await createClient("banker");
  const { data, error } = await session.rpc("record_collection", {
    p_collection_id: input.collectionId,
    p_client_id: input.clientId,
    p_account_id: input.accountId,
    p_amount: input.amount,
    p_method: input.method,
    p_idempotency_key: input.idempotencyKey,
    p_description: input.description.trim() || null,
  }).single();
  if (error) throw new Error(error.message);
  const collectionResult = data as RecordCollectionResult;
  const bankerProfile = one(banker.profile);
  const bankerName = [String(bankerProfile?.first_name ?? ""), String(bankerProfile?.last_name ?? "")].filter(Boolean).join(" ") || "Banker";
  const clientName = nameOf(one(collection.client));
  const receipt = String(collectionResult.receipt_reference ?? collectionResult.transaction_reference ?? "");
  try {
    await notifyAdminProfiles(
      "Collection recorded",
      `${bankerName} recorded ${input.amount.toFixed(2)} by ${input.method.replaceAll("_", " ")} for ${clientName}${receipt ? ` (receipt ${receipt})` : ""}.`,
      "success",
    );
  } catch (notificationError) {
    console.error("Unable to notify administrators about a banker collection", notificationError);
  }
  revalidatePath("/banker/collections");
  revalidatePath(`/banker/clients/${input.clientId}`);
  return data;
}

async function notifyAdminProfiles(title: string, message: string, type: "info" | "success" | "warning" | "error") {
  const admin = db();
  const { data: assignments, error } = await admin.from("user_roles").select("profile_id,role:roles(name)");
  if (error) throw new Error(error.message);
  const profileIds = ((assignments ?? []) as unknown as Row[])
    .filter((row) => {
      const role = one(row.role);
      return ["admin", "company_admin", "super_admin"].includes(String(role?.name ?? "").trim().toLowerCase());
    })
    .map((row) => String(row.profile_id));
  if (!profileIds.length) return;
  const { error: insertError } = await admin.from("notifications").insert(profileIds.map((profile_id) => ({ profile_id, title, message, type })));
  if (insertError) throw new Error(insertError.message);
}

export async function loadBankerPerformance() {
  const banker = await bankerContext();
  const bankerId = String(banker.id);
  const assignedIds = await assignedClientIds(bankerId);
  const admin = db();
  const now = new Date();
  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const startOfWeek = new Date(startOfDay);
  startOfWeek.setUTCDate(startOfWeek.getUTCDate() - ((startOfWeek.getUTCDay() + 6) % 7));
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(now);
  const dateRange = (start: Date) => ({ start: start.toISOString(), end: end.toISOString() });
  const [dayRange, weekRange, monthRange] = [dateRange(startOfDay), dateRange(startOfWeek), dateRange(startOfMonth)];

  const [{ data: targets, error: targetError }, { data: collections, error: collectionError }, { data: visits, error: visitError }, { data: clients, error: clientError }, { data: commissions, error: commissionError }] = await Promise.all([
    admin.from("banker_targets").select("target_date,target_amount").eq("banker_id", bankerId)
      .gte("target_date", startOfMonth.toISOString().slice(0, 10))
      .lte("target_date", end.toISOString().slice(0, 10)),
    admin.from("collections").select("id,client_id,total_amount,collected_amount,due_date,status,created_at").eq("banker_id", bankerId),
    admin.from("banker_visits").select("id,client_id,visited_at").eq("banker_id", bankerId),
    assignedIds.length
      ? admin.from("clients").select("id,created_at").in("id", assignedIds)
      : Promise.resolve({ data: [], error: null }),
    admin.from("commissions").select("amount,created_at,paid_at").eq("banker_id", bankerId),
  ]);
  if (targetError) throw new Error(targetError.message);
  if (collectionError) throw new Error(collectionError.message);
  if (visitError) throw new Error(visitError.message);
  if (clientError) throw new Error(clientError.message);
  if (commissionError) throw new Error(commissionError.message);

  const rows = (collections ?? []) as unknown as Row[];
  const targetRows = (targets ?? []) as unknown as Row[];
  const visitRows = (visits ?? []) as unknown as Row[];
  const clientRows = (clients ?? []) as unknown as Row[];
  const commissionRows = (commissions ?? []) as unknown as Row[];
  const inRange = (value: unknown, range: { start: string; end: string }) => {
    const date = String(value ?? "");
    return date >= range.start && date <= range.end;
  };
  const metrics = (range: { start: string; end: string }) => {
    const periodCollections = rows.filter((row) => inRange(row.due_date ?? row.created_at, range));
    const scheduled = periodCollections.reduce((sum, row) => sum + Number(row.total_amount ?? 0), 0);
    const collected = periodCollections.reduce((sum, row) => sum + Number(row.collected_amount ?? 0), 0);
    return {
      target: targetRows.filter((row) => String(row.target_date) >= range.start.slice(0, 10) && String(row.target_date) <= range.end.slice(0, 10)).reduce((sum, row) => sum + Number(row.target_amount ?? 0), 0),
      collected,
      scheduled,
      outstanding: Math.max(scheduled - collected, 0),
      collections: periodCollections.filter((row) => Number(row.collected_amount ?? 0) > 0).length,
      visits: visitRows.filter((row) => inRange(row.visited_at, range)).length,
      achievement: 0,
      collectionRate: scheduled ? (collected / scheduled) * 100 : 0,
    };
  };
  const daily = metrics(dayRange);
  const weekly = metrics(weekRange);
  const monthly = metrics(monthRange);
  daily.achievement = daily.target ? (daily.collected / daily.target) * 100 : 0;
  weekly.achievement = weekly.target ? (weekly.collected / weekly.target) * 100 : 0;
  monthly.achievement = monthly.target ? (monthly.collected / monthly.target) * 100 : 0;
  return {
    daily,
    weekly,
    monthly: {
      ...monthly,
      newClients: clientRows.filter((row) => inRange(row.created_at, monthRange)).length,
      activeClients: assignedIds.length,
      commission: commissionRows.filter((row) => inRange(row.created_at ?? row.paid_at, monthRange)).reduce((sum, row) => sum + Number(row.amount ?? 0), 0),
    },
    chart: [
      { name: "Daily", target: daily.target, collected: daily.collected },
      { name: "Weekly", target: weekly.target, collected: weekly.collected },
      { name: "Monthly", target: monthly.target, collected: monthly.collected },
    ],
  };
}

export async function loadBankerVisits() {
  const banker = await bankerContext();
  const { data, error } = await db().from("banker_visits")
    .select("id,client_id,visited_at,notes,client:clients(full_name,first_name,last_name,client_number)")
    .eq("banker_id", banker.id).order("visited_at", { ascending: false }).limit(100);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Row[]).map((row) => ({
    id: String(row.id), clientId: String(row.client_id ?? ""), clientName: nameOf(one(row.client)),
    visitedAt: String(row.visited_at), notes: String(row.notes ?? ""),
  }));
}

export async function recordBankerVisit(input: { clientId: string; notes: string }) {
  const banker = await bankerContext();
  const ids = await assignedClientIds(String(banker.id));
  if (!ids.includes(input.clientId)) throw new Error("You can only record visits for assigned clients.");
  const { error } = await db().from("banker_visits").insert({ banker_id: banker.id, client_id: input.clientId, visited_at: new Date().toISOString(), notes: input.notes.trim() || null });
  if (error) throw new Error(error.message);
  revalidatePath("/banker");
  revalidatePath("/banker/visits");
  revalidatePath(`/banker/clients/${input.clientId}`);
  return { ok: true as const };
}
