import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseEnv } from "@/lib/supabase/env";

/**
 * Browser Supabase client.
 * Use this in Client Components for auth, database queries, and storage.
 */
export function createClient() {
  const { url, key } = getSupabaseEnv();
  return createBrowserClient(url, key);
}
