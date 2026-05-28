/**
 * Reads the organization slug set by middleware.
 *
 * Middleware extracts the subdomain from the request host and forwards it
 * as the `x-org-slug` request header. Server components and route handlers
 * can call this to know which tenant is being served.
 *
 * Returns null on the apex domain (liftcollab.app with no subdomain).
 */
import { headers } from "next/headers";

export async function getOrgSlug(): Promise<string | null> {
  const headersList = await headers();
  return headersList.get("x-org-slug");
}
