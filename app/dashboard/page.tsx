import type { Metadata } from "next";
import { Greeting } from "@/components/dashboard/Greeting";
import { NeedsAttention } from "@/components/dashboard/NeedsAttention"; // FEAT-12
import { displayName } from "@/lib/greetings";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Dashboard",
};

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  return (
    <>
      <Greeting name={await loadDisplayName()} />
      <NeedsAttention /> {/* FEAT-12 */}
    </>
  );
}

async function loadDisplayName(): Promise<string | null> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return null;
  }

  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return "there";

  const { data, error } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (error || !data || typeof data.username !== "string") {
    return displayName(null, userData.user.email);
  }

  return displayName(data.username, userData.user.email);
}
