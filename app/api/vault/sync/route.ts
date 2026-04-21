import { NextResponse } from "next/server";
import { assertApiSession } from "@/lib/auth/api-session";
import { resolveSessionUserId } from "@/lib/auth/session-user";
import { runVaultSync } from "@/lib/vault/sync";

export async function POST() {
  try {
    await assertApiSession();
    const userId = await resolveSessionUserId();
    const summary = await runVaultSync(userId);
    return NextResponse.json({ ok: true, summary, syncedAt: new Date().toISOString() });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "sync-failed",
      },
      { status: 500 },
    );
  }
}
