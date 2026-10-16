import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentAdmin } from "@/lib/auth";
import { SetupNotice, setupProblems } from "../ui";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  const problems = setupProblems();
  if (problems) return <SetupNotice problems={problems} />;
  if (await currentAdmin()) redirect("/admin");
  return (
    <div className="mx-auto mt-8 max-w-sm">
      <h1 className="mb-6 text-xl font-medium">Sign in</h1>
      <LoginForm />
    </div>
  );
}
