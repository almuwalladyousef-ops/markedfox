import "server-only";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export type SessionUser = {
  id: string;
  email: string;
};

// Reads the signed-in user from the verified JWT.
//
// getClaims() — never getSession(). getSession() returns whatever is in the
// cookie without checking the signature, so on the server it is attacker
// controlled. getClaims() verifies against the project's JWKS, locally and
// without a network call once the key set is cached.
export async function getUser(): Promise<SessionUser | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims?.sub) return null;

  return {
    id: data.claims.sub,
    email: typeof data.claims.email === "string" ? data.claims.email : "",
  };
}

// Route guard for Server Components. The proxy also redirects unauthenticated
// requests, but that is a convenience layer, not the boundary: this call is
// what every protected page actually depends on, and RLS is what protects the
// data underneath even if both are forgotten.
export async function requireUser(): Promise<SessionUser> {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}

// The workspace a request acts in. Single-owner for now, so this is the user's
// only workspace; when workspace_members lands this becomes a lookup against
// the active selection rather than a change at every call site.
export async function getDefaultWorkspaceId(
  userId: string,
): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workspaces")
    .select("id")
    .eq("owner_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data.id;
}
