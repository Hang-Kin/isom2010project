import type { Metadata } from "next";
import { Suspense } from "react";
import { AchievementList } from "@/components/achievements/AchievementList";
import { StatusMessage } from "@/components/ui";

export const metadata: Metadata = {
  title: "Achievements",
};

export default function AchievementsPage() {
  return (
    <Suspense fallback={<StatusMessage tone="info">Loading achievements…</StatusMessage>}>
      <AchievementList />
    </Suspense>
  );
}
