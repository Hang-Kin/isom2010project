import type { Metadata } from "next";
import { AchievementForm } from "@/components/achievements/AchievementForm";

export const metadata: Metadata = {
  title: "Edit achievement",
};

export default async function EditAchievementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AchievementForm mode="edit" achievementId={id} />;
}
