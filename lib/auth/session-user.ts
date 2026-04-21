import { createAdminClient } from "@/lib/supabase/admin";

const DEFAULT_HARDCODED_EMAIL = "sam@local.dev";

export async function resolveSessionUserId() {
  const configuredUserId = process.env.HARDCODED_USER_ID?.trim();
  if (configuredUserId) return configuredUserId;

  const admin = createAdminClient();
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
