import type { Metadata } from "next";
import { ProfileForm } from "@/components/profile/ProfileForm";

export const metadata: Metadata = {
  title: "Profile",
};

export default function ProfilePage() {
  return <ProfileForm />;
}
