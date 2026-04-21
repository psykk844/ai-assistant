import type { SupabaseClient } from "@supabase/supabase-js";

export async function resolveSessionUserId(supabase: SupabaseClient) {
  const configuredUserId = process.env.HARDCODED_USER_ID?.trim();
  if (configuredUserId) return configuredUserId;

  const { data, error } = await supabase
    .from("items")
    .select("user_id")
    .not("user_id", "is", null)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to resolve session user id: ${error.message}`);
  }

  const fallbackUserId = data?.user_id;
  if (!fallbackUserId) {
    throw new Error(
      "No session user id available. Set HARDCODED_USER_ID in environment or seed at least one item row."
    );
  }

  return String(fallbackUserId);
}
