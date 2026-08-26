"use client";

import { useState } from "react";
import {
  BadgeCheckIcon,
  Building2Icon,
  CheckIcon,
  LanguagesIcon,
  LoaderCircleIcon,
  LogOutIcon,
  MailIcon,
  PaletteIcon,
  ShieldCheckIcon,
  TriangleAlertIcon,
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
  { code: "en-IN", label: "English", detail: "India" },
  { code: "hi-IN", label: "Hindi", detail: "हिन्दी" },
  { code: "pa-IN", label: "Punjabi", detail: "ਪੰਜਾਬੀ" },
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

  // The last selected language cannot be removed — the server rejects an empty
  // list with a real message the doctor could never reach, because this silently
  // returned `current` and the button just looked broken. It is now disabled and
  // explained instead.
  const isLastLanguage = (code: string) => languages.length === 1 && languages[0] === code;

  function toggleLanguage(code: string) {
    if (isLastLanguage(code)) return;
    setLanguages((current) =>
      current.includes(code)
        ? current.filter((language) => language !== code)
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
    <div className="space-y-7">
      <section>
        <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
          <span className="grid size-6 place-items-center rounded-full border border-primary/20 bg-primary/10">
            <StethoscopeIcon className="size-3.5" aria-hidden />
          </span>
          Practice identity
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
          Account &amp; settings
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Your clinical identity, dictation languages, and private workspace preferences.
        </p>
      </section>

      <div className="grid items-start gap-4 lg:grid-cols-[19rem_minmax(0,1fr)]">
        <aside className="glass-strong relative overflow-hidden rounded-[1.65rem] p-6 lg:sticky lg:top-5">
          <div className="ambient-orb pointer-events-none absolute -right-20 -top-24 size-52 opacity-50" aria-hidden />
          <div className="relative">
            <div className="w-fit rounded-full bg-[conic-gradient(from_210deg,transparent_0deg,var(--primary)_95deg,color-mix(in_oklab,var(--chart-2)_72%,transparent)_190deg,transparent_285deg)] p-[1px] shadow-[0_0_44px_-18px_var(--primary)]">
              <span aria-hidden className="glass-inset grid size-24 place-items-center rounded-full border-4 border-background/60 text-2xl font-semibold tracking-[-0.06em] text-primary">
                {initials || "DR"}
              </span>
            </div>
            <span className="absolute left-[4.6rem] top-[4.6rem] size-4 rounded-full border-[3px] border-card bg-emerald-400 shadow-[0_0_14px_rgba(52,211,153,0.75)]" aria-hidden />
            <span className="sr-only">Account active</span>

            <div className="mt-5">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="min-w-0 truncate text-xl font-semibold tracking-[-0.035em]">{fullName}</h2>
                <Badge variant="default" className="capitalize">
                  <BadgeCheckIcon aria-hidden /> {profile.role}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {speciality || "Independent practitioner"}
              </p>
            </div>

            <div className="mt-6 space-y-2.5 border-t border-white/8 pt-5 text-xs text-muted-foreground">
              <p className="flex items-center gap-2.5">
                <MailIcon className="size-3.5 text-primary" aria-hidden />
                <span className="truncate">{profile.email || "Email unavailable"}</span>
              </p>
              <p className="flex items-center gap-2.5">
                <Building2Icon className="size-3.5 text-primary" aria-hidden />
                <span className="truncate">{registrationNo || "Registration not added"}</span>
              </p>
            </div>

            <div className="mt-6 rounded-[1.1rem] border border-emerald-400/15 bg-emerald-400/7 p-3.5">
              <p className="flex items-center gap-2 text-xs font-semibold text-foreground">
                <ShieldCheckIcon className="size-4 text-emerald-500" aria-hidden />
                India data residency
              </p>
              <p className="mt-1.5 text-[11px] leading-5 text-muted-foreground">
                Patient records and private dictation audio remain in the Mumbai region.
              </p>
            </div>

            <Button variant="ghost" size="lg" onClick={onSignOut} className="mt-5 w-full justify-start text-destructive hover:bg-destructive/10 hover:text-destructive">
              <LogOutIcon aria-hidden />
              Sign out securely
            </Button>
          </div>
        </aside>

        <div className="space-y-4">
      <Card className="glass-card gap-0 rounded-[1.65rem] border-white/10 bg-card/55 py-0">
        <CardHeader className="border-b border-white/8 px-5 py-5 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-[0.9rem] border border-primary/20 bg-primary/10 text-primary">
              <StethoscopeIcon className="size-4" aria-hidden />
            </span>
            <div>
              <CardTitle className="text-base">Clinical profile</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">Shown on patient records and prescriptions.</p>
            </div>
          </div>
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

          {notice && (
            <Alert
              role="alert"
              variant={notice.kind === "success" ? "success" : "destructive"}
              className="sm:col-span-2"
            >
              {notice.kind === "success" ? (
                <CheckIcon className="mt-0.5 size-4" aria-hidden />
              ) : (
                /* Was ShieldCheckIcon: a tick on the failure branch meant the
                   icon channel said "fine" while only the red tint disagreed. */
                <TriangleAlertIcon className="mt-0.5 size-4" aria-hidden />
              )}
              <AlertTitle>{notice.kind === "success" ? "Saved" : "Couldn’t save"}</AlertTitle>
              <AlertDescription>{notice.text}</AlertDescription>
            </Alert>
          )}

          <div className="flex justify-end border-t border-white/8 pt-5 sm:col-span-2">
            <Button onClick={save} disabled={saving || !fullName.trim()} className="min-w-36 shadow-[0_12px_28px_-16px_var(--primary)]">
              {saving ? <LoaderCircleIcon className="animate-spin" aria-hidden /> : <CheckIcon aria-hidden />}
              Save changes
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="glass-card gap-0 rounded-[1.65rem] border-white/10 bg-card/55 py-0">
        <CardHeader className="border-b border-white/8 px-5 py-5 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-[0.9rem] border border-primary/20 bg-primary/10 text-primary">
              <LanguagesIcon className="size-4" aria-hidden />
            </span>
            <div>
              <CardTitle className="text-base">Voice &amp; interface</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">Tune the workspace to your consulting rhythm.</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="divide-y divide-white/8 p-0">
          <div className="flex items-center justify-between gap-4 px-5 py-5 sm:px-6">
            <div>
              <p className="flex items-center gap-2 text-sm font-medium"><PaletteIcon className="size-4 text-primary" aria-hidden />Interface theme</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Switch between light and dark mode.</p>
            </div>
            <ThemeToggle />
          </div>
          <div className="px-5 py-5 sm:px-6">
            <div className="mb-3">
              <p className="text-sm font-medium">Dictation languages</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Code-switch naturally between every enabled language.</p>
            </div>
            <div className="space-y-2">
              {languageOptions.map((language) => {
                const selected = languages.includes(language.code);
                return (
                  <button
                    key={language.code}
                    type="button"
                    role="switch"
                    aria-checked={selected}
                    onClick={() => toggleLanguage(language.code)}
                    disabled={isLastLanguage(language.code)}
                    title={isLastLanguage(language.code) ? "Dictation needs at least one language." : undefined}
                    className="glass-inset flex min-h-14 w-full items-center justify-between gap-4 rounded-[1rem] px-3.5 py-2.5 text-left transition-colors hover:border-primary/20 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    <span>
                      <span className="block text-sm font-medium">{language.label}</span>
                      <span className="mt-0.5 block text-[11px] text-muted-foreground">{language.detail} · {language.code}</span>
                    </span>
                    <span className={cn("relative h-6 w-11 shrink-0 rounded-full border transition-colors", selected ? "border-primary/40 bg-primary" : "border-white/10 bg-white/8")} aria-hidden>
                      <span className={cn("absolute top-1/2 size-4 -translate-y-1/2 rounded-full bg-white shadow-sm transition-transform", selected ? "translate-x-6" : "translate-x-1")} />
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>
        </div>
      </div>
    </div>
  );
}
