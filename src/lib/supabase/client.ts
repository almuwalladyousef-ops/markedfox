import { createBrowserClient } from "@supabase/ssr";

// Browser client for client components. NEXT_PUBLIC_ vars are inlined at build
// time when present; the non-null assertions are safe because every deployed
// environment sets them (see .env.example).
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
