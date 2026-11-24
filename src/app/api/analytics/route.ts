import { handle, ok } from "@backend/lib/api";
import { requireWorkspaceUser } from "@backend/lib/workspace";
import { getAnalytics } from "@backend/lib/career";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const user = await requireWorkspaceUser();
    return ok(await getAnalytics(user.id));
  });
}
