import type { Metadata } from "next";
import { AchievementForm } from "@/components/achievements/AchievementForm";

export const metadata: Metadata = {
  title: "Add achievement",
};

export default function NewAchievementPage() {
  return <AchievementForm mode="create" />;
}
