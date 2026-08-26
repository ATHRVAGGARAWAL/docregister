import {
  type SttProvider,
  type TranscribeInput,
  type TranscribeResult,
} from "./types";

/**
 * Deterministic offline provider.
 *
 * Exists so the full capture → transcribe → extract → review → commit loop is
 * demoable with no API keys and no network. The samples are real code-mixed
 * dictation shapes — Hindi-English and Punjabi-English in the same breath,
 * and Indian dosage shorthand — because a mock that returns clean English
 * would hide exactly the failure modes this product exists to handle.
 */
const SAMPLES: { text: string; roman: string; lang: string }[] = [
  {
    text: "मरीज़ का नाम राजेश कुमार है, age forty-two, तीन दिन से बुख़ार और throat pain है। Acute pharyngitis लग रहा है। Azithromycin 500 once daily for five days, और Paracetamol 650 SOS.",
    roman:
      "Mareez ka naam Rajesh Kumar hai, age forty-two, teen din se bukhar aur throat pain hai. Acute pharyngitis lag raha hai. Azithromycin 500 once daily for five days, aur Paracetamol 650 SOS.",
    lang: "hi-IN",
  },
  {
    text: "ਮਰੀਜ਼ ਦਾ ਨਾਮ ਸਿਮਰਨ ਕੌਰ ਹੈ, ਉਮਰ ਅਠਾਈ ਸਾਲ। Migraine ਦੀ complaint ਹੈ, ਦੋ ਹਫ਼ਤੇ ਤੋਂ। Naproxen 250 BD ਦਿੱਤਾ ਹੈ ਸੱਤ ਦਿਨ ਲਈ।",
    roman:
      "Mareez da naam Simran Kaur hai, umar athaee saal. Migraine di complaint hai, do hafte ton. Naproxen 250 BD ditta hai satt din layi.",
    lang: "pa-IN",
  },
  {
    text: "Patient Anil Sharma, sixty-five years, known diabetic. Sugar control ठीक नहीं है, fasting one eighty. Metformin 500 1-0-1 continue करो, Telmisartan 40 morning. Follow up दो हफ़्ते में।",
    roman:
      "Patient Anil Sharma, sixty-five years, known diabetic. Sugar control theek nahin hai, fasting one eighty. Metformin 500 1-0-1 continue karo, Telmisartan 40 morning. Follow up do hafte mein.",
    lang: "hi-IN",
  },
];

export class MockSttProvider implements SttProvider {
  readonly name = "mock";
  readonly supportsLive = true;

  async transcribe(input: TranscribeInput): Promise<TranscribeResult> {
    // Deterministic pick so repeated runs in a demo are reproducible.
    const size = input.audio instanceof Blob ? input.audio.size : input.audio.length;
    const sample = SAMPLES[size % SAMPLES.length];

    await new Promise((r) => setTimeout(r, 450)); // make the UI's transcribing state visible

    return {
      text: sample.text,
      romanText: sample.roman,
      detectedLanguage: sample.lang,
      durationMs: input.durationMs ?? 14_000,
      provider: this.name,
      model: "mock-v1",
      confidence: 0.93,
    };
  }
}
