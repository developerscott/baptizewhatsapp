import "server-only";

import { translate } from "@/lib/ai";
import en from "@/lib/templates/en.json";
import es from "@/lib/templates/es.json";
import fr from "@/lib/templates/fr.json";
import pt from "@/lib/templates/pt.json";

type TemplateSet = typeof en;
export type TemplateKey = Exclude<keyof TemplateSet, "fields">;
export type FieldLabel = keyof TemplateSet["fields"];

export const DEFAULT_LANGUAGE = "en";

// `satisfies` makes the compiler check every file has exactly the English keys.
const templates = { en, es, pt, fr } satisfies Record<string, TemplateSet>;

function isTemplateLanguage(
  language: string,
): language is keyof typeof templates {
  return Object.hasOwn(templates, language);
}

export type TemplateVars = {
  name?: string | null;
  church?: string | null;
  count?: number;
  /** ISO date (YYYY-MM-DD); formatted for the reply language. */
  date?: string;
  /** Required fields still missing; rendered as a numbered list. */
  missing?: FieldLabel[];
  resources_link?: string;
};

export type Rendered = {
  body: string;
  language: string;
  translatedByAi: boolean;
};

/** Normalizes a detected language to a lowercase ISO 639 code ("pt-BR" → "pt"). */
export function normalizeLanguage(code: string | null | undefined): string {
  const base = code?.trim().toLowerCase().split(/[-_]/)[0];
  return base && /^[a-z]{2,3}$/.test(base) ? base : DEFAULT_LANGUAGE;
}

export function formatDate(isoDate: string, language: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  const options: Intl.DateTimeFormatOptions = {
    dateStyle: "long",
    timeZone: "UTC",
  };
  try {
    return new Intl.DateTimeFormat(language, options).format(date);
  } catch {
    return new Intl.DateTimeFormat(DEFAULT_LANGUAGE, options).format(date);
  }
}

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.hasOwn(values, key) ? values[key] : match,
  );
}

function fillTemplate(
  set: TemplateSet,
  key: TemplateKey,
  language: string,
  vars: TemplateVars,
): string {
  const values: Record<string, string> = {};
  if (vars.name != null) values.name = vars.name;
  if (vars.church != null) values.church = vars.church;
  if (vars.count != null) values.count = String(vars.count);
  if (vars.date != null) values.date = formatDate(vars.date, language);
  if (vars.resources_link != null) values.resources_link = vars.resources_link;
  if (vars.missing != null) {
    values.missing = vars.missing
      .map((field, i) => `${i + 1}. ${set.fields[field]}`)
      .join("\n");
  }
  return fill(set[key], values);
}

/**
 * Renders a reply in the contact's language. Languages with a human-written
 * template file use it directly; any other language gets the English version
 * translated by AI (falling back to English if translation fails).
 */
export async function render(
  key: TemplateKey,
  language: string | null | undefined,
  vars: TemplateVars = {},
): Promise<Rendered> {
  const lang = normalizeLanguage(language);

  if (isTemplateLanguage(lang)) {
    return {
      body: fillTemplate(templates[lang], key, lang, vars),
      language: lang,
      translatedByAi: false,
    };
  }

  const english = fillTemplate(en, key, lang, vars);
  const translated = await translate(english, lang);
  return translated
    ? { body: translated, language: lang, translatedByAi: true }
    : { body: english, language: DEFAULT_LANGUAGE, translatedByAi: false };
}
