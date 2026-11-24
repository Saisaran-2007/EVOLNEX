import { handle, ok } from "@backend/lib/api";
import { destroySession } from "@backend/lib/auth";

export const dynamic = "force-dynamic";

export async function POST() {
  return handle(async () => {
    await destroySession();
    return ok({ message: "Signed out." });
  });
}
