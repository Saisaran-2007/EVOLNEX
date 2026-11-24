import type { ReactNode } from "react";
import { AppShell } from "@frontend/components/AppShell";
import { getWorkspaceUser } from "@backend/lib/workspace";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  const user = await getWorkspaceUser();

  return (
    <AppShell
      user={{
        fullName: user.fullName || user.email,
        email: user.email,
        isDemo: user.isDemo,
        emailVerified: Boolean(user.emailVerifiedAt),
      }}
    >
      {children}
    </AppShell>
  );
}
