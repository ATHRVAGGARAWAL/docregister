/**
 * Curated drug-interaction and dose-ceiling table.
 *
 * ADVISORY ONLY. Nothing here blocks a save, edits a prescription, or hides a
 * medicine. It exists so a doctor gets one more glance before confirming, and
 * the doctor overrides it by doing nothing.
 *
 * That framing sets the curation bar. A checker that fires on everything gets
 * dismissed on everything, so this table is deliberately small: a pair earns a
 * place only when the mechanism is established, the pair is one an Indian
 * outpatient clinic actually writes on the same slip, and the advice is
 * something a GP can act on in the room. Each rule carries its mechanism.
 *
 * Deliberately NOT modelled, so the omissions are decisions rather than gaps:
 *
 * - Low-dose aspirin (Ecosprin) with anything. Aspirin plus an anticoagulant or
 *   another NSAID is a real bleeding interaction, but dual therapy is also
 *   routinely intended in cardiology, and ibuprofen-blunts-aspirin needs dose
 *   timing this app never sees. Firing on every cardiac patient who is given a
 *   painkiller is precisely the alarm fatigue that makes the rest ignorable.
 * - Anything requiring a lab value, a weight, a diagnosis or a renal function
 *   the register does not hold. A warning that cannot be true or false from the
 *   prescription alone is a guess wearing a warning's clothes.
 * - Fluconazole with statins. It inhibits CYP3A4 only moderately; the certain
 *   fluconazole interaction here is the CYP2C9 one with anticoagulants.
 */

/**
 * Two levels, not three.
 *
 * A "minor" tier would be a warning too small to change what the doctor does,
 * and every one of those spends attention that the major ones need.
 */
export type Severity = "major" | "moderate";

export type DrugClass =
  | "nsaid"
  | "vitamin_k_antagonist"
  | "acei_or_arb"
  | "loop_diuretic"
  | "cyp2c9_inhibitor"
  | "cyp2c19_inhibitor"
  | "cyp3a4_inhibitor"
  | "cyp1a2_inhibitor"
  | "cyp3a4_statin"
  | "fluoroquinolone"
  | "polyvalent_cation"
  | "ssri"
  | "nitrate"
  | "pde5_inhibitor";

export interface Ingredient {
  readonly id: string;
  /** Shown to the doctor when the warning names the molecule. */
  readonly label: string;
  readonly classes: readonly DrugClass[];
  /**
   * Matched against text normalised by `normaliseDrugText`: lowercase, all
   * punctuation collapsed to spaces, and letter/digit runs split apart, so
   * "Pan-D", "PAN D" and "pan40" all arrive as space-separated tokens.
   *
   * Patterns are whole tokens, never prefixes. Indian brand names collide at
   * the front far too often for a prefix to be safe — Dolo is paracetamol and
   * Dolonex is piroxicam, Digene is an antacid and digoxin is not, Ciplox is
   * ciprofloxacin and Ciplar is propranolol. A missed match costs a warning; a
   * wrong match costs the doctor's trust in every warning after it.
   */
  readonly patterns: readonly RegExp[];
}

