import type { Metadata } from "next";
import { DashboardNav } from "@/components/DashboardNav";
import { ProfileForm } from "@/components/profile/ProfileForm";

export const metadata: Metadata = {
  title: "Profile",
};

export default function ProfilePage() {
  return (
    <div className="space-y-8">
      <DashboardNav />
      <ProfileForm />
    </div>
  );
}
