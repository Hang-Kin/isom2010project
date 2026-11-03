"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ImportNavLink } from "@/components/import/ImportNavLink";

const links = [
  { href: "/dashboard/achievements", label: "Achievements" },
  { href: "/dashboard/export", label: "Export" },
];

export function DashboardNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Dashboard" className="flex flex-wrap gap-2 border-b border-line pb-3">
      {links.map((link) => {
        const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={active ? "btn btn-secondary" : "btn btn-ghost"}
          >
            {link.label}
          </Link>
        );
      })}
      {/* FEAT-4: import */}
      <ImportNavLink />
    </nav>
  );
}