export const INGREDIENTS = [
  // ---- Analgesics and antipyretics ---------------------------------------
  {
    id: "paracetamol",
    label: "Paracetamol",
    classes: [],
    // The combination brands matter more than the plain ones. A doctor adding
    // Dolo to a patient already on Combiflam is not knowingly doubling
    // paracetamol — the second product simply does not say so on the strip.
    patterns: [
      /\bparacetamol\b/,
      /\bacetaminophen\b/,
      /\bpcm\b/,
      /\bdolo\b/,
      /\bcrocin\b/,
      /\bcalpol\b/,
      /\bpacimol\b/,
      /\bpyrigesic\b/,
      /\bsinarest\b/,
      /\bcheston cold\b/,
      /\bcombiflam\b/,
      /\bultracet\b/,
      /\bzerodol (?:sp|p)\b/,
      /\bnicip plus\b/,
      /\bmeftal p\b/,
    ],
  },
  {
    id: "ibuprofen",
    label: "Ibuprofen",
    classes: ["nsaid"],
    patterns: [/\bibuprofen\b/, /\bbrufen\b/, /\bcombiflam\b/, /\bibugesic\b/],
  },
  {
    id: "diclofenac",
    label: "Diclofenac",
    classes: ["nsaid"],
    patterns: [/\bdiclofenac\b/, /\bvoveran\b/, /\bdynapar\b/],
  },
  {
    id: "aceclofenac",
    label: "Aceclofenac",
    classes: ["nsaid"],
    patterns: [/\baceclofenac\b/, /\bzerodol\b/, /\bhifenac\b/, /\bacenac\b/],
  },
  {
    id: "naproxen",
    label: "Naproxen",
    classes: ["nsaid"],
    patterns: [/\bnaproxen\b/, /\bnaprosyn\b/],
  },
  {
    id: "mefenamic_acid",
    label: "Mefenamic acid",
    classes: ["nsaid"],
    patterns: [/\bmefenamic\b/, /\bmeftal\b/],
  },
  {
    id: "nimesulide",
    label: "Nimesulide",
    classes: ["nsaid"],
    patterns: [/\bnimesulide\b/, /\bnise\b/, /\bnimulid\b/, /\bnicip\b/],
  },
  {
    id: "piroxicam",
    label: "Piroxicam",
    classes: ["nsaid"],
    patterns: [/\bpiroxicam\b/, /\bdolonex\b/],
  },
  {
    id: "etoricoxib",
    label: "Etoricoxib",
    classes: ["nsaid"],
    patterns: [/\betoricoxib\b/, /\bnucoxia\b/, /\betoshine\b/],
  },
  {
    id: "ketorolac",
    label: "Ketorolac",
    classes: ["nsaid"],
    patterns: [/\bketorolac\b/, /\bketorol\b/, /\bketanov\b/],
  },
  {
    id: "indomethacin",
    label: "Indomethacin",
    classes: ["nsaid"],
    patterns: [/\bindomethacin\b/, /\bindocap\b/],
  },
  {
    id: "tramadol",
    label: "Tramadol",
    classes: [],
    patterns: [/\btramadol\b/, /\btramazac\b/, /\bultracet\b/, /\bdomadol\b/],
  },

  // ---- Anticoagulants and antiplatelets ----------------------------------
  {
    id: "warfarin",
    label: "Warfarin",
    classes: ["vitamin_k_antagonist"],
    patterns: [/\bwarfarin\b/, /\bwarf\b/, /\buniwarfin\b/],
  },
  {
    id: "acenocoumarol",
    label: "Acenocoumarol",
    classes: ["vitamin_k_antagonist"],
    patterns: [/\bacenocoumarol\b/, /\bacitrom\b/],
  },
  {
    id: "clopidogrel",
    label: "Clopidogrel",
    classes: [],
    patterns: [/\bclopidogrel\b/, /\bclopilet\b/, /\bdeplatt\b/, /\bclopitab\b/, /\bplavix\b/],
  },

  // ---- Acid suppression ---------------------------------------------------
  {
    id: "omeprazole",
    label: "Omeprazole",
    classes: ["cyp2c19_inhibitor"],
    patterns: [/\bomeprazole\b/, /\bomez\b/, /\bocid\b/],
  },
  {
    id: "esomeprazole",
    label: "Esomeprazole",
    classes: ["cyp2c19_inhibitor"],
    patterns: [/\besomeprazole\b/, /\bnexium\b/, /\bsompraz\b/, /\besomac\b/],
  },
  {
    // Carries no class on purpose. Pantoprazole is the way out of the
    // clopidogrel warning below, so it has to be recognisable as itself rather
    // than falling into a catch-all "PPI".
    id: "pantoprazole",
    label: "Pantoprazole",
    classes: [],
    patterns: [/\bpantoprazole\b/, /\bpan d\b/, /\bpan (?:20|40)\b/, /\bpantocid\b/, /\bpantop\b/],
  },

  // ---- Antimicrobials and antifungals -------------------------------------
  {
    id: "fluconazole",
    label: "Fluconazole",
    classes: ["cyp2c9_inhibitor"],
    patterns: [/\bfluconazole\b/, /\bforcan\b/, /\bzocon\b/, /\bfluka\b/],
  },
  {
    id: "metronidazole",
    label: "Metronidazole",
    classes: ["cyp2c9_inhibitor"],
    patterns: [/\bmetronidazole\b/, /\bmetrogyl\b/, /\bflagyl\b/],
  },
  {
    id: "cotrimoxazole",
    label: "Co-trimoxazole",
    classes: ["cyp2c9_inhibitor"],
    patterns: [
      /\bco trimoxazole\b/,
      /\bcotrimoxazole\b/,
      /\btrimethoprim\b/,
      /\bsulfamethoxazole\b/,
      /\bseptran\b/,
      /\bbactrim\b/,
    ],
  },
  {
    id: "clarithromycin",
    label: "Clarithromycin",
    classes: ["cyp3a4_inhibitor"],
    patterns: [/\bclarithromycin\b/, /\bclaribid\b/, /\bcrixan\b/],
  },
  {
    id: "erythromycin",
    label: "Erythromycin",
    classes: ["cyp3a4_inhibitor"],
    patterns: [/\berythromycin\b/, /\berythrocin\b/, /\balthrocin\b/],
  },
  {
    id: "itraconazole",
    label: "Itraconazole",
    classes: ["cyp3a4_inhibitor"],
    patterns: [/\bitraconazole\b/, /\bcanditral\b/, /\bitrasys\b/, /\bsporanox\b/],
  },
  {
    // Recognised precisely so it stays out of the statin rule: azithromycin is
    // the macrolide that does not meaningfully inhibit CYP3A4, and it is by far
    // the most prescribed one here.
    id: "azithromycin",
    label: "Azithromycin",
    classes: [],
    patterns: [/\bazithromycin\b/, /\bazithral\b/, /\bazee\b/, /\bzithromax\b/],
  },
  {
    id: "ciprofloxacin",
    label: "Ciprofloxacin",
    classes: ["fluoroquinolone", "cyp1a2_inhibitor"],
    patterns: [/\bciprofloxacin\b/, /\bciplox\b/, /\bcifran\b/, /\bciprobid\b/],
  },
  {
    id: "norfloxacin",
    label: "Norfloxacin",
    classes: ["fluoroquinolone", "cyp1a2_inhibitor"],
    patterns: [/\bnorfloxacin\b/, /\bnorflox\b/],
  },
  {
    id: "levofloxacin",
    label: "Levofloxacin",
    classes: ["fluoroquinolone"],
    patterns: [/\blevofloxacin\b/, /\blevoflox\b/, /\blevoday\b/],
  },
  {
    id: "ofloxacin",
    label: "Ofloxacin",
    classes: ["fluoroquinolone"],
    patterns: [/\bofloxacin\b/, /\boflox\b/, /\bzanocin\b/],
  },
  {
    id: "moxifloxacin",
    label: "Moxifloxacin",
    classes: ["fluoroquinolone"],
    patterns: [/\bmoxifloxacin\b/],
  },

  // ---- Lipids -------------------------------------------------------------
  {
    id: "atorvastatin",
    label: "Atorvastatin",
    classes: ["cyp3a4_statin"],
    patterns: [/\batorvastatin\b/, /\batorva\b/, /\bstorvas\b/, /\blipicure\b/, /\btonact\b/],
  },
  {
    id: "simvastatin",
    label: "Simvastatin",
    classes: ["cyp3a4_statin"],
    patterns: [/\bsimvastatin\b/, /\bsimvotin\b/],
  },
  {
    // Cleared largely outside CYP3A4, so it is the statin the macrolide warning
    // must not fire on.
    id: "rosuvastatin",
    label: "Rosuvastatin",
    classes: [],
    patterns: [/\brosuvastatin\b/, /\brosuvas\b/, /\bcrestor\b/],
  },

  // ---- Supplements and antacids -------------------------------------------
  {
    id: "calcium",
    label: "Calcium",
    classes: ["polyvalent_cation"],
    patterns: [/\bcalcium\b/, /\bshelcal\b/, /\bcalcimax\b/, /\bostocalcium\b/],
  },
  {
    id: "iron",
    label: "Iron",
    classes: ["polyvalent_cation"],
    patterns: [/\biron\b/, /\bferrous\b/, /\bfefol\b/, /\blivogen\b/, /\borofer\b/, /\bautrin\b/],
  },
  {
    id: "antacid",
    label: "Antacid",
    classes: ["polyvalent_cation"],
    patterns: [
      /\bantacid\b/,
      /\bdigene\b/,
      /\bgelusil\b/,
      /\bmucaine\b/,
      /\bmagaldrate\b/,
      /\baluminium hydroxide\b/,
      /\bmagnesium hydroxide\b/,
    ],
  },
  {
    id: "sucralfate",
    label: "Sucralfate",
    classes: ["polyvalent_cation"],
    patterns: [/\bsucralfate\b/, /\bsucrafil\b/, /\bsucral\b/],
  },

  // ---- Thyroid ------------------------------------------------------------
  {
    id: "levothyroxine",
    label: "Levothyroxine",
    classes: [],
    patterns: [/\blevothyroxine\b/, /\bthyronorm\b/, /\beltroxin\b/, /\bthyrox\b/],
  },

  // ---- Psychiatry ---------------------------------------------------------
  {
    id: "fluoxetine",
    label: "Fluoxetine",
    classes: ["ssri"],
    patterns: [/\bfluoxetine\b/, /\bfludac\b/, /\bprodep\b/],
  },
  {
    id: "sertraline",
    label: "Sertraline",
    classes: ["ssri"],
    patterns: [/\bsertraline\b/, /\bserlift\b/, /\bdaxid\b/, /\bzoloft\b/],
  },
  {
    id: "escitalopram",
    label: "Escitalopram",
    classes: ["ssri"],
    patterns: [/\bescitalopram\b/, /\bnexito\b/, /\bcipralex\b/],
  },
  {
    id: "paroxetine",
    label: "Paroxetine",
    classes: ["ssri"],
    patterns: [/\bparoxetine\b/, /\bpaxidep\b/],
  },
  {
    id: "fluvoxamine",
    label: "Fluvoxamine",
    classes: ["ssri"],
    patterns: [/\bfluvoxamine\b/],
  },

  // ---- Immunosuppression --------------------------------------------------
  {
    id: "methotrexate",
    label: "Methotrexate",
    classes: [],
    patterns: [/\bmethotrexate\b/, /\bfolitrax\b/, /\bneotrexate\b/],
  },

  // ---- Cardiovascular -----------------------------------------------------
  {
    id: "telmisartan",
    label: "Telmisartan",
    classes: ["acei_or_arb"],
    patterns: [/\btelmisartan\b/, /\btelma\b/],
  },
  {
    id: "losartan",
    label: "Losartan",
    classes: ["acei_or_arb"],
    patterns: [/\blosartan\b/, /\blosar\b/, /\bcozaar\b/],
  },
  {
    id: "olmesartan",
    label: "Olmesartan",
    classes: ["acei_or_arb"],
    patterns: [/\bolmesartan\b/, /\bolmat\b/],
  },
  {
    id: "valsartan",
    label: "Valsartan",
    classes: ["acei_or_arb"],
    patterns: [/\bvalsartan\b/],
  },
  {
    id: "ramipril",
    label: "Ramipril",
    classes: ["acei_or_arb"],
    patterns: [/\bramipril\b/, /\bcardace\b/],
  },
  {
    id: "enalapril",
    label: "Enalapril",
    classes: ["acei_or_arb"],
    patterns: [/\benalapril\b/, /\benvas\b/],
  },
  {
    id: "lisinopril",
    label: "Lisinopril",
    classes: ["acei_or_arb"],
    patterns: [/\blisinopril\b/],
  },
  {
    id: "perindopril",
    label: "Perindopril",
    classes: ["acei_or_arb"],
    patterns: [/\bperindopril\b/],
  },
  {
    id: "spironolactone",
    label: "Spironolactone",
    classes: [],
    patterns: [/\bspironolactone\b/, /\baldactone\b/],
  },
  {
    id: "furosemide",
    label: "Furosemide",
    classes: ["loop_diuretic"],
    patterns: [/\bfurosemide\b/, /\bfrusemide\b/, /\blasix\b/],
  },
  {
    id: "torsemide",
    label: "Torsemide",
    classes: ["loop_diuretic"],
    patterns: [/\btorsemide\b/, /\bdytor\b/],
  },
  {
    id: "digoxin",
    label: "Digoxin",
    classes: [],
    patterns: [/\bdigoxin\b/, /\blanoxin\b/],
  },
  {
    id: "isosorbide",
    label: "Isosorbide",
    classes: ["nitrate"],
    patterns: [/\bisosorbide\b/, /\bsorbitrate\b/, /\bmonotrate\b/, /\bismn\b/, /\bisdn\b/],
  },
  {
    id: "nitroglycerin",
    label: "Nitroglycerin",
    classes: ["nitrate"],
    patterns: [/\bnitroglycerin\b/, /\bglyceryl trinitrate\b/, /\bnitrocontin\b/, /\bntg\b/],
  },
  {
    id: "sildenafil",
    label: "Sildenafil",
    classes: ["pde5_inhibitor"],
    patterns: [/\bsildenafil\b/, /\bviagra\b/, /\bpenegra\b/, /\bsuhagra\b/],
  },
  {
    id: "tadalafil",
    label: "Tadalafil",
    classes: ["pde5_inhibitor"],
    patterns: [/\btadalafil\b/, /\bmegalis\b/, /\btadacip\b/, /\bcialis\b/],
  },

  // ---- Respiratory --------------------------------------------------------
  {
    id: "theophylline",
    label: "Theophylline",
    classes: [],
    patterns: [/\btheophylline\b/, /\bderiphyllin\b/],
  },

  // ---- Recognised only to keep a neighbour honest --------------------------
  {
    // Metformin and metronidazole are one syllable apart in dictation and share
    // a prefix in writing; recognising both is what lets the test prove Metrogyl
    // never resolves to metformin.
    id: "metformin",
    label: "Metformin",
    classes: [],
    patterns: [/\bmetformin\b/, /\bglycomet\b/, /\bglucophage\b/],
  },
] as const satisfies readonly Ingredient[];

