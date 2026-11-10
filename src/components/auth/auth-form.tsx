"use client";

import { ClerkDegraded, ClerkFailed, ClerkLoaded, ClerkLoading, SignIn, SignUp, useAuth } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

function AuthStatus({ failed = false, signingIn = false }: { failed?: boolean; signingIn?: boolean }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 10_000);
    return () => clearTimeout(timer);
  }, []);
  const retry = failed || slow;

  return (
    <div className="w-full max-w-sm rounded-xl border bg-card p-8 text-center shadow-sm" role="status">
      <h2 className="text-lg font-semibold">
        {retry ? "Sign-in is taking longer than expected" : signingIn ? "Opening your workspace…" : "Loading secure sign-in…"}
      </h2>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        {retry ? "Check your connection and try again." : "This should only take a moment."}
      </p>
      {retry && (
        <Button className="mt-5" onClick={() => window.location.replace(new URL("/sign-in", window.location.origin).href)}>Try sign-in again</Button>
      )}
    </div>
  );
}

export function AuthForm({ signUp = false }: { signUp?: boolean }) {
  const { isLoaded, isSignedIn } = useAuth();
  useEffect(() => {
    if (isLoaded && isSignedIn) {
      // OAuth can finish in the browser after the server rendered a signed-out
      // page. A full navigation gives the server the newly established session.
      window.location.replace("/");
    }
  }, [isLoaded, isSignedIn]);

  if (isLoaded && isSignedIn) return <AuthStatus signingIn />;

  return (
    <>
      <ClerkLoading><AuthStatus /></ClerkLoading>
      <ClerkFailed><AuthStatus failed /></ClerkFailed>
      <ClerkDegraded><AuthStatus failed /></ClerkDegraded>
      <ClerkLoaded>
        {signUp ? (
          <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" fallback={<AuthStatus />} />
        ) : (
          <SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" fallback={<AuthStatus />} />
        )}
      </ClerkLoaded>
    </>
  );
}
