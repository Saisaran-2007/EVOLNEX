import { handle, ok } from "@backend/lib/api";
import { getCurrentUser, publicUser } from "@backend/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const user = await getCurrentUser();
    return ok({ user: user ? publicUser(user) : null });
  });
}
