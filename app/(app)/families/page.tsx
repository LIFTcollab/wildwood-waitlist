import { redirect } from "next/navigation";

// Families have moved to the Admin page.
export default async function FamiliesRedirect({
  searchParams,
}: {
  searchParams: Promise<{ open?: string }>;
}) {
  const { open } = await searchParams;
  redirect(open ? `/settings?open=${open}` : "/settings");
}
