"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function ImportNavLink() {
  const pathname = usePathname();
  const active = pathname === "/dashboard/import" || pathname.startsWith("/dashboard/import/");

  return (
    <Link
      href="/dashboard/import"
      aria-current={active ? "page" : undefined}
      className={active ? "btn btn-secondary" : "btn btn-ghost"}
    >
      Import
    </Link>
  );
}
