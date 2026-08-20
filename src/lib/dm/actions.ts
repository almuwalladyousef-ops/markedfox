"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/session";
import { getConnectionTokens } from "@/lib/connections/store";
import { canUserDo } from "@/lib/entitlements/can-user-do";
import { getEntitlementSnapshot } from "@/lib/entitlements/snapshot";
import { getPlatform } from "@/lib/platforms/registry";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/lib/workspaces/store";

import { readRuleForm, validateRuleForm } from "./rule-form";

// The automations page's server actions. Every one runs through the user's
// own client, so RLS decides which rules and connections are theirs; the
// engine itself (service role) never runs from here.

export type RuleFormState = {
  errors?: Record<string, string>;
  message?: string;
};

const UUID = /^[0-9a-f-]{36}$/i;

export async function saveRuleAction(_previous: RuleFormState, formData: FormData): Promise<RuleFormState> {
  const user = await requireUser();
  const active = await getActiveWorkspace();
  if (!active) return { message: "No workspace is selected." };

  const values = readRuleForm(formData);
  const parsed = validateRuleForm(values);
  if (!parsed.ok) return { errors: parsed.errors };

  const supabase = await createClient();
  const ruleId = String(formData.get("rule_id") ?? "");

  // The connection must be one of the user's, in this workspace, on a
  // platform with DM automation. RLS hides other users' connections; the
  // workspace check stops a rule landing on an account from another
  // workspace of the same user.
  const { data: connection, error: connectionError } = await supabase
    .from("connections")
    .select("id, platform, workspace_id, status")
    .eq("id", parsed.draft.connection_id)
    .eq("workspace_id", active.id)
    .maybeSingle();
  if (connectionError) throw connectionError;
  if (!connection) return { errors: { connection_id: "Choose one of this workspace's accounts." } };
  if (!getPlatform(connection.platform).messaging) {
    return { errors: { connection_id: "That platform has no DM automation yet." } };
  }

  if (UUID.test(ruleId)) {
    const { error } = await supabase
      .from("dm_rules")
      .update({
        name: parsed.draft.name,
        connection_id: parsed.draft.connection_id,
        trigger_type: parsed.draft.trigger_type,
        keywords: parsed.draft.keywords,
        target_post_ids: parsed.draft.target_post_ids,
        actions: parsed.draft.actions,
        config: parsed.draft.config,
      })
      .eq("id", ruleId);
    if (error) return { message: `Could not save the rule: ${error.message}` };
  } else {
    // The plan's rule cap — Free has one rule, by design (Meta rate-limits
    // per app, so free users draw on the same budget as paying ones).
    const snapshot = await getEntitlementSnapshot(supabase, user.id, active.id);
    const decision = canUserDo(snapshot, { type: "create_dm_rule" });
    if (!decision.allowed) return { message: decision.reason };

    const { error } = await supabase.from("dm_rules").insert({
      user_id: user.id,
      workspace_id: active.id,
      connection_id: parsed.draft.connection_id,
      name: parsed.draft.name,
      enabled: true,
      trigger_type: parsed.draft.trigger_type,
      keywords: parsed.draft.keywords,
      target_post_ids: parsed.draft.target_post_ids,
      actions: parsed.draft.actions,
      config: parsed.draft.config,
    });
    if (error) return { message: `Could not save the rule: ${error.message}` };
  }

  revalidatePath("/dashboard/automations");
  redirect("/dashboard/automations?saved=1");
}

export async function toggleRuleAction(formData: FormData): Promise<void> {
  await requireUser();
  const ruleId = String(formData.get("rule_id") ?? "");
  const enabled = String(formData.get("enabled") ?? "") === "true";
  if (!UUID.test(ruleId)) return;
  const supabase = await createClient();
  await supabase.from("dm_rules").update({ enabled }).eq("id", ruleId);
  revalidatePath("/dashboard/automations");
}

export async function deleteRuleAction(formData: FormData): Promise<void> {
  await requireUser();
  const ruleId = String(formData.get("rule_id") ?? "");
  if (!UUID.test(ruleId)) return;
  const supabase = await createClient();
  await supabase.from("dm_rules").delete().eq("id", ruleId);
  revalidatePath("/dashboard/automations");
  redirect("/dashboard/automations?deleted=1");
}

// Ask the platform again to deliver this account's events to our webhook —
// for the owner debugging a silent account, and for connections made before
// automation was turned on.
export async function resubscribeWebhooksAction(formData: FormData): Promise<void> {
  await requireUser();
  const connectionId = String(formData.get("connection_id") ?? "");
  if (!UUID.test(connectionId)) return;
  const supabase = await createClient();
  let outcome = "subscribed";
  try {
    const { row, tokens } = await getConnectionTokens(supabase, connectionId);
    const adapter = getPlatform(row.platform);
    if (!adapter.messaging) throw new Error("no automation on this platform");
    await adapter.messaging.subscribeWebhooks({
      tokens,
      platformAccountId: row.platform_account_id,
      metadata: row.metadata,
    });
  } catch (error) {
    outcome = `failed:${(error instanceof Error ? error.message : String(error)).slice(0, 200)}`;
  }
  revalidatePath("/dashboard/automations");
  redirect(`/dashboard/automations?resubscribe=${encodeURIComponent(outcome)}`);
}
