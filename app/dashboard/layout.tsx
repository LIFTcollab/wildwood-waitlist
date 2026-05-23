import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import SignOutButton from "@/components/dashboard/SignOutButton";

const TERM_CSS_VARS = ["--green", "--gold", "--terra", "--blue"] as const;

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [{ data: profile }, { data: terms }] = await Promise.all([
    supabase
      .from("user_profiles_view")
      .select("name, role, organization_name")
      .eq("id", user.id)
      .single(),
    supabase
      .from("school_terms")
      .select("id, name, sort_order")
      .order("sort_order", { ascending: true }),
  ]);

  if (!profile) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center px-6">
        <div className="max-w-sm text-center">
          <p className="font-serif text-xl text-text">Account not set up</p>
          <p className="mt-2 text-sm text-text-2 leading-relaxed">
            Your account isn&apos;t fully configured — contact your
            administrator to be added.
          </p>
          <SignOutButton />
        </div>
      </div>
    );
  }

  const initials = profile.name
    ? profile.name
        .split(" ")
        .map((n: string) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : (user.email?.slice(0, 2).toUpperCase() ?? "?");

  return (
    <div
      className="grid min-h-screen"
      style={{ gridTemplateColumns: "232px 1fr" }}
    >
      {/* Sidebar */}
      <aside className="bg-surface-warm border-r border-border sticky top-0 h-screen flex flex-col">
        {/* Brand */}
        <div className="px-5 pb-5 pt-[22px] border-b border-border flex items-center gap-[11px] flex-shrink-0">
          <div className="w-8 h-8 bg-green rounded-lg flex items-center justify-center flex-shrink-0">
            <svg
              viewBox="0 0 24 24"
              fill="currentColor"
              className="w-[18px] h-[18px] text-white"
            >
              <path
                d="M12 2C12 2 7 6 7 12c0 4 2.5 7 5 7s5-3 5-7c0-6-5-10-5-10z"
                opacity="0.4"
              />
              <path
                d="M12 2v20M12 8c0 0-3 1-3 4M12 8c0 0 3 1 3 4M12 14c0 0-2 1-2 3M12 14c0 0 2 1 2 3"
                stroke="currentColor"
                strokeWidth="1.5"
                fill="none"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <div>
            <div className="font-serif text-[18px] font-medium leading-tight text-text tracking-[-0.01em]">
              Wildwood
            </div>
            <div className="font-serif text-[11px] italic text-text-3 mt-0.5">
              Waitlist & enrollment
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-4">
          {/* Main nav */}
          <div className="space-y-0.5">
            <NavItem icon="⊞" label="Dashboard" active />
            <NavItem icon="☰" label="All children" />
            <NavItem icon="✓" label="Tasks" />
            <NavItem icon="♡" label="Families" />
          </div>

          {/* Terms */}
          {terms && terms.length > 0 && (
            <div>
              <div className="px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-text-3">
                Terms
              </div>
              <div className="mt-1 space-y-0.5">
                {terms.map((term, i) => (
                  <div
                    key={term.id}
                    className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-[13.5px] text-text-2 hover:bg-[rgba(74,124,89,0.06)] hover:text-text cursor-default transition-colors"
                  >
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{
                        background: `var(${TERM_CSS_VARS[i % TERM_CSS_VARS.length]})`,
                      }}
                    />
                    <span>{term.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Workspace */}
          <div>
            <div className="px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-text-3">
              Workspace
            </div>
            <div className="mt-1 space-y-0.5">
              <NavItem icon="⚙" label="Settings" />
              <NavItem icon="◯" label="Staff users" />
            </div>
          </div>
        </nav>

        {/* User card */}
        <div className="p-3 flex-shrink-0">
          <div className="flex items-center gap-2.5 p-3 bg-surface border border-border rounded-[9px]">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-semibold flex-shrink-0 bg-gradient-to-br from-[#a3c4ae] to-[#4a7c59]">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-medium text-text truncate leading-tight">
                {profile.name ?? user.email}
              </div>
              <div className="text-[11px] text-text-3 mt-0.5">
                {profile.role} · {profile.organization_name ?? "Wildwood"}
              </div>
            </div>
            <SignOutButton />
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="bg-bg min-w-0">{children}</main>
    </div>
  );
}

function NavItem({
  icon,
  label,
  active = false,
}: {
  icon: string;
  label: string;
  active?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-[13.5px] cursor-default transition-colors ${
        active
          ? "bg-green-soft text-green-deep font-medium"
          : "text-text-2 hover:bg-[rgba(74,124,89,0.06)] hover:text-text"
      }`}
    >
      <span className={`text-[13px] ${active ? "text-green" : "text-text-3"}`}>
        {icon}
      </span>
      <span>{label}</span>
    </div>
  );
}
