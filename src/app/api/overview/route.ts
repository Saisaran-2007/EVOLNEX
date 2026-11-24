import { handle, ok } from "@backend/lib/api";
import { requireWorkspaceUser } from "@backend/lib/workspace";
import { getOverviewData } from "@backend/lib/career";
import { aiConfigured } from "@backend/lib/ai/gemini";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const user = await requireWorkspaceUser();
    const data = await getOverviewData(user.id);
    return ok({ ...data, ai: { configured: aiConfigured() } });
  });
}
