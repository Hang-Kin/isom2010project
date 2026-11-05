import type { ReactNode } from "react";
import { DashboardNav } from "@/components/DashboardNav";
import { EventNotice } from "@/components/EventNotice"; // FEAT-7

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-8">
      <DashboardNav />
      {children}
      <footer className="border-t border-line pt-4">
        <EventNotice /> {/* FEAT-7 */}
      </footer>
    </div>
  );
}
