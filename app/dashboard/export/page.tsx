import type { Metadata } from "next";
import { ExportWorkspace } from "@/components/export/ExportWorkspace";
import { PacketBar } from "@/components/export/PacketBar";

export const metadata: Metadata = {
  title: "Export",
};

export default function ExportPage() {
  return (
    <>
      {/* FEAT-2: packets */}
      <PacketBar />
      <ExportWorkspace />
    </>
  );
}
