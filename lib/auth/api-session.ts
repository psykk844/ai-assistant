import { cookies } from "next/headers";

const AUTH_COOKIE_NAME = "auth";

export async function assertApiSession() {
  const store = await cookies();
  if (store.get(AUTH_COOKIE_NAME)?.value !== "true") {
    throw new Error("unauthorized");
  }
}
