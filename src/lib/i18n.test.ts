import { beforeEach, describe, expect, it, vi } from "vitest";

import { translate } from "@/lib/ai";
import { formatDate, normalizeLanguage, render } from "@/lib/i18n";
import en from "@/lib/templates/en.json";
import es from "@/lib/templates/es.json";
import fr from "@/lib/templates/fr.json";
import pt from "@/lib/templates/pt.json";

vi.mock("@/lib/ai", () => ({ translate: vi.fn() }));

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("template files", () => {
  const sets = { es, pt, fr };

  it.each(Object.entries(sets))("%s uses the same placeholders as English", (_, set) => {
    for (const [key, english] of Object.entries(en)) {
      if (typeof english !== "string") continue;
      expect(placeholders(set[key as keyof typeof set] as string), key).toEqual(
        placeholders(english),
      );
    }
  });
});

describe("normalizeLanguage", () => {
  it.each([
    ["pt-BR", "pt"],
    ["ES", "es"],
    ["qu", "qu"],
    ["", "en"],
    [null, "en"],
    ["not a language", "en"],
  ])("%s → %s", (input, expected) => {
    expect(normalizeLanguage(input)).toBe(expected);
  });
});

describe("render", () => {
  beforeEach(() => vi.mocked(translate).mockReset());

  it("fills a human-written template", async () => {
    const result = await render("report_saved", "es", {
      count: 14,
      church: "Iglesia Esperanza",
      date: "2026-10-24",
    });
    expect(result).toEqual({
      body: "¡Gloria a Dios! Registramos 14 bautismos para Iglesia Esperanza el 24 de octubre de 2026.",
      language: "es",
      translatedByAi: false,
    });
    expect(translate).not.toHaveBeenCalled();
  });

  it("builds a numbered missing-fields list in the reply language", async () => {
    const result = await render("missing_fields", "pt", {
      missing: ["role", "location", "consent"],
    });
    expect(result.body).toBe(
      "Obrigado! Ainda precisamos de:\n1. Sua função na igreja\n2. Cidade e país\n3. SIM para concordar que podemos enviar mensagens e guardar esses dados",
    );
  });

  it("translates English for languages without a template", async () => {
    vi.mocked(translate).mockResolvedValue("Quechua text");
    const result = await render("ask_for_number", "qu");
    expect(translate).toHaveBeenCalledWith(en.ask_for_number, "qu");
    expect(result).toEqual({ body: "Quechua text", language: "qu", translatedByAi: true });
  });

  it("falls back to English when translation fails", async () => {
    vi.mocked(translate).mockResolvedValue(null);
    const result = await render("send_as_text", "qu");
    expect(result).toEqual({ body: en.send_as_text, language: "en", translatedByAi: false });
  });
});

describe("formatDate", () => {
  it("formats per language without shifting the day", () => {
    expect(formatDate("2026-10-24", "en")).toBe("October 24, 2026");
    expect(formatDate("2026-10-24", "fr")).toBe("24 octobre 2026");
  });
});
