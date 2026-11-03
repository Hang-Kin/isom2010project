import type { Metadata } from "next";
import { ExportWorkspace } from "@/components/export/ExportWorkspace";

export const metadata: Metadata = {
  title: "Export",
};

export default function ExportPage() {
  return <ExportWorkspace />;
}
