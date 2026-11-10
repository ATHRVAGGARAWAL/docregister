"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { SettingsWorkspace, type DoctorProfile } from "@/components/dashboard/settings-workspace";
import { PracticePage, PracticePageHeader } from "@/components/practice/practice-page";
import { useClerk } from "@clerk/nextjs";

export function PracticeSettings({ initialProfile }: { initialProfile: DoctorProfile }) {
  const [profile, setProfile] = useState(initialProfile);
  const router = useRouter();
  const { signOut: clerkSignOut } = useClerk();
  async function signOut() {
    await clerkSignOut({ redirectUrl: "/sign-in" });
    router.replace("/sign-in");
    router.refresh();
  }
  return <PracticePage><PracticePageHeader eyebrow="Practice administration" title="Settings" description="Manage your clinical profile, dictation languages, team access and clinic preferences." /><SettingsWorkspace profile={profile} onProfileChange={setProfile} onDirtyChange={() => undefined} onSignOut={() => void signOut()} showIntro={false} /></PracticePage>;
}
