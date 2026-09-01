/**
 * The rules, and the molecules they are written against.
 *
 * Every entry carries a source. If a composition could not be sourced it is not
 * here — see the note at the top of `interactions.ts` for why that rule exists.
 */

export type InteractionSeverity = "contraindicated" | "major" | "caution";

export interface PrescribedDrug {
  drug_name: string | null;
}

export interface InteractionFinding {
  id: string;
  severity: InteractionSeverity;
  headline: string;
  detail: string;
  source: string;
  /** The two prescription lines that raised it, as the doctor wrote them. */
  drugs: [string, string];
}

interface KnownDrug {
  /** Molecule ids this product supplies. A combination supplies more than one. */
  molecules: string[];
  patterns: RegExp[];
}

/**
 * Molecules and the products that contain them.
 *
 * Generic names are safe to assert. Brand names are not, and are included only
 * where the composition was checked against the manufacturer or a pharmacy
 * listing at the time of writing — the source is on each line. An Indian
 * prescription is mostly brands, so leaving them all out would make this
 * useless; asserting them from memory is what produced the Meftal-P error.
 */
export const DRUGS: readonly KnownDrug[] = [
  // ── nitrates ────────────────────────────────────────────────────────────
  // `\bnitro\b` would also match nitrofurantoin, which is an antibiotic. Each
  // nitrate is named in full instead.
  {
    molecules: ["nitrate"],
    patterns: [
      /\bglyceryl trinitrate\b/,
      /\bnitroglycerin(?:e)?\b/,
      /\bgtn\b/,
      /\bisosorbide\b/,
      /\bnicorandil\b/,
    ],
  },

  // ── PDE5 inhibitors ─────────────────────────────────────────────────────
  { molecules: ["pde5"], patterns: [/\bsildenafil\b/, /\btadalafil\b/, /\bvardenafil\b/, /\bavanafil\b/] },

  // ── anticoagulant ───────────────────────────────────────────────────────
  { molecules: ["warfarin"], patterns: [/\bwarfarin\b/, /\bacitrom\b/, /\bnicoumalone\b/, /\bacenocoumarol\b/] },

  // ── penicillins ─────────────────────────────────────────────────────────
  // Generic names only in this entry, because a generic name is a statement
  // about the molecule and needs no source beyond itself. Dentistry prescribes
  // from this class constantly, which is what makes a recorded penicillin
  // allergy worth checking against every prescription.
  {
    molecules: ["penicillin"],
    patterns: [
      /\bamoxicillin\b/,
      /\bamoxycillin\b/,
      /\bco-?amoxiclav\b/,
      /\bclavulan/,
      /\bampicillin\b/,
      /\bcloxacillin\b/,
      /\bpenicillin\b/,
      /\bphenoxymethylpenicillin\b/,
    ],
  },
  // Brands, each checked against its manufacturer's stated composition rather
  // than asserted from memory — the rule the top of this file sets after a
  // previous version classified Meftal-P as paracetamol.
  {
    molecules: ["penicillin"],
    patterns: [
      /\baugmentin\b/,   // GSK — amoxicillin + clavulanic acid
      /\bclavam\b/,      // Alkem — amoxicillin + clavulanic acid
      /\bmoxikind\b/,    // Mankind — amoxicillin + clavulanic acid
      /\bmox\b/,         // Sun Pharma — amoxicillin
    ],
  },

  // ── antiresorptives ─────────────────────────────────────────────────────
  // Not prescribed by a dentist; matched because a patient's own medication
  // list is what decides whether an extraction is safe.
  {
    molecules: ["antiresorptive"],
    patterns: [
      /\balendron/,
      /\brisedron/,
      /\bibandron/,
      /\bzoledron/,
      /\bpamidron/,
      /\bbisphosphonate/,
      /\bdenosumab\b/,
      /\bprolia\b/,     // Amgen — denosumab
      /\bxgeva\b/,      // Amgen — denosumab
    ],
  },

  // ── direct oral anticoagulants ──────────────────────────────────────────
  // Separate from warfarin: the bleeding advice is the same but the monitoring
  // is not — there is no INR to check.
  {
    molecules: ["doac"],
    patterns: [
      /\bapixaban\b/,
      /\brivaroxaban\b/,
      /\bdabigatran\b/,
      /\bedoxaban\b/,
      /\beliquis\b/,    // BMS/Pfizer — apixaban
      /\bxarelto\b/,    // Bayer — rivaroxaban
    ],
  },

  // ── NSAIDs, generic ─────────────────────────────────────────────────────
  {
    molecules: ["nsaid"],
    patterns: [
      /\bibuprofen\b/,
      /\bdiclofenac\b/,
      /\baceclofenac\b/,
      /\bnaproxen\b/,
      /\bmefenamic\b/,
      /\bindomethacin\b/,
      /\bketorolac\b/,
      /\betoricoxib\b/,
      /\bnimesulide\b/,
      /\bpiroxicam\b/,
    ],
  },

  // ── NSAID brands, each composition sourced ──────────────────────────────
  // Combiflam: ibuprofen 400 mg + paracetamol 325 mg (1mg.com, Apollo Pharmacy).
  { molecules: ["nsaid", "paracetamol"], patterns: [/\bcombiflam\b/] },
  // Zerodol-P: aceclofenac 100 mg + paracetamol 325 mg (PharmEasy, Practo).
  // Plain Zerodol is aceclofenac alone; the `p` suffix is optional here because
  // both are NSAIDs and only the paracetamol side differs — see the pattern below.
  { molecules: ["nsaid", "paracetamol"], patterns: [/\bzerodol p\b/, /\bzerodol sp\b/] },
  { molecules: ["nsaid"], patterns: [/\bzerodol\b(?! p\b)(?! sp\b)/] },
  // Meftal is mefenamic acid. Meftal-P is the paediatric mefenamic acid
  // suspension and contains NO paracetamol — the previous version of this file
  // classified it as paracetamol, which both invented a warning and suppressed a
  // real one. `\bmeftal\b` matches the suffixed forms too, which is correct.
  { molecules: ["nsaid"], patterns: [/\bmeftal\b/] },
  // The rest of the NSAID brands a dentist actually writes. Each composition is
  // the manufacturer's own, checked rather than recalled — and their absence was
  // a real gap: `src/lib/llm/extract.ts` names Brufen and Hifenac to the model
  // as expected dental prescriptions, so a prescription containing one was
  // reaching the interaction checker as an unknown word.
  {
    molecules: ["nsaid"],
    patterns: [
      /\bbrufen\b/,     // Abbott — ibuprofen
      /\bhifenac\b/,    // Intas — aceclofenac
      /\bvoveran\b/,    // Novartis — diclofenac
      /\bdolonex\b/,    // Pfizer — piroxicam
      /\bketorol\b/,    // Dr Reddy's — ketorolac
      /\bnise\b/,       // Dr Reddy's — nimesulide
    ],
  },

  // ── paracetamol ─────────────────────────────────────────────────────────
  // Dolo 650 is paracetamol 650 mg (1mg.com, PharmEasy). Crocin and Calpol are
  // paracetamol. Included because paracetamol appears in the NSAID-duplication
  // reasoning below, not because paracetamol itself is in any rule here.
  {
    molecules: ["paracetamol"],
    patterns: [/\bparacetamol\b/, /\bacetaminophen\b/, /\bdolo\b/, /\bcrocin\b/, /\bcalpol\b/],
  },

  // ── tramadol and SSRIs ──────────────────────────────────────────────────
  { molecules: ["tramadol"], patterns: [/\btramadol\b/, /\bultracet\b/] },
  {
    molecules: ["ssri"],
    patterns: [
      /\bfluoxetine\b/,
      /\bsertraline\b/,
      /\bparoxetine\b/,
      /\bescitalopram\b/,
      /\bcitalopram\b/,
      /\bfluvoxamine\b/,
    ],
  },
];

