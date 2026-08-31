"use client";

import { useCallback, useEffect, useState } from "react";

import { ClipboardListIcon, LoaderCircleIcon, PlusIcon } from "@/components/icons";
import { SectionHeading } from "@/components/practice/practice-page";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface ConsentRecord {
  id: string;
  consent_type: string;
  template_version: string | null;
  content_snapshot: string;
  language_code: string;
  status: "draft" | "presented" | "signed" | "declined" | "revoked";
  signed_name: string | null;
  signed_at: string | null;
  witness_name: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
}

export function PatientConsentsPanel({ patientId }: { patientId: string }) {
  const [consents, setConsents] = useState<ConsentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [consentType, setConsentType] = useState("");
  const [templateVersion, setTemplateVersion] = useState("");
  const [languageCode, setLanguageCode] = useState("en-IN");
  const [content, setContent] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/patients/${encodeURIComponent(patientId)}/consents`);
      const body = await response.json().catch(() => null) as { consents?: ConsentRecord[]; error?: string } | null;
      if (!response.ok) throw new Error(body?.error ?? "Could not load consent records.");
      setConsents(body?.consents ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load consent records.");
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/patients/${encodeURIComponent(patientId)}/consents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consentType, templateVersion, languageCode, contentSnapshot: content }),
      });
      const body = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(body?.error ?? "Could not create the consent draft.");
      setConsentType("");
      setTemplateVersion("");
      setLanguageCode("en-IN");
      setContent("");
      setCreating(false);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create the consent draft.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="surface-card rounded-[1.35rem] bg-card p-4 sm:p-5">
      <SectionHeading
        title="Consent records"
        description="Versioned wording stays attached to the patient record for later presentation and signature."
        action={<Button type="button" size="sm" onClick={() => setCreating((value) => !value)}><PlusIcon aria-hidden />{creating ? "Cancel" : "New draft"}</Button>}
      />

      {creating && (
        <form onSubmit={(event) => void submit(event)} className="mt-4 space-y-3 rounded-xl border border-border bg-background p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="consent-type">Consent type</Label>
              <Input id="consent-type" value={consentType} onChange={(event) => setConsentType(event.target.value)} placeholder="e.g. Root canal treatment" maxLength={120} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="consent-version">Template version</Label>
              <Input id="consent-version" value={templateVersion} onChange={(event) => setTemplateVersion(event.target.value)} placeholder="Optional" maxLength={80} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="consent-language">Language code</Label>
            <Input id="consent-language" value={languageCode} onChange={(event) => setLanguageCode(event.target.value)} placeholder="en-IN" maxLength={35} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="consent-content">Consent wording snapshot</Label>
            <Textarea id="consent-content" value={content} onChange={(event) => setContent(event.target.value)} rows={8} maxLength={50_000} required />
            <p className="text-xs text-muted-foreground">This creates a draft snapshot. A signed record must retain the exact wording shown to the patient.</p>
          </div>
          <Button type="submit" disabled={saving || !consentType.trim() || !content.trim()}>{saving && <LoaderCircleIcon className="animate-spin" aria-hidden />}Save consent draft</Button>
        </form>
      )}

      {error && <Alert variant="destructive" className="mt-4"><AlertTitle>Consent records unavailable</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
      {loading ? (
        <p className="py-12 text-center text-sm text-muted-foreground"><LoaderCircleIcon className="mr-2 inline size-4 animate-spin" aria-hidden />Loading consent records…</p>
      ) : (
        <div className="mt-4 space-y-2">
          {consents.map((consent) => (
            <article key={consent.id} className="rounded-xl border border-border bg-background p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold">{consent.consent_type}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">{shortDate(consent.created_at)} · {consent.language_code}{consent.template_version ? ` · template ${consent.template_version}` : ""}</p>
                </div>
                <Badge variant="outline" className="capitalize">{consent.status}</Badge>
              </div>
              {consent.signed_name && <p className="mt-3 text-xs text-muted-foreground">Signed by {consent.signed_name}{consent.signed_at ? ` on ${shortDate(consent.signed_at)}` : ""}{consent.witness_name ? ` · witnessed by ${consent.witness_name}` : ""}</p>}
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer font-medium text-primary">View wording</summary>
                <p className="mt-2 whitespace-pre-wrap leading-6 text-muted-foreground">{consent.content_snapshot}</p>
              </details>
            </article>
          ))}
          {consents.length === 0 && <div className="py-12 text-center"><ClipboardListIcon className="mx-auto size-6 text-primary" aria-hidden /><p className="mt-3 text-sm text-muted-foreground">No consent records yet.</p></div>}
        </div>
      )}
    </section>
  );
}

function shortDate(value: string): string {
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).format(new Date(value));
}
