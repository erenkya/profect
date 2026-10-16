import { getCurrentUser } from "@/lib/auth";
import { fail, ok } from "@/lib/http";

export async function GET() {
  const user = await getCurrentUser();
  return user ? ok({ user }) : fail("Oturum yok.", 401);
}
