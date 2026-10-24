import "server-only";

import {
  extract,
  REGISTRATION_FIELDS,
  type ExtractContext,
  type Extraction,
} from "@/lib/ai";
import { registerChurch, saveBaptismReport } from "@/lib/baptize";
import { createContact, getContact, saveContact, updateContact } from "@/lib/contacts";
import { todayISO } from "@/lib/dates";
import {
  DEFAULT_LANGUAGE,
  normalizeLanguage,
  type FieldLabel,
  type TemplateKey,
  type TemplateVars,
} from "@/lib/i18n";
import { logInbound, setInboundLanguage } from "@/lib/messages";
import type { Contact, ContactUpdate } from "@/lib/supabase/database.types";
import { sendTemplate, type InboundMessage } from "@/lib/whatsapp";

// Keyword → the language it implies, used when the contact has none stored yet.
const STOP_WORDS = new Map([
  ["stop", "en"],
  ["parar", "es"],
  ["pare", "pt"],
  ["arret", "fr"],
  ["arrêt", "fr"],
]);
const START_WORDS = new Set(["start", "iniciar", "começar", "commencer"]);

/** Trims, lowercases and strips surrounding punctuation ("Stop!" → "stop"). */
function keyword(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/^[\p{P}\p{S}\s]+|[\p{P}\p{S}\s]+$/gu, "");
}

/** Required registration fields still empty, as reply labels. */
export function missingFields(contact: Partial<Contact>): FieldLabel[] {
  const missing: FieldLabel[] = [];
  if (!contact.name) missing.push("name");
  if (!contact.role) missing.push("role");
  if (!contact.church_name) missing.push("church_name");
  // City and country share one label but are stored separately.
  if (!contact.city || !contact.country) missing.push("location");
  if (!contact.consent_at) missing.push("consent");
  return missing;
}

function hasRegistrationDetails(contact: Contact | null): boolean {
  return Boolean(
    contact &&
      (REGISTRATION_FIELDS.some((field) => contact[field]) || contact.consent_at),
  );
}

function extractContext(contact: Contact | null): ExtractContext {
  const known: ExtractContext["known"] = {};
  for (const field of REGISTRATION_FIELDS) {
    const value = contact?.[field];
    if (value) known[field] = value;
  }
  if (contact?.consent_at) known.consent = true;
  return {
    state: contact?.state ?? "new",
    language: contact?.language ?? null,
    known,
    today: todayISO(),
  };
}

/** Non-null extracted fields as a contact patch; new values overwrite old. */
function registrationPatch(
  extraction: Extraction,
  contact: Contact | null,
): ContactUpdate {
  const patch: ContactUpdate = {};
  for (const field of REGISTRATION_FIELDS) {
    const value = extraction.fields[field];
    if (value) patch[field] = value;
  }
  if (extraction.fields.consent === true && !contact?.consent_at) {
    patch.consent_at = new Date().toISOString();
  }
  return patch;
}

/**
 * Handles one inbound WhatsApp message. The checks run in order and stop at
 * the first that applies. AI only extracts; this code decides what to save
 * and what to send.
 */
export async function handleInbound(message: InboundMessage): Promise<void> {
  const { waId, messageId } = message;
  const text = message.type === "text" ? (message.text?.trim() ?? "") : null;

  // 1. Duplicate delivery: Meta retries webhooks, so drop ids we've seen.
  const isNew = await logInbound({
    messageId,
    waId,
    body: text ?? `[${message.type}]`,
  });
  if (!isNew) return;

  let contact = await getContact(waId);
  const reply = (key: TemplateKey, vars?: TemplateVars) =>
    sendTemplate(waId, contact?.language ?? DEFAULT_LANGUAGE, key, vars);

  // 2. STOP opts the contact out, whatever state they are in.
  const stopLanguage = text ? STOP_WORDS.get(keyword(text)) : undefined;
  if (stopLanguage) {
    contact = await saveContact(waId, contact, {
      opted_out_at: new Date().toISOString(),
      state: "opted_out",
      language: contact?.language ?? stopLanguage,
    });
    await reply("stopped");
    return;
  }

  // 3. Opted out: only a start word gets a response.
  if (contact?.state === "opted_out") {
    if (text && START_WORDS.has(keyword(text))) {
      contact = await updateContact(waId, {
        opted_out_at: null,
        state: contact.church_id ? "registered" : "collecting",
        pending_count: null,
      });
      await reply("welcome_back");
    }
    return;
  }

  // 4. Photos, audio, stickers, ...: ask for text.
  if (text === null) {
    await reply("send_as_text");
    return;
  }

  // 5. Extract.
  const extraction = await extract(text, extractContext(contact));
  const detected = extraction.language
    ? normalizeLanguage(extraction.language)
    : null;
  if (detected) await setInboundLanguage(messageId, detected);
  if (contact && !contact.language && detected) {
    contact = await updateContact(waId, { language: detected });
  }
  const language = contact?.language ?? detected ?? DEFAULT_LANGUAGE;

  // 6. Waiting for the date of a count we already have.
  if (
    contact?.state === "awaiting_report_date" &&
    contact.church_id &&
    contact.pending_count != null
  ) {
    if (extraction.baptism_date) {
      await saveBaptismReport({
        churchId: contact.church_id,
        waId,
        count: contact.pending_count,
        baptismDate: extraction.baptism_date,
        rawMessage: text,
      });
      await updateContact(waId, { pending_count: null, state: "registered" });
      await reply("report_saved", {
        count: contact.pending_count,
        church: contact.church_name,
        date: extraction.baptism_date,
      });
    } else {
      await reply("report_date_question", { count: contact.pending_count });
    }
    return;
  }

  // 7. Registered contact reporting baptisms.
  if (contact?.church_id) {
    const { count, baptism_date: date } = extraction;
    if (count != null && date) {
      await saveBaptismReport({
        churchId: contact.church_id,
        waId,
        count,
        baptismDate: date,
        rawMessage: text,
      });
      if (contact.state !== "registered") {
        await updateContact(waId, { state: "registered", pending_count: null });
      }
      await reply("report_saved", { count, church: contact.church_name, date });
    } else if (count != null) {
      await updateContact(waId, {
        pending_count: count,
        state: "awaiting_report_date",
      });
      await reply("report_date_question", { count });
    } else if (extraction.intent === "report") {
      await reply("ask_for_number");
    } else {
      await reply("help_registered");
    }
    return;
  }

  // 8. Unknown number sending a count: tell them to register, save nothing.
  if (!contact && extraction.count != null) {
    contact = await createContact({ wa_id: waId, language, state: "collecting" });
    await reply("not_registered");
    return;
  }

  // 9. Registering (new contact or `collecting`).
  const hadDetails = hasRegistrationDetails(contact);
  const patch = registrationPatch(extraction, contact);
  const extractedSomething = Object.keys(patch).length > 0;

  if (!contact || extractedSomething) {
    contact = await saveContact(waId, contact, {
      ...patch,
      language,
      state: "collecting",
    });
  }

  if (!extractedSomething && !hadDetails) {
    await reply("welcome_fields");
    return;
  }

  const missing = missingFields(contact);
  if (missing.length > 0) {
    await reply("missing_fields", { missing });
    return;
  }

  const church = await registerChurch({
    churchName: contact.church_name!,
    city: contact.city,
    country: contact.country,
  });
  contact = await updateContact(waId, {
    church_id: church.id,
    state: "registered",
  });
  await reply("submitted_thanks", {
    name: contact.name,
    church: church.name,
  });
}
