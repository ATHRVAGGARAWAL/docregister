"use client";
import { AccountButton } from "@/components/auth/account-button";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { BrandLockup } from "@/components/brand/brand-mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ClinicSetup({ initialName }: { initialName: string }) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [clinic, setClinic] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/auth/clinic", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName: name, clinicName: clinic }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not set up your clinic.");
      router.replace("/");
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Please try again.");
      setSaving(false);
    }
  }
  return <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-5 py-10">
    <div className="mb-10 flex items-center justify-between"><BrandLockup subtitle="Clinic workspace" /><AccountButton /></div>
    <h1 className="text-3xl font-semibold tracking-tight">Set up your workspace</h1>
    <p className="mt-3 text-sm leading-6 text-muted-foreground">Enter your clinic’s name. If your team already uses it, the clinic owner will approve your access.</p>
    <form onSubmit={submit} className="mt-7 space-y-5">
      <div className="space-y-2"><Label htmlFor="doctor-name">Your name</Label><Input id="doctor-name" autoComplete="name" required maxLength={120} value={name} onChange={e => setName(e.target.value)} /></div>
      <div className="space-y-2"><Label htmlFor="clinic-name">Clinic name</Label><Input id="clinic-name" autoComplete="organization" required maxLength={120} value={clinic} onChange={e => setClinic(e.target.value)} /></div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button className="w-full" disabled={saving || !name.trim() || !clinic.trim()}>{saving ? "Opening workspace…" : "Continue to workspace"}</Button>
    </form>
  </main>;
}
