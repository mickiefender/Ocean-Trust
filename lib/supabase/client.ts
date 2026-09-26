"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/supabase/database.types";

export function createClient(scope = "default") {
  const cookieName = scope === "default" ? undefined : `ocean-trust-${scope}-auth`;
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: {
        name: cookieName,
        maxAge: 60 * 60,
        sameSite: "lax",
      },
    },
  );
}
