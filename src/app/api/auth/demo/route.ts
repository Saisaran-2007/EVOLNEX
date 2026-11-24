import { handle, ok } from "@backend/lib/api";
import { createSession, publicUser } from "@backend/lib/auth";
import { ensureDemoUser } from "@backend/lib/seed";

export const dynamic = "force-dynamic";

/** Sign in to the shared demo workspace (real database records, seeded once). */
export async function POST() {
  return handle(async () => {
    const user = await ensureDemoUser();
    await createSession(user.id);
    return ok({ user: publicUser(user), message: "Signed in to the demo workspace." });
  });
}
