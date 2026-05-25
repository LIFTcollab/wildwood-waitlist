"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", exact: true  },
  { href: "/waitlist",  label: "Waitlist",  exact: false },
  { href: "/families",  label: "Families",  exact: false },
] as const;

export function TopNav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1">
      {NAV_ITEMS.map(({ href, label, exact }) => {
        const active = exact
          ? pathname === href
          : pathname === href || pathname.startsWith(href + "/");

        return (
          <Link
            key={href}
            href={href}
            className={`px-3 py-1.5 rounded-md text-[13.5px] font-medium transition-colors ${
              active
                ? "bg-green-soft text-green-deep"
                : "text-text-2 hover:bg-[rgba(74,124,89,0.06)] hover:text-text"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
