import { createClient } from "@/lib/supabase/server";
import { WaitlistTable } from "@/modules/waitlist/components/WaitlistTable";

export const metadata = { title: "Waitlist — Wildwood" };

export default async function ChildrenPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: items, error }, { data: terms }, { data: profile }, { data: openTaskRows }] =
    await Promise.all([
      supabase
        .from("waitlist_items_view")
        .select(
          "id, child_id, child_full_name, first_name, last_name, dob, priority_status, priority_rank, term_name, term_id, status, classroom, date_applied, notes, child_notes, created_at"
        )
        .order("priority_rank", { ascending: true, nullsFirst: false })
        .order("child_full_name", { ascending: true }),
      supabase
        .from("wl_school_terms")
        .select("id, name, status, start_date, end_date, sort_order")
        .order("sort_order", { ascending: true }),
      user
        ? supabase
            .from("user_profiles_view")
            .select("role")
            .eq("id", user.id)
            .single()
        : Promise.resolve({ data: null, error: null }),
      supabase
        .from("wl_tasks")
        .select("waitlist_item_id")
        .in("status", ["To Do", "Doing"])
        .not("waitlist_item_id", "is", null),
    ]);

  // Build a count of open tasks per waitlist item id
  const taskCounts: Record<string, number> = {};
  for (const row of openTaskRows ?? []) {
    if (row.waitlist_item_id) {
      taskCounts[row.waitlist_item_id] = (taskCounts[row.waitlist_item_id] ?? 0) + 1;
    }
  }

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

  return (
    <div className="p-8">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="font-serif text-[26px] font-medium text-text leading-tight">
          Full Waitlist
        </h1>
      </div>

      <WaitlistTable items={items ?? []} terms={terms ?? []} canEdit={canEdit} taskCounts={taskCounts} />
    </div>
  );
}
