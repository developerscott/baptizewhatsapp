// Runs the real extraction prompt against Claude. Skipped unless LIVE=1:
//   npm run test:live
import { describe, expect, it } from "vitest";

import { extract, translate, type ExtractContext } from "@/lib/ai";

const TODAY = "2026-10-24";
const newContact: ExtractContext = { state: "new", language: null, known: {}, today: TODAY };
const registered: ExtractContext = {
  state: "registered",
  language: "es",
  known: { name: "Ana", role: "Pastora", church_name: "Iglesia Esperanza", city: "Lima", country: "Perú" },
  today: TODAY,
};

describe.skipIf(!process.env.LIVE)("extract (live)", { timeout: 30_000 }, () => {
  it("1: Spanish registration request with no details", async () => {
    const result = await extract("hola quiero registrar mi iglesia", newContact);
    expect(result).toMatchObject({ language: "es", intent: "register" });
    expect(Object.values(result.fields).every((value) => value === null)).toBe(true);
  });

  it("2: Portuguese partial registration", async () => {
    const result = await extract("Oi! Somos da Igreja Fonte de Vida, Recife. Pastor João.", newContact);
    expect(result.language).toBe("pt");
    expect(result.fields).toMatchObject({
      name: "João",
      church_name: expect.stringContaining("Fonte de Vida"),
      city: "Recife",
      role: null,
      country: null,
      consent: null,
    });
  });

  it("3: count without a date", async () => {
    const result = await extract("14 bautismos", registered);
    expect(result).toMatchObject({ count: 14, baptism_date: null });
  });

  it("3: 'hoy' resolves to today", async () => {
    const result = await extract("hoy", { ...registered, state: "awaiting_report_date" });
    expect(result.baptism_date).toBe(TODAY);
  });

  it("4: number words", async () => {
    const result = await extract("nove", { ...registered, language: "pt" });
    expect(result.count).toBe(9);
  });

  it("6: a report with no number", async () => {
    const result = await extract("muchos!!! gloria a Dios 🙌", registered);
    expect(result).toMatchObject({ intent: "report", count: null });
  });

  it("7: count from an unknown number", async () => {
    const result = await extract("baptisms 30", newContact);
    expect(result).toMatchObject({ language: "en", count: 30 });
  });

  it("a question fills no fields", async () => {
    const result = await extract("¿Necesito dar mi correo electrónico?", {
      ...newContact,
      state: "collecting",
      language: "es",
    });
    expect(result.intent).toBe("question");
    expect(Object.values(result.fields).every((value) => value === null)).toBe(true);
  });

  it("completes a registration from a bare reply", async () => {
    const result = await extract("Pastor principal, Brasil, SIM", {
      state: "collecting",
      language: "pt",
      known: { name: "João", church_name: "Igreja Fonte de Vida", city: "Recife" },
      today: TODAY,
    });
    expect(result.fields).toMatchObject({ country: "Brasil", consent: true });
    expect(result.fields.role).toMatch(/pastor/i);
  });

  it("9: detects Quechua and translates a reply into it", async () => {
    const result = await extract("Allillanchu, iglesiaykuta qillqachiyta munani", newContact);
    expect(result.language).toBe("qu");

    const translated = await translate(
      "Please send your answer as a text message. Reply STOP anytime to stop messages.",
      "qu",
    );
    expect(translated).toBeTruthy();
    expect(translated).toContain("STOP");
  });
});
