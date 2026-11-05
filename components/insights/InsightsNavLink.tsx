"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { fetchIsAdmin } from "@/lib/insights";

export function InsightsNavLink() {
  const pathname = usePathname();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let active = true;

    void fetchIsAdmin()
      .then((allowed) => {
        if (active) setIsAdmin(allowed);
      })
      .catch(() => {
        if (active) setIsAdmin(false);
      });

    return () => {
      active = false;
    };
  }, []);

  if (!isAdmin) return null;

  const active = pathname === "/dashboard/insights" || pathname.startsWith("/dashboard/insights/");

  return (
    <Link
      href="/dashboard/insights"
      aria-current={active ? "page" : undefined}
      className={active ? "btn btn-secondary" : "btn btn-ghost"}
    >
      Insights
    </Link>
  );
}
