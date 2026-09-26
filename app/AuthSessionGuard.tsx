"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const isProtected = (pathname: string) =>
  ["/admin", "/manager", "/finance", "/banker", "/client"].some((prefix) =>
    pathname.startsWith(prefix),
  );

export default function AuthSessionGuard() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!isProtected(pathname) || pathname === "/banker/login") return;

    const scope = pathname.startsWith("/banker") ? "banker" : "default";
    const client = createClient(scope);
    const loginPath = scope === "banker" ? "/banker/login" : "/login";
    let redirecting = false;

    const redirectToLogin = () => {
      if (redirecting || window.location.pathname === loginPath) return;
      redirecting = true;
      const next = `${window.location.pathname}${window.location.search}`;
      router.replace(`${loginPath}?next=${encodeURIComponent(next)}`);
    };

    void client.auth.getSession().then(({ data }) => {
      if (!data.session) redirectToLogin();
    });

    const { data: subscription } = client.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        redirectToLogin();
      }
    });

    return () => subscription.subscription.unsubscribe();
  }, [pathname, router]);

  return null;
}
