import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

const protectedPrefixes = ["/admin", "/manager", "/finance", "/banker", "/client"];
const authPages = ["/login", "/banker/login", "/forgot-password", "/reset-password"];

export async function middleware(request: NextRequest) {
  // If user visits the site root, send them to the login page as the first page
  if (request.nextUrl.pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  let response = NextResponse.next({ request });
  const scope = request.nextUrl.pathname.startsWith("/banker") ? "banker" : "default";
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: {
        name: scope === "default" ? undefined : `ocean-trust-${scope}-auth`,
        maxAge: 60 * 60,
        sameSite: "lax",
      },
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { data } = await supabase.auth.getUser();
  const isProtected =
    !authPages.includes(request.nextUrl.pathname) &&
    protectedPrefixes.some((prefix) =>
      request.nextUrl.pathname.startsWith(prefix),
    );

  if (!data.user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = request.nextUrl.pathname.startsWith("/banker") ? "/banker/login" : "/login";
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  if (data.user && authPages.includes(request.nextUrl.pathname)) {
    if (request.nextUrl.pathname === "/login" && request.nextUrl.searchParams.get("error") === "role") {
      return response;
    }
    if (request.nextUrl.pathname === "/banker/login") {
      return NextResponse.redirect(new URL("/banker", request.url));
    }
    return NextResponse.redirect(new URL("/auth/redirect", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
