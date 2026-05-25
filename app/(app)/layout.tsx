import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import SignOutButton from "@/components/dashboard/SignOutButton";
import { TopNav } from "@/components/dashboard/TopNav";

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

  const { data: profile } = await supabase
    .from("user_profiles_view")
    .select("name, role, organization_name")
    .eq("id", user.id)
    .single();

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
    <div className="min-h-screen flex flex-col bg-bg">

      {/* ── Top nav bar ──────────────────────────────────────────────── */}
      <header className="sticky top-0 z-10 bg-surface-warm border-b border-border">
        <div className="flex items-center h-14 px-6 gap-5">

          {/* Brand */}
          <div className="flex items-center gap-2.5 flex-shrink-0">
            <div className="w-7 h-7 bg-green rounded-lg flex items-center justify-center flex-shrink-0">
              <svg
                viewBox="0 0 24 24"
                fill="currentColor"
                className="w-[15px] h-[15px] text-white"
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
            <span className="font-serif text-[17px] font-medium text-text tracking-[-0.01em]">
              Wildwood
            </span>
          </div>

          {/* Divider */}
          <div className="h-5 w-px bg-border flex-shrink-0" />

          {/* Nav links (client component — needs usePathname) */}
          <TopNav />

          {/* Push user info to right edge */}
          <div className="flex-1" />

          {/* User info + sign out */}
          <div className="flex items-center gap-2.5 flex-shrink-0">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-semibold flex-shrink-0 bg-gradient-to-br from-[#a3c4ae] to-[#4a7c59]">
              {initials}
            </div>
            <div>
              <div className="text-[13px] font-medium text-text leading-tight">
                {profile.name ?? user.email}
              </div>
              <div className="text-[11px] text-text-3">
                {profile.role} · {profile.organization_name ?? "Wildwood"}
              </div>
            </div>
            <SignOutButton />
          </div>

        </div>
      </header>

      {/* ── Page content ─────────────────────────────────────────────── */}
      <main className="flex-1 bg-bg">{children}</main>

    </div>
  );
}
