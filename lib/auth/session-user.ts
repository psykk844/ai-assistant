import { createAdminClient } from "@/lib/supabase/admin";

const DEFAULT_HARDCODED_EMAIL = "sam@local.dev";

async function inferExistingAppUserId(admin: ReturnType<typeof createAdminClient>) {
  for (const table of ["items", "projects"]) {
    const { data, error } = await admin
      .from(table)
      .select("user_id")
      .order("updated_at", { ascending: false })
      .limit(1);

    if (error) continue;
    const userId = data?.[0]?.user_id;
    if (typeof userId === "string" && userId.trim()) return userId;
  }

  return null;
}

export async function resolveSessionUserId() {
  const configuredUserId =
    process.env.MOBILE_DEV_USER_ID?.trim() ||
    process.env.HARDCODED_USER_ID?.trim() ||
    process.env.DEFAULT_USER_ID?.trim();
  if (configuredUserId) return configuredUserId;

  const admin = createAdminClient();
  const existingAppUserId = await inferExistingAppUserId(admin);
  if (existingAppUserId) return existingAppUserId;

  const hardcodedEmail = process.env.HARDCODED_EMAIL?.trim() || DEFAULT_HARDCODED_EMAIL;

  const { data: usersData, error: usersError } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });

  if (usersError) {
    throw new Error(`Failed to list auth users: ${usersError.message}`);
  }

  const existing = usersData.users.find((user) => user.email === hardcodedEmail);
  if (existing) return existing.id;

  const generatedPassword = `${crypto.randomUUID()}Aa1!`;
  const { data: createdData, error: createError } = await admin.auth.admin.createUser({
    email: hardcodedEmail,
    password: generatedPassword,
    email_confirm: true,
  });

  if (createError || !createdData.user) {
    throw new Error(`Failed to create hardcoded auth user: ${createError?.message ?? "unknown error"}`);
  }

  return createdData.user.id;
}
