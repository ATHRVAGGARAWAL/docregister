import { redirect } from "next/navigation";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const query = await searchParams;
  const next = typeof query.next === "string" && query.next.startsWith("/") && !query.next.startsWith("//") ? query.next : "/";
  redirect(`/sign-in?redirect_url=${encodeURIComponent(next)}`);
}
