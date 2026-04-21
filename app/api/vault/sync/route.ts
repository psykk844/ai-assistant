import { NextResponse } from "next/server";
import { assertApiSession } from "@/lib/auth/api-session";
import { resolveSessionUserId } from "@/lib/auth/session-user";
import { getVaultDiagnostics, resolveVaultRoot, runVaultSync } from "@/lib/vault/sync";

export async function POST() {
  try {
    await assertApiSession();
    const userId = await resolveSessionUserId();
    const vaultRoot = resolveVaultRoot();
    const diagnostics = await getVaultDiagnostics(vaultRoot);

    if (!diagnostics.pathExists || !diagnostics.isReadable) {
      return NextResponse.json(
        {
          ok: false,
          error: "vault-path-unavailable",
          diagnostics,
          syncedAt: new Date().toISOString(),
        },
        { status: 500 },
      );
    }

    const summary = await runVaultSync(userId, vaultRoot);
    return NextResponse.json({ ok: true, summary, diagnostics, syncedAt: new Date().toISOString() });
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