export type IngredientId = (typeof INGREDIENTS)[number]["id"];

export type Selector =
  | { readonly kind: "ingredient"; readonly id: IngredientId }
  | { readonly kind: "class"; readonly id: DrugClass };

const drug = (id: IngredientId): Selector => ({ kind: "ingredient", id });
const group = (id: DrugClass): Selector => ({ kind: "class", id });

export interface InteractionRule {
  readonly id: string;
  readonly left: Selector;
  readonly right: Selector;
  readonly severity: Severity;
  /** `duplicate` is the same molecule or class reaching the patient twice. */
  readonly kind: "interaction" | "duplicate";
  /** Two or three words naming what could go wrong. */
  readonly headline: string;
  /** One sentence of mechanism, phrased for a doctor mid-consultation. */
  readonly detail: string;
  /** An option to weigh, never an instruction. */
  readonly action: string;
}

export const INTERACTION_RULES: readonly InteractionRule[] = [
  {
    // Mechanism: NSAIDs irreversibly inhibit platelet COX-1 and strip the
    // prostaglandin defences of the gastric mucosa, so an anticoagulated
    // patient bleeds from a lesion they would otherwise have tolerated. Several
    // NSAIDs additionally inhibit CYP2C9 and displace warfarin from albumin,
    // pushing INR up on an unchanged dose. Among the best-evidenced
    // interactions in general practice.
    id: "vka_nsaid",
    left: group("vitamin_k_antagonist"),
    right: group("nsaid"),
    severity: "major",
    kind: "interaction",
    headline: "Higher bleeding risk",
    detail:
      "An NSAID adds platelet inhibition and gastric mucosal injury on top of anticoagulation, and several NSAIDs also push INR up on an unchanged dose.",
    action:
      "Paracetamol is the usual alternative. If an NSAID is needed, consider gastric cover and an earlier INR check.",
  },
  {
    // Mechanism: fluconazole, metronidazole and trimethoprim-sulfamethoxazole
    // all inhibit CYP2C9, which clears S-warfarin and acenocoumarol. INR can
    // double within three to five days of starting the antimicrobial, which is
    // usually before the patient is next seen.
    id: "vka_cyp2c9",
    left: group("vitamin_k_antagonist"),
    right: group("cyp2c9_inhibitor"),
    severity: "major",
    kind: "interaction",
    headline: "INR may climb",
    detail:
      "This antimicrobial inhibits CYP2C9, the enzyme that clears the anticoagulant, so INR can rise sharply within a few days of starting it.",
    action:
      "Consider an antimicrobial without this effect, or an INR check a few days in rather than at the next routine visit.",
  },
  {
    // Mechanism: when the renin-angiotensin system is blocked, glomerular
    // filtration leans on prostaglandin-mediated afferent arteriolar dilatation.
    // An NSAID removes exactly that, so eGFR and blood-pressure control both
    // fall. The classic harm is the "triple whammy" with a diuretic, but the
    // pair alone is enough to move creatinine in an elderly patient.
    id: "acei_arb_nsaid",
    left: group("acei_or_arb"),
    right: group("nsaid"),
    severity: "moderate",
    kind: "interaction",
    headline: "Kidney and BP effect",
    detail:
      "An NSAID removes the prostaglandin support the kidney relies on once the renin-angiotensin system is blocked, so renal function and blood-pressure control can both drop — more so if a diuretic is also running.",
    action: "Consider the shortest course at the lowest dose, and renal function at follow-up.",
  },
  {
    // Mechanism: two independent potassium-retaining pathways. Blocking
    // angiotensin II lowers aldosterone; spironolactone blocks the aldosterone
    // receptor itself. Together, and especially with any renal impairment, they
    // produce hyperkalaemia that is silent until it is an arrhythmia.
    id: "acei_arb_potassium_sparing",
    left: group("acei_or_arb"),
    right: drug("spironolactone"),
    severity: "major",
    kind: "interaction",
    headline: "Potassium may rise",
    detail:
      "Both drugs retain potassium by separate routes, and the rise is silent until it shows up as an arrhythmia — the risk is highest with any degree of renal impairment.",
    action: "Consider potassium and creatinine within a week or two of starting the pair.",
  },
  {
    // Mechanism: clopidogrel is a prodrug activated by CYP2C19. Omeprazole and
    // esomeprazole inhibit that enzyme, measurably reducing platelet
    // inhibition. Pantoprazole is the pragmatic substitute and is why it is
    // recognised separately above.
    id: "clopidogrel_cyp2c19",
    left: drug("clopidogrel"),
    right: group("cyp2c19_inhibitor"),
    severity: "moderate",
    kind: "interaction",
    headline: "Clopidogrel may be weakened",
    detail:
      "This PPI inhibits CYP2C19, the enzyme that converts clopidogrel into its active form, so the antiplatelet effect can fall.",
    action: "Pantoprazole is the usual alternative when gastric cover is still wanted.",
  },
  {
    // Mechanism: atorvastatin and simvastatin are CYP3A4 substrates.
    // Clarithromycin, erythromycin and itraconazole inhibit CYP3A4 strongly
    // enough to multiply statin exposure several-fold for the length of the
    // course, and rhabdomyolysis from this pair is well documented.
    id: "statin_cyp3a4",
    left: group("cyp3a4_statin"),
    right: group("cyp3a4_inhibitor"),
    severity: "major",
    kind: "interaction",
    headline: "Muscle injury risk",
    detail:
      "This antimicrobial strongly inhibits CYP3A4, which clears atorvastatin and simvastatin, so statin levels can rise far enough to cause myopathy or rhabdomyolysis.",
    action:
      "Consider holding the statin for the length of the course, or an antimicrobial that does not inhibit CYP3A4.",
  },
  {
    // Mechanism: fluoroquinolones chelate divalent and trivalent cations in the
    // gut lumen. Calcium, iron and aluminium/magnesium antacids can remove most
    // of an oral dose — the failure mode is a treatment failure nobody
    // attributes to the supplement.
    id: "fluoroquinolone_cation",
    left: group("fluoroquinolone"),
    right: group("polyvalent_cation"),
    severity: "moderate",
    kind: "interaction",
    headline: "Antibiotic may not absorb",
    detail:
      "Calcium, iron and aluminium or magnesium antacids bind fluoroquinolones in the gut and can remove most of an oral dose, so the course quietly under-treats.",
    action: "Both can stay — spacing them at least two hours apart is usually enough.",
  },
  {
    // Mechanism: same chelation, different consequence. Levothyroxine is
    // absorbed in a narrow window and is dosed to a TSH; calcium and iron taken
    // with it lower absorption enough to drift TSH up and prompt a dose
    // increase that is not actually needed. Shelcal alongside Thyronorm is one
    // of the most common pairs in this clinic.
    id: "levothyroxine_cation",
    left: drug("levothyroxine"),
    right: group("polyvalent_cation"),
    severity: "moderate",
    kind: "interaction",
    headline: "Thyroxine may not absorb",
    detail:
      "Calcium and iron bind levothyroxine in the gut, which is why it is taken fasting; together, absorption falls and TSH drifts up on an unchanged dose.",
    action: "Consider spacing them by four hours — thyroxine on waking, the supplement later.",
  },
  {
    // Mechanism: tramadol inhibits serotonin reuptake in its own right and
    // lowers the seizure threshold. With an SSRI, both effects add, and the
    // patient is rarely warned because the analgesic feels incidental.
    id: "tramadol_ssri",
    left: drug("tramadol"),
    right: group("ssri"),
    severity: "moderate",
    kind: "interaction",
    headline: "Serotonin and seizure risk",
    detail:
      "Tramadol is itself serotonergic and lowers the seizure threshold, so with an SSRI the risk of serotonin toxicity and of a fit both go up.",
    action:
      "Consider a non-serotonergic analgesic, or the lowest effective tramadol dose with the patient told what to watch for.",
  },
  {
    // Mechanism: methotrexate is cleared almost entirely by renal tubular
    // secretion, which NSAIDs reduce. Even low weekly doses can accumulate into
    // mucositis and marrow suppression.
    id: "methotrexate_nsaid",
    left: drug("methotrexate"),
    right: group("nsaid"),
    severity: "major",
    kind: "interaction",
    headline: "Methotrexate may accumulate",
    detail:
      "NSAIDs reduce renal clearance of methotrexate, and even the low weekly dose can then build up to mucositis or marrow suppression.",
    action:
      "Paracetamol is safer for pain here. If an NSAID is unavoidable, consider a blood count and renal function.",
  },
  {
    // Mechanism: trimethoprim is itself an antifolate, so it stacks with
    // methotrexate on the same pathway. Pancytopenia from this pair is reported
    // at ordinary rheumatology doses, and co-trimoxazole is prescribed casually.
    id: "methotrexate_cotrimoxazole",
    left: drug("methotrexate"),
    right: drug("cotrimoxazole"),
    severity: "major",
    kind: "interaction",
    headline: "Marrow suppression risk",
    detail:
      "Trimethoprim is an antifolate like methotrexate, and the pair has caused pancytopenia even at ordinary weekly methotrexate doses.",
    action: "Consider a different antibiotic for this course.",
  },
  {
    // Mechanism: digoxin competes with potassium at the Na+/K+-ATPase, so
    // diuretic-induced hypokalaemia increases binding and produces toxicity at
    // an unchanged dose. The oldest interaction in the book and still the one
    // that arrives as nausea and a slow pulse.
    id: "digoxin_loop_diuretic",
    left: drug("digoxin"),
    right: group("loop_diuretic"),
    severity: "moderate",
    kind: "interaction",
    headline: "Digoxin toxicity risk",
    detail:
      "A loop diuretic lowers potassium, and low potassium increases digoxin binding at the sodium pump, so toxicity can appear on an unchanged dose.",
    action: "Consider checking potassium, and correcting it if it is low.",
  },
  {
    // Mechanism: nitrates donate NO to raise cGMP; PDE5 inhibitors block its
    // breakdown. Together the vasodilatation is unopposed and hypotension can be
    // profound. This is a formal contraindication, not a caution.
    id: "nitrate_pde5",
    left: group("nitrate"),
    right: group("pde5_inhibitor"),
    severity: "major",
    kind: "interaction",
    headline: "Severe hypotension",
    detail:
      "Both raise cGMP by opposite routes and together can drop blood pressure profoundly; this pair is contraindicated rather than merely cautioned.",
    action:
      "These are not usually given together — the standard gap is at least 24 hours, and 48 for tadalafil.",
  },
  {
    // Mechanism: ciprofloxacin and norfloxacin inhibit CYP1A2, which clears
    // theophylline, a drug with almost no therapeutic margin. Levofloxacin does
    // not, which is why this rule uses its own class rather than the whole
    // fluoroquinolone group.
    id: "cyp1a2_theophylline",
    left: group("cyp1a2_inhibitor"),
    right: drug("theophylline"),
    severity: "moderate",
    kind: "interaction",
    headline: "Theophylline may rise",
    detail:
      "Ciprofloxacin and norfloxacin inhibit CYP1A2, which clears theophylline, and theophylline has very little margin between working and toxic.",
    action:
      "Levofloxacin does not have this effect. Otherwise consider a lower theophylline dose and warn about nausea or palpitations.",
  },
  {
    // Mechanism: no additional analgesia, additive COX inhibition. Doubling the
    // gastric and renal risk for no benefit is the whole of it — and it happens
    // because the second NSAID arrives as a brand, not as a molecule.
    id: "nsaid_duplicate",
    left: group("nsaid"),
    right: group("nsaid"),
    severity: "moderate",
    kind: "duplicate",
    headline: "Two NSAIDs together",
    detail:
      "A second NSAID adds little analgesia while doubling the gastric and renal risk of the first.",
    action: "Consider keeping one, and adding paracetamol if more analgesia is needed.",
  },
  {
    // Mechanism: hepatotoxicity is cumulative across products, and combination
    // brands do not announce their paracetamol. Two slips that each look modest
    // can pass the 4 g adult ceiling between them.
    id: "paracetamol_duplicate",
    left: drug("paracetamol"),
    right: drug("paracetamol"),
    severity: "moderate",
    kind: "duplicate",
    headline: "Paracetamol in two products",
    detail:
      "Combination brands carry paracetamol without saying so, so two products can add up past the 4 g daily ceiling between them.",
    action: "Consider totalling the daily paracetamol across both, or dropping one.",
  },
];

