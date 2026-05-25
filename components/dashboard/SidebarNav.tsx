"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/dashboard", icon: "⊞", label: "Dashboard", exact: true },
  { href: "/dashboard/waitlist", icon: "☰", label: "Waitlist", exact: false },
  { href: "/dashboard/tasks", icon: "✓", label: "Tasks", exact: false },
  { href: "/dashboard/families", icon: "♡", label: "Families", exact: false },
] as const;

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <div className="space-y-0.5">
      {NAV_ITEMS.map(({ href, icon, label, exact }) => {
        const active = exact
          ? pathname === href
          : pathname === href || pathname.startsWith(href + "/");

        return (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-[13.5px] transition-colors ${
              active
                ? "bg-green-soft text-green-deep font-medium"
                : "text-text-2 hover:bg-[rgba(74,124,89,0.06)] hover:text-text"
            }`}
          >
            <span
              className={`text-[13px] ${active ? "text-green" : "text-text-3"}`}
            >
              {icon}
            </span>
            <span>{label}</span>
          </Link>
        );
      })}
    </div>
  );
}
