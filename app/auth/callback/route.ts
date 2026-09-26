import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next");
  const supabase = await createClient();

  if (!code) return NextResponse.redirect(new URL("/login?error=verification", request.url));
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL("/login?error=verification", request.url));

  const redirect = new URL("/auth/redirect", request.url);
  if (next) redirect.searchParams.set("next", next);
  return NextResponse.redirect(redirect);
}
