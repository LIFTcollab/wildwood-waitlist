"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function SignOutButton() {
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <button
      onClick={handleSignOut}
      title="Sign out"
      aria-label="Sign out"
      className="ml-auto text-[11px] text-text-3 hover:text-text-2 transition-colors leading-none"
    >
      →
    </button>
  );
}