interface InteractionRule {
  id: string;
  severity: InteractionSeverity;
  left: string[];
  right: string[];
  headline: string;
  detail: string;
  source: string;
}

export const RULES: readonly InteractionRule[] = [
  {
    id: "nitrate-pde5",
    severity: "contraindicated",
    left: ["nitrate"],
    right: ["pde5"],
    headline: "Nitrate with a PDE5 inhibitor",
    detail:
      "Together these can cause a sudden, severe drop in blood pressure. The MHRA and BNF " +
      "treat this as an absolute contraindication, and it applies to nicorandil and other " +
      "nitric oxide donors as well.",
    source: "MHRA / BNF — nitrates and PDE5 inhibitors, absolute contraindication",
  },
  {
    id: "warfarin-nsaid",
    severity: "major",
    left: ["warfarin"],
    right: ["nsaid"],
    headline: "Anticoagulant with an NSAID",
    detail:
      "NSAIDs prolong bleeding time and cause gastrointestinal ulceration, and in an " +
      "anticoagulated patient that raises the risk and the severity of a bleed. Usually " +
      "avoided; where it is unavoidable it wants gastroprotection and closer INR review.",
    source: "Systematic review and meta-analysis of bleeding risk on warfarin with NSAIDs (PMID 32455439)",
  },
  {
    id: "tramadol-ssri",
    severity: "major",
    left: ["tramadol"],
    right: ["ssri"],
    headline: "Tramadol with an SSRI",
    detail:
      "Both raise serotonin, and SSRIs inhibit the CYP2D6 that clears tramadol, so levels " +
      "rise as well. Serotonin syndrome from this pair is documented and can be " +
      "life-threatening.",
    source: "Avoiding serotonin syndrome: tramadol and SSRIs (PMID 23212934)",
  },
  {
    id: "nsaid-duplicate",
    severity: "caution",
    left: ["nsaid"],
    right: ["nsaid"],
    headline: "Two NSAIDs together",
    detail:
      "Two NSAIDs on one prescription add gastrointestinal and renal risk without adding " +
      "analgesia. Worth checking this is deliberate — combination brands make it easy to " +
      "prescribe two without noticing.",
    source: "NSAID class duplication — standard prescribing guidance",
  },
];
