import { createClient } from "@/lib/supabase/server";
import { WaitlistTable } from "@/components/dashboard/WaitlistTable";

export const metadata = { title: "All children — Wildwood" };

export default async function ChildrenPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: items, error }, { data: terms }, { data: profile }] =
    await Promise.all([
      supabase
        .from("waitlist_items_view")
        .select(
          "id, child_id, child_full_name, first_name, last_name, dob, priority_status, priority_rank, term_name, term_id, status, classroom, date_applied, notes, created_at"
        )
        .order("priority_rank", { ascending: true, nullsFirst: false })
        .order("child_full_name", { ascending: true }),
      supabase
        .from("school_terms")
        .select("id, name, sort_order")
        .order("sort_order", { ascending: true }),
      user
        ? supabase
            .from("user_profiles_view")
            .select("role")
            .eq("id", user.id)
            .single()
        : Promise.resolve({ data: null, error: null }),
    ]);

  if (error) {
    return (
      <div className="p-8">
        <p className="text-terra text-sm">
          Failed to load waitlist: {error.message}
        </p>
      </div>
    );
  }

  const canEdit =
    profile?.role === "Admin" || profile?.role === "Director";

  const count = items?.length ?? 0;

  return (
    <div className="p-8">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="font-serif text-[26px] font-medium text-text leading-tight">
          All children
        </h1>
        <p className="mt-1 text-[13.5px] text-text-2">
          <span className="font-mono">{count}</span>{" "}
          {count === 1 ? "waitlist entry" : "waitlist entries"}
        </p>
      </div>

      <WaitlistTable items={items ?? []} terms={terms ?? []} canEdit={canEdit} />
    </div>
  );
}
