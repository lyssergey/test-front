import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { UserProvider } from "@/lib/auth";
import { currentSession } from "@/server/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await currentSession();
  if (!session) redirect("/login");

  return (
    <UserProvider user={session.user}>
      <AppShell>{children}</AppShell>
    </UserProvider>
  );
}
