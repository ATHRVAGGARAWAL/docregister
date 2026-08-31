"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { SettingsWorkspace, type DoctorProfile } from "@/components/dashboard/settings-workspace";
import { PracticePage, PracticePageHeader } from "@/components/practice/practice-page";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export function PracticeSettings({ initialProfile }: { initialProfile: DoctorProfile }) {
  const [profile, setProfile] = useState(initialProfile);
  const router = useRouter();
  async function signOut() {
    await getSupabaseBrowserClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }
  return <PracticePage><PracticePageHeader eyebrow="Practice administration" title="Settings" description="Manage your clinical profile, dictation languages, team access and clinic preferences." /><SettingsWorkspace profile={profile} onProfileChange={setProfile} onDirtyChange={() => undefined} onSignOut={() => void signOut()} showIntro={false} /></PracticePage>;
}
