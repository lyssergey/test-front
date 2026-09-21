import { redirect } from "next/navigation";
import { Suspense } from "react";

import { LoginForm } from "@/components/auth/login-form";
import { currentSession } from "@/server/auth";

export default async function LoginPage() {
  if (await currentSession()) redirect("/search");
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
