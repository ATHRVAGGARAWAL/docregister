import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { AuthForm } from "@/components/auth/auth-form";

export default async function SignInPage() {
  if ((await auth()).isAuthenticated) redirect("/");
  return (
    <AuthShell><AuthForm /></AuthShell>
  );
}
