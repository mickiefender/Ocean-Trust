import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const roleRoutes: Record<string, string> = {
  super_admin: "/admin",
  company_admin: "/admin",
  admin: "/admin",
  manager: "/manager",
  finance_officer: "/finance",
  banker: "/banker",
  client: "/client",
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.redirect(new URL("/login", request.url));

  const { data: assignments } = await supabase
    .from("user_roles")
    .select("roles(name)")
    .eq("profile_id", user.id);
  const roleAssignments = (assignments ?? []) as unknown as Array<{
    roles?: { name?: string } | Array<{ name?: string }>;
  }>;
  const roles = roleAssignments
    .map((assignment) => {
      const role = assignment.roles;
      return Array.isArray(role) ? role[0]?.name : role?.name;
    })
    .filter((role): role is string => Boolean(role));
  const destination =
    roles.map((role) => roleRoutes[role]).find(Boolean) ?? "/login?error=role";
  const requestedPath = url.searchParams.get("next");
  const safeRequestedPath =
    requestedPath?.startsWith("/") && !requestedPath.startsWith("//")
      ? requestedPath
      : destination;

  return NextResponse.redirect(new URL(safeRequestedPath, request.url));
}
