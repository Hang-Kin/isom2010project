import type { Metadata } from "next";
import { InsightsWorkspace } from "@/components/insights/InsightsWorkspace";

export const metadata: Metadata = {
  title: "Insights",
};

export default function InsightsPage() {
  return <InsightsWorkspace />;
}