export interface DoseCeiling {
  readonly ingredient: IngredientId;
  /** Adult ceiling for the total of all lines of this ingredient. */
  readonly maxDailyMg: number;
  readonly severity: Severity;
  readonly headline: string;
  /** Why the ceiling exists. The measured total is prefixed at match time. */
  readonly reason: string;
  readonly action: string;
}

/**
 * Only ceilings that are a single unambiguous adult number, where crossing it
 * causes harm the patient cannot feel coming. Anything weight-based, renally
 * adjusted or indication-dependent is not something a prescription line alone
 * can judge, so it is not here.
 */
export const DOSE_CEILINGS: readonly DoseCeiling[] = [
  {
    ingredient: "paracetamol",
    maxDailyMg: 4000,
    severity: "major",
    headline: "Above the daily paracetamol ceiling",
    reason:
      "4 g a day is the adult ceiling, and sustained doses above it are hepatotoxic — lower still in low body weight, frailty or regular alcohol use.",
    action: "Consider reducing the strength or the frequency.",
  },
  {
    ingredient: "tramadol",
    maxDailyMg: 400,
    severity: "major",
    headline: "Above the daily tramadol ceiling",
    reason:
      "400 mg a day is the usual adult maximum; above it the seizure risk rises without adding analgesia.",
    action: "Consider reducing the dose or the frequency.",
  },
];
