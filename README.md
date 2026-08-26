# docregister

A voice-driven EHR and daily register for Indian clinics. A doctor holds one
button, says *"Sunita Devi, 42, viral fever, paracetamol 650 SOS"* — in Hindi,
Punjabi, English or all three in one sentence — and it
becomes a structured, reviewable register entry.

The workspace also includes **historical recall** ("what did I prescribe
Sunita last time?"), daily analytics, a searchable patient directory, a
dedicated Accounts ledger, scheduled **Follow-ups**, and manual visit entry for
rooms or devices where dictation is unavailable.

---

## The one rule

**Nothing an LLM produces enters the register without a doctor confirming it.**

Capture is three explicit steps — transcribe → extract → **commit** — and the
third is a human action. Everything before it is a suggestion engine. The raw
transcript is stored verbatim and never overwritten by model output, so the
evidence behind every structured field is always one tap away.

---

## Tech stack, and why

| Layer | Choice | Why this one |
|---|---|---|
| Framework | **Next.js 16** (App Router, React 19, TypeScript) | One deployable for UI and API. Server Components mean the first paint carries real numbers instead of four skeletons on a clinic's mobile connection. |
| Styling | **Tailwind CSS v4** + local 21st.dev Geist adaptations | v4's `@theme` keeps the solid black/white palette, component tokens, and chart palette in one auditable CSS source. |
| Animation | **Motion** (`motion/react`) | Short, functional state transitions with a global reduced-motion policy; no ambient or decorative animation. |
| Charts | **Recharts 3** | SVG, composable, and it accepts a custom `shape` — needed to render the 2px surface gap in the stacked column chart as genuine negative space rather than a fake surface-coloured stroke. |
| Database / Auth / Storage | **Supabase** (Postgres, ap-south-1) | Row Level Security is the multi-tenant boundary, enforced in the database rather than by every query remembering `where clinic_id = …`. Auth, private object storage and Postgres in one India-region project. |
| STT | **Sarvam AI** (`saaras:v3`), ElevenLabs fallback | The engine actually built for code-mixed Indian clinical speech. Its `codemix` mode keeps Hinglish intact instead of forcing it to one language; `translit` gives a romanised transcript a doctor can skim on a phone. Providers sit behind one interface (`src/lib/stt/`) so a swap is one file. |
| LLM | **Claude Opus 5** (`claude-opus-5`) | Structured outputs via `messages.parse()` + a Zod schema, so extraction is validated at the tool-call layer instead of parsed out of prose. Adaptive thinking; prompt caching on the static instruction block. |
| Live transcript | Node **WebSocket proxy** (`server/stt-proxy.ts`) | Sarvam's realtime socket authenticates with the API key in a subprotocol — i.e. in client-side code. The proxy verifies the doctor's Supabase JWT, then dials upstream, so the key never reaches a browser. |

**Residency.** ABDM's Health Data Management Policy requires personal health
data to stay inside India. The Supabase project must be created in Mumbai
(ap-south-1) — region is fixed at creation. Sarvam is India-hosted. Anthropic is
not, which is why only transcript text (never audio, never the patient
identifier chosen at commit) crosses a border; if that is unacceptable for a
given deployment, `src/lib/llm/` is the single seam to swap for an India-hosted
model.

**Why no vector database.** The retrieval unit here is a *patient*, not a
passage. A patient has 5–50 encounters, all of which fit in context; the ranking
a doctor wants is recency, which is an `ORDER BY`; and the genuinely hard part —
mapping a spoken name to a chart — is fuzzy string matching, where embeddings
are actively worse ("Rajesh Kumar" and "Ramesh Kumar" are near-neighbours in
embedding space and different people in a waiting room). `pg_trgm` does that job
in Postgres, and every embedding would be a second copy of patient data to keep
inside India.

---

## Folder structure

```
docregister/
├── src/
│   ├── app/
│   │   ├── page.tsx                    Server component: doctor + analytics + today's register
│   │   ├── layout.tsx                  Fonts, metadata, theme bootstrap
│   │   ├── globals.css                 Solid-surface design tokens and motion policy
│   │   ├── login/page.tsx              Magic-link sign-in
│   │   ├── auth/callback/route.ts      PKCE code exchange
│   │   └── api/
│   │       ├── encounters/transcribe/  1. audio → transcript
│   │       ├── encounters/extract/     2. transcript → draft encounter
│   │       ├── encounters/[id]/        PATCH edits · DELETE discards (drafts only)
│   │       ├── encounters/[id]/commit/ 3. draft → register  ← the signature step
│   │       ├── patients/match/         fuzzy "is this the same Sunita?"
│   │       ├── recall/                 parse → SQL → summarise
│   │       └── analytics/daily/        daily buckets in IST
│   ├── components/
│   │   ├── dashboard/                  shell, navigation, views, detail surfaces
│   │   ├── charts/                     chart chrome, volume area, new-vs-returning stack
│   │   ├── follow-ups/                 queue, patient search, completion workflow
│   │   ├── icons/                      original 24×24 product icon system
│   │   ├── ui/                         local 21st.dev-inspired shared primitives
│   │   └── voice/                      dock, waveform, manual entry, review sheet
│   ├── hooks/use-voice-capture.ts      the capture state machine
│   ├── lib/
│   │   ├── audio/                      recorder (dual capture) + live socket
│   │   ├── stt/                        provider interface · sarvam · elevenlabs · mock
│   │   ├── llm/                        client · schema · extract · recall · dosage rules
│   │   ├── supabase/                   browser + server (RLS-scoped) clients
│   │   ├── api/http.ts                 withDoctor(): auth + error normalisation
│   │   ├── analytics.ts, register.ts   shared server-side reads
│   │   └── format.ts                   en-IN currency, counts, dates
│   └── proxy.ts                        session refresh + route protection (Next 16 rename)
├── server/stt-proxy.ts                 authenticated WebSocket proxy to Sarvam realtime
├── public/worklets/pcm-downsampler.js  AudioWorklet: float32 → Int16 PCM @ 16 kHz
└── supabase/
    ├── migrations/0001_init.sql        schema, RLS, commit_encounter, analytics fns
    ├── migrations/0002_storage.sql     private dictations bucket + path policies
    ├── migrations/0003_bootstrap.sql   first-login trigger (breaks the RLS deadlock)
    ├── migrations/0004_…0015_*.sql     security, recovery, amendments, follow-ups
    ├── migrations/0016_accounts.sql    isolated ledger + legacy financial cleanup
    └── seed.sql                        optional: three weeks of demo register
```

---

## Backend: voice in, register row out

```
  hold mic ──► AudioWorklet ──► WS proxy ──► Sarvam realtime ──► interim text (UI only)
        │
        └───► MediaRecorder ──► POST /api/encounters/transcribe
                                    │  store audio first, then transcribe
                                    ▼
                               transcripts row (raw_text — never overwritten)
                                    │
                               POST /api/encounters/extract
                                    │  Claude + Zod schema; dosage normalised by rule table
                                    ▼
                               encounters row (status: draft) + prescription_items
                                    │
                               ── doctor reviews and edits ──  PATCH /api/encounters/[id]
                                    │
                               POST /api/encounters/[id]/commit
                                    │  commit_encounter(): visit_number + is_new_patient
                                    ▼                        assigned in one transaction
                               status: committed  →  register + analytics
```

Two capture paths run at once and they are not interchangeable. The
`MediaRecorder` blob is the **transcript of record**; the WebSocket stream is
feedback while speaking. Conflating them puts partial, unconfirmed text into a
medical record.

| Route | Does | Notable |
|---|---|---|
| `POST /api/encounters/transcribe` | audio → text | Uploads to private storage **before** calling STT, so a provider failure never loses the consultation. Biases the recogniser with the doctor's own top-40 drugs. |
| `POST /api/encounters/extract` | text → draft | Reuses an existing draft for the same transcript. Stores the model's untouched output in `extracted_raw` beside the editable columns. Returns candidate patients — offered, never auto-linked. |
| `PATCH /api/encounters/[id]` | save edits | Drafts only; a committed visit returns 409. Silently mutable history is a liability in a clinical record. |
| `POST /api/encounters/[id]/commit` | draft → register | Idempotent: a second tap returns the first result. A duplicate phone links to the existing chart instead of creating a second one for the same person. |
| `POST /api/recall` | question → answer | LLM parses, Postgres retrieves, LLM summarises **only those rows**. Ambiguous names come back as candidates for the doctor to pick. |
| `GET /api/analytics/daily` | daily buckets | `generate_series` so empty days are zeros, not gaps; bucketed `at time zone 'Asia/Kolkata'` so an 8pm consultation is not tomorrow. |
| `GET /api/patients/match` | fuzzy lookup | Exact phone outranks any name similarity; `pg_trgm` handles Sunita/Suneeta. |

Every route goes through `withDoctor()`, which resolves the doctor row before
anything else runs (`clinic_id` is read from the database, never from the
request body) and normalises errors — a raw Postgres or provider error can
contain row contents, which here means patient data in a browser console.

Dosage shorthand is **not** left to the model. "BD", "1-0-1", "do baar" and
"ਦੋ ਵਾਰ" all mean twice daily; a rule table (`src/lib/llm/dosage.ts`) gets that
right every time, and an LLM gets it right most of the time — the wrong
reliability class for a prescription. Anything the table does not recognise is
flagged `needs_review` rather than guessed.

---

## Setup

```bash
npm install
cp .env.local.example .env.local     # fill in the two Supabase values
```

**1. Create the Supabase project in Mumbai (ap-south-1).** Region is fixed at
creation and ABDM requires India residency.

**2. Run every migration** in filename order. With a linked Supabase project:

```bash
npx supabase db push
```

`0003` is not optional. Every RLS policy keys off `auth_clinic_id()`, which
reads the `doctors` table — so a brand-new user with no `doctors` row cannot
even create their own clinic. A `SECURITY DEFINER` trigger on `auth.users`
breaks that deadlock at sign-up.

`0016` moves historical visit fees into the doctor-scoped Accounts ledger,
scrubs financial values from clinical records, and prevents them from being
written back there. Apply it before opening the Accounts tab.

**3. Enable email sign-in** (Authentication → Providers → Email) and add
`http://localhost:3000/auth/callback` to the redirect allow-list.

**4. Run it.**

```bash
npm run dev      # Next on :3000 and the STT proxy on :8787, together
```

**Testing on a real phone.** `next dev` also prints a Network URL
(`http://<lan-ip>:3000`). Recording will not work there and cannot be made to:
`navigator.mediaDevices` is undefined outside a secure context, so the browser
never exposes a microphone over plain http to anything but `localhost`. Use:

```bash
npm run dev:https   # same pair, with a locally-trusted certificate
```

and open the `https://<lan-ip>:3000` URL on the handset. Add that origin to the
Supabase redirect allow-list too, or the magic link will bounce.

One caveat, so it is not a surprise: the live-transcript proxy still speaks
`ws://`, which an https page treats as mixed content and blocks. Dictation,
extraction and commit all work — the interim text that streams while you speak
does not, and the recorder degrades to "Live transcription unavailable" rather
than failing the recording. The blob that becomes the transcript of record is
captured by `MediaRecorder`, not by that socket.

With `STT_PROVIDER=mock` and `LLM_MOCK=1` — the defaults in the example env —
the entire dictate → review → commit loop works offline with no paid API keys,
including a canned Hinglish live-transcript stream. Sign in, then optionally run
`supabase/seed.sql` for three weeks of demo register.

**5. Go live** by filling in `SARVAM_API_KEY` and `ANTHROPIC_API_KEY`, then
setting `STT_PROVIDER=sarvam` and `LLM_MOCK=0`.

```bash
npm run typecheck   # next typegen && tsc --noEmit
npm run lint
npm run build
```

---

## Notes on the UI

**Solid, system-native surfaces.** Page backgrounds are exactly white or black.
Grouped content uses opaque `#f5f5f7` / `#1c1c1e` surfaces with hairline
separators, while Apple blue is reserved for focus and primary action. The
default appearance follows the operating system and can be overridden with the
System / Light / Dark control.

**Locally maintained components and icons.** Shared controls adapt selected
21st.dev Geist patterns into this repository; no design code or visual assets
are fetched at runtime. Functional glyphs use the original 24×24 icon set in
`src/components/icons`, and the document-plus-waveform geometry is shared by the
app lockup and install icons.

**Compact clinical hierarchy.** Desktop uses a persistent sidebar and dense
tables or grouped lists. Mobile uses one top menu for every workspace and keeps
the safe-area-aware bottom edge for the voice dock. Review and detail surfaces
remain accessible Radix dialogs with sticky actions and explicit focus handling.

**Accessibility is not colour alone.** Uncertain extracted fields carry a dot
*and* the words "check this". A legend appears for two or more series and never
for one. Every chart has a reachable table view. `prefers-contrast: more`
strengthens the separators, and `prefers-reduced-motion` is
honoured in both channels it can reach: the CSS block covers stylesheet
animation, and `<MotionConfig reducedMotion="user">` in the root layout covers
everything animated from JavaScript — which is most of it.
