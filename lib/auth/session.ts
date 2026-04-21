import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const AUTH_COOKIE_NAME = "auth";
const AUTH_COOKIE_VALUE = "true";

export async function hasHardcodedSession() {
  const cookieStore = await cookies();
  const authCookie = cookieStore.get(AUTH_COOKIE_NAME);
  return authCookie?.value === AUTH_COOKIE_VALUE;
}

export async function requireHardcodedSession() {
  const authenticated = await hasHardcodedSession();
  if (!authenticated) redirect("/login");
}

export async function clearHardcodedSession() {
  const cookieStore = await cookies();
  cookieStore.set(AUTH_COOKIE_NAME, "", {
    path: "/",
    maxAge: 0,
  });
}
