import { redirect } from "next/navigation";
import { hasHardcodedSession } from "@/lib/auth/session";

export default async function Home() {
  const authenticated = await hasHardcodedSession();
  redirect(authenticated ? "/app" : "/login");
}
