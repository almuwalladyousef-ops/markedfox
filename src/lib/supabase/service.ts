import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { requireEnv } from "@/lib/env";

// Service-role client. This role BYPASSES ROW LEVEL SECURITY.
//
// Legitimate uses: the payment webhook writing `subscriptions`, background
// jobs reading `connections` to publish without a browser session. Never use
// it in a request path that echoes data back without its own tenant filter,
// and never let its key reach the client bundle.
export function createServiceRoleClient() {
  return createSupabaseClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SECRET_KEY"),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}
