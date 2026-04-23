/**
 * User Preferences for AI Classification
 *
 * Records user corrections to AI classifications and builds a preference
 * context string that gets injected into the classification prompt, so
 * the AI learns from past corrections without model fine-tuning.
 */

import { createAdminClient } from "@/lib/supabase/admin";

export type CorrectionRecord = {
  user_id: string;
  item_id: string;
  content_snippet: string;
  original_type: string | null;
  corrected_type: string | null;
  original_lane: string | null;
  corrected_lane: string | null;
};

/**
 * Record a user correction — called when user changes type or lane
 * in the detail panel, bulk update, or review flow.
 */
export async function recordCorrection(correction: CorrectionRecord): Promise<void> {
  const {
    user_id,
    item_id,
    content_snippet,
    original_type,
    corrected_type,
    original_lane,
    corrected_lane,
  } = correction;

  // Only record if something actually changed
  const typeChanged = original_type && corrected_type && original_type !== corrected_type;
  const laneChanged = original_lane && corrected_lane && original_lane !== corrected_lane;
  if (!typeChanged && !laneChanged) return;

  const supabase = createAdminClient();

  // Upsert into user_preferences: increment frequency if pattern exists
  const snippet = content_snippet.slice(0, 200);

  if (typeChanged) {
    await upsertPreference(supabase, {
      user_id,
      preference_type: "type_override",
      pattern: snippet,
      from_value: original_type!,
      to_value: corrected_type!,
      item_id,
    });
  }

  if (laneChanged) {
    await upsertPreference(supabase, {
      user_id,
      preference_type: "lane_preference",
      pattern: snippet,
      from_value: original_lane!,
      to_value: corrected_lane!,
      item_id,
    });
  }
}

async function upsertPreference(
  supabase: ReturnType<typeof createAdminClient>,
  entry: {
    user_id: string;
    preference_type: string;
    pattern: string;
    from_value: string;
    to_value: string;
    item_id: string;
  },
): Promise<void> {
  // Check if a similar preference already exists
  const { data: existing } = await supabase
    .from("user_preferences")
    .select("id, frequency")
    .eq("user_id", entry.user_id)
    .eq("preference_type", entry.preference_type)
    .eq("from_value", entry.from_value)
    .eq("to_value", entry.to_value)
    .limit(1)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("user_preferences")
      .update({
        frequency: (existing.frequency ?? 0) + 1,
        last_seen: new Date().toISOString(),
        pattern: entry.pattern,
      })
      .eq("id", existing.id);
  } else {
    await supabase.from("user_preferences").insert({
      user_id: entry.user_id,
      preference_type: entry.preference_type,
      pattern: entry.pattern,
      from_value: entry.from_value,
      to_value: entry.to_value,
      frequency: 1,
      last_seen: new Date().toISOString(),
    });
  }
}

/**
 * Build a preference context string for injection into the classification prompt.
 * Returns the top-N most frequent/recent correction patterns.
 */
export async function buildPreferenceContext(userId: string): Promise<string> {
  const supabase = createAdminClient();

  // Fetch preferences from last 90 days, ordered by frequency + recency
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  const { data: prefs } = await supabase
    .from("user_preferences")
    .select("preference_type, pattern, from_value, to_value, frequency")
    .eq("user_id", userId)
    .gte("last_seen", cutoff)
    .order("frequency", { ascending: false })
    .limit(10);

  if (!prefs || prefs.length === 0) return "";

  const lines = prefs.map((p) => {
    if (p.preference_type === "type_override") {
      return `- The user has corrected "${p.from_value}" to "${p.to_value}" type ${p.frequency} time(s). Example content: "${p.pattern.slice(0, 80)}"`;
    }
    return `- The user prefers items like "${p.pattern.slice(0, 80)}" in the "${p.to_value}" lane instead of "${p.from_value}" (${p.frequency} correction(s))`;
  });

  return [
    "USER PREFERENCES (learned from past corrections — respect these when classifying):",
    ...lines,
  ].join("\n");
}
