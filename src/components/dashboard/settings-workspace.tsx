"use client";

import { useState } from "react";
import {
  BadgeCheckIcon,
  Building2Icon,
  CheckIcon,
  LoaderCircleIcon,
  LogOutIcon,
  ShieldCheckIcon,
  StethoscopeIcon,
} from "lucide-react";

import { ThemeToggle } from "@/components/theme-toggle";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export interface DoctorProfile {
  fullName: string;
  email: string | null;
  speciality: string | null;
  registrationNo: string | null;
  role: string;
  dictationLangs: string[];
}

const languageOptions = [
  { code: "en-IN", label: "English" },
  { code: "hi-IN", label: "Hindi" },
  { code: "pa-IN", label: "Punjabi" },
] as const;

export function SettingsWorkspace({
  profile,
  onProfileChange,
  onSignOut,
}: {
  profile: DoctorProfile;
  onProfileChange: (profile: DoctorProfile) => void;
  onSignOut: () => void;
}) {
  const [fullName, setFullName] = useState(profile.fullName);
  const [speciality, setSpeciality] = useState(profile.speciality ?? "");
  const [registrationNo, setRegistrationNo] = useState(profile.registrationNo ?? "");
  const [languages, setLanguages] = useState(profile.dictationLangs);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  async function save() {
    setSaving(true);
    setNotice(null);
    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName,
          speciality: speciality || null,
          registrationNo: registrationNo || null,
          dictationLangs: languages,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error ?? "Could not update your profile.");

      onProfileChange({ ...profile, ...payload, email: profile.email });
      setNotice({ kind: "success", text: "Profile and dictation preferences updated." });
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Could not update your profile.",
      });
    } finally {
      setSaving(false);
    }
  }

  function toggleLanguage(code: string) {
    setLanguages((current) =>
      current.includes(code)
        ? current.length === 1
          ? current
          : current.filter((language) => language !== code)
        : [...current, code],
    );
  }

  const initials = fullName
    .replace(/^(dr\.?|prof\.?)\s+/i, "")
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return (
    <div className="space-y-6">
      <section>
        <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <StethoscopeIcon className="size-3.5" aria-hidden />
          Professional and application preferences
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-[-0.025em] sm:text-3xl">
          Account &amp; settings
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Keep the information used across your register accurate.
        </p>
      </section>

      <Card className="gap-0 py-0">
        <CardContent className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:p-6">
          <span className="grid size-20 shrink-0 place-items-center rounded-full bg-primary/10 text-xl font-semibold text-primary">
            {initials || "DR"}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-xl font-semibold tracking-tight">{fullName}</h2>
              <Badge variant="default" className="capitalize">
                <BadgeCheckIcon aria-hidden /> {profile.role}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {speciality || "Independent practitioner"}
            </p>
            <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              <Building2Icon className="size-3.5" aria-hidden />
              {profile.email || "Email unavailable"}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="gap-0 py-0">
        <CardHeader className="border-b border-border px-5 py-4 sm:px-6">
          <CardTitle className="text-base">Clinical profile</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 p-5 sm:grid-cols-2 sm:p-6">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="profile-name">Full name</Label>
            <Input id="profile-name" value={fullName} onChange={(event) => setFullName(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="profile-speciality">Speciality</Label>
            <Input
              id="profile-speciality"
              value={speciality}
              onChange={(event) => setSpeciality(event.target.value)}
              placeholder="General medicine"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="profile-registration">Medical registration number</Label>
            <Input
              id="profile-registration"
              value={registrationNo}
              onChange={(event) => setRegistrationNo(event.target.value)}
              placeholder="DMC-18294-2010"
              className="tnum"
            />
          </div>

          <div className="sm:col-span-2">
            <Label>Voice dictation languages</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {languageOptions.map((language) => {
                const selected = languages.includes(language.code);
                return (
                  <button
                    key={language.code}
                    type="button"
                    onClick={() => toggleLanguage(language.code)}
                    aria-pressed={selected}
                    className={cn(
                      "inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors",
                      selected
                        ? "border-primary/25 bg-primary/10 text-primary"
                        : "border-border bg-background text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {selected && <CheckIcon className="size-3.5" aria-hidden />}
                    {language.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              The speech model can handle code-switching between selected languages.
            </p>
          </div>

          {notice && (
            <Alert
              variant={notice.kind === "success" ? "success" : "destructive"}
              className="sm:col-span-2"
            >
              {notice.kind === "success" ? (
                <CheckIcon className="mt-0.5 size-4" aria-hidden />
              ) : (
                <ShieldCheckIcon className="mt-0.5 size-4" aria-hidden />
              )}
              <AlertTitle>{notice.kind === "success" ? "Saved" : "Couldn’t save"}</AlertTitle>
              <AlertDescription>{notice.text}</AlertDescription>
            </Alert>
          )}

          <div className="flex justify-end sm:col-span-2">
            <Button onClick={save} disabled={saving || !fullName.trim()}>
              {saving ? <LoaderCircleIcon className="animate-spin" aria-hidden /> : <CheckIcon aria-hidden />}
              Save changes
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="gap-0 py-0">
        <CardHeader className="border-b border-border px-5 py-4 sm:px-6">
          <CardTitle className="text-base">Application preferences</CardTitle>
        </CardHeader>
        <CardContent className="divide-y divide-border p-0">
          <div className="flex items-center justify-between gap-4 px-5 py-4 sm:px-6">
            <div>
              <p className="text-sm font-medium">Interface theme</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Switch between light and dark mode.</p>
            </div>
            <ThemeToggle />
          </div>
          <div className="px-5 py-5 sm:px-6">
            <Alert variant="success" role="note">
              <ShieldCheckIcon className="mt-0.5 size-4" aria-hidden />
              <AlertTitle>India data residency active</AlertTitle>
              <AlertDescription>
                Patient records and private dictation audio are stored in the Mumbai region. Raw
                audio is eligible for deletion after 30 days.
              </AlertDescription>
            </Alert>
          </div>
        </CardContent>
      </Card>

      <Button variant="outline" size="lg" onClick={onSignOut} className="w-full text-destructive hover:text-destructive">
        <LogOutIcon aria-hidden />
        Sign out securely
      </Button>
    </div>
  );
}
