import type { Metadata } from "next";
import { BackupWorkspace } from "@/components/backup/BackupWorkspace";

export const metadata: Metadata = {
  title: "Backup",
};

export default function BackupPage() {
  return <BackupWorkspace />;
}
