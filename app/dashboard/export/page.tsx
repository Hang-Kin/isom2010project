import type { Metadata } from "next";
import { ExportWorkspace } from "@/components/export/ExportWorkspace";
import { PacketBar } from "@/components/export/PacketBar";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = {
  title: "Export",
};

export default function ExportPage() {
  return (
    <>
      <PageHeader title="Export" lede="Select entries -> check answers -> generate PDF." />
      {/* FEAT-2: packets */}
      <PacketBar />
      <ExportWorkspace />
    </>
  );
}
