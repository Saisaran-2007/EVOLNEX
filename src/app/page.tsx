import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Local workspace mode: the app opens directly on the dashboard. */
export default function RootPage() {
  redirect("/overview");
}
