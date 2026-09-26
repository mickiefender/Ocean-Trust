"use server";

import { createClient } from "@/lib/supabase/server";

type NotificationRow = {
  id: string;
  title: string;
  message: string;
  type: "info" | "success" | "warning" | "error";
  read_at: string | null;
  created_at: string;
};

async function sessionFor(scope: "admin" | "banker") {
  const session = await createClient(scope === "banker" ? "banker" : "default");
  const { data } = await session.auth.getUser();
  if (!data.user) throw new Error("Your session has expired. Sign in again.");
  return { session, userId: data.user.id };
}

async function ensureReminder(session: Awaited<ReturnType<typeof createClient>>, profileId: string, title: string, message: string, type: NotificationRow["type"]) {
  const { data } = await session.from("notifications").select("id").eq("profile_id", profileId).eq("title", title).eq("message", message).is("read_at", null).limit(1);
  if (!data?.length) await session.from("notifications").insert({ profile_id: profileId, title, message, type });
}

export async function loadNotifications(scope: "admin" | "banker"): Promise<NotificationRow[]> {
  const { session, userId } = await sessionFor(scope);
  if (scope === "admin") {
    const [{ count: pendingApplications }, { count: overdueCollections }] = await Promise.all([
      session.from("loan_applications").select("id", { count: "exact", head: true }).eq("decision", "pending"),
      session.from("collections").select("id", { count: "exact", head: true }).neq("status", "paid").lt("due_date", new Date().toISOString().slice(0, 10)),
    ]);
    if (pendingApplications) await ensureReminder(session, userId, "Pending client applications", `${pendingApplications} client application${pendingApplications === 1 ? "" : "s"} require review.`, "info");
    if (overdueCollections) await ensureReminder(session, userId, "Overdue collections", `${overdueCollections} collection${overdueCollections === 1 ? "" : "s"} require follow-up.`, "warning");
  } else {
    const { data: banker } = await session.from("bankers").select("id").eq("profile_id", userId).single();
    if (banker) {
      const { data: assignments } = await session.from("client_banker_assignments").select("client_id").eq("banker_id", banker.id).eq("status", "active");
      const clientIds = (assignments ?? []).map((row) => row.client_id);
      if (clientIds.length) {
        const [{ count: overdue }, { count: pendingDocuments }] = await Promise.all([
          session.from("collections").select("id", { count: "exact", head: true }).in("client_id", clientIds).neq("status", "paid").lt("due_date", new Date().toISOString().slice(0, 10)),
          session.from("client_documents").select("id", { count: "exact", head: true }).in("client_id", clientIds).is("verified_at", null),
        ]);
        if (overdue) await ensureReminder(session, userId, "Overdue collection follow-up", `${overdue} assigned collection${overdue === 1 ? "" : "s"} ${overdue === 1 ? "is" : "are"} overdue.`, "warning");
        if (pendingDocuments) await ensureReminder(session, userId, "Client documents need review", `${pendingDocuments} document${pendingDocuments === 1 ? "" : "s"} from assigned clients await review.`, "info");
      }
    }
  }
  const { data, error } = await session.from("notifications").select("id,title,message,type,read_at,created_at").eq("profile_id", userId).order("created_at", { ascending: false }).limit(50);
  if (error) throw new Error(error.message);
  return (data ?? []) as NotificationRow[];
}

export async function markNotificationRead(scope: "admin" | "banker", id: string) {
  const { session, userId } = await sessionFor(scope);
  const { error } = await session.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id).eq("profile_id", userId);
  if (error) throw new Error(error.message);
}

export async function markAllNotificationsRead(scope: "admin" | "banker") {
  const { session, userId } = await sessionFor(scope);
  const { error } = await session.from("notifications").update({ read_at: new Date().toISOString() }).eq("profile_id", userId).is("read_at", null);
  if (error) throw new Error(error.message);
}

export async function countUnreadCollectionNotifications(): Promise<number> {
  const { session, userId } = await sessionFor("admin");
  const { count, error } = await session
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", userId)
    .eq("title", "Collection recorded")
    .is("read_at", null);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function markCollectionNotificationsRead(): Promise<void> {
  const { session, userId } = await sessionFor("admin");
  const { error } = await session
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("profile_id", userId)
    .eq("title", "Collection recorded")
    .is("read_at", null);
  if (error) throw new Error(error.message);
}
