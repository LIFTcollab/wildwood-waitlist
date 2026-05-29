import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Extracts the organization slug from the request host.
 *
 * Examples:
 *   wildwood.liftcollab.app  → "wildwood"
 *   wildwood.localhost:3000  → "wildwood"
 *   localhost:3000           → NEXT_PUBLIC_DEFAULT_ORG_SLUG ?? "wildwood"
 *   liftcollab.app           → null  (apex domain — no org context)
 */
function extractOrgSlug(host: string): string | null {
  const [hostname] = host.split(":");
  const parts = hostname.split(".");

  if (hostname === "localhost") {
    // Plain localhost — use the configured dev default
    return process.env.NEXT_PUBLIC_DEFAULT_ORG_SLUG ?? "wildwood";
  }

  if (parts.at(-1) === "localhost") {
    // wildwood.localhost:3000 — subdomain-per-tenant local dev
    return parts.length >= 2 ? parts[0] : null;
  }

  if (parts.length >= 3) {
    // subdomain.domain.tld  (e.g. wildwood.liftcollab.app)
    return parts[0];
  }

  // Apex domain (liftcollab.app) — no org context
  return null;
}

export async function proxy(request: NextRequest) {
  const orgSlug = extractOrgSlug(request.headers.get("host") ?? "");

  /**
   * Builds a fresh Headers object from the current request headers,
   * injecting the org slug. Called once at startup and again inside
   * setAll() after Supabase mutates request.cookies (which updates
   * the underlying Cookie header), so the forwarded request always
   * carries both the refreshed session cookie and the org context.
   */
  function buildRequestHeaders(): Headers {
    const headers = new Headers(request.headers);
    // Always strip any client-supplied value first so x-org-slug can only ever
    // be set by this proxy from the request host — never spoofed by the caller
    // (it would otherwise pass through on the apex domain, where orgSlug is null).
    headers.delete("x-org-slug");
    if (orgSlug) headers.set("x-org-slug", orgSlug);
    return headers;
  }

  let supabaseResponse = NextResponse.next({
    request: { headers: buildRequestHeaders() },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Mutate request.cookies so the updated Cookie header is visible
          // in request.headers before we snapshot it below.
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          // Rebuild the response with the freshly-updated headers so
          // server components downstream receive both the refreshed
          // session cookie and the org slug header.
          supabaseResponse = NextResponse.next({
            request: { headers: buildRequestHeaders() },
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session if expired — must not return early before this call.
  await supabase.auth.getUser();

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
