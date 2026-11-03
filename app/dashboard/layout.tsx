import type { ReactNode } from "react";
import { DashboardNav } from "@/components/DashboardNav";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-8">
      <DashboardNav />
      {children}
    </div>
  );
}
