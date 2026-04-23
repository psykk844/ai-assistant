import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  shouldGenerateInstance,
  buildRecurringInstance,
  calculateNextDue,
} from "@/lib/items/recurrence";
import type { InboxItem, RecurrenceConfig } from "@/lib/items/types";

export async function POST(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);

  // Fetch all template items with recurrence
  const { data: templates, error } = await supabase
    .from("items")
    .select("id, type, title, content, status, priority_score, confidence_score, needs_review, created_at, updated_at, metadata")
    .eq("status", "active")
    .not("metadata->recurrence", "is", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const items = (templates ?? []) as InboxItem[];
  let generated = 0;

  for (const item of items) {
    const recurrence = (item.metadata as Record<string, unknown>)?.recurrence as RecurrenceConfig | undefined;
    if (!recurrence || !shouldGenerateInstance(recurrence, today)) continue;

    // Check for existing instance today (prevent duplicates)
    const { data: existing } = await supabase
      .from("items")
      .select("id")
      .eq("status", "active")
      .filter("metadata->recurrence->>template_id", "eq", item.id)
      .gte("created_at", today + "T00:00:00Z")
      .lt("created_at", today + "T23:59:59Z")
      .limit(1);

    if (existing && existing.length > 0) continue;

    // Resolve user_id from template
    const { data: templateFull } = await supabase
      .from("items")
      .select("user_id")
      .eq("id", item.id)
      .single();

    if (!templateFull) continue;

    const instance = buildRecurringInstance(item, templateFull.user_id);

    // Insert new instance
    const { error: insertError } = await supabase.from("items").insert(instance);
    if (!insertError) generated++;

    // Update template next_due
    const nextDue = calculateNextDue(recurrence.frequency, recurrence.days, today);
    await supabase
      .from("items")
      .update({
        metadata: {
          ...(item.metadata as Record<string, unknown>),
          recurrence: { ...recurrence, next_due: nextDue },
        },
      })
      .eq("id", item.id);
  }

  return NextResponse.json({ generated, date: today });
}
