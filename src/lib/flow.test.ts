import { beforeEach, describe, expect, it, vi } from "vitest";

import { EMPTY_EXTRACTION, extract, type Extraction } from "@/lib/ai";
import { registerChurch, saveBaptismReport } from "@/lib/baptize";
import { handleInbound } from "@/lib/flow";
import type { Contact } from "@/lib/supabase/database.types";
import { sendTemplate, type InboundMessage } from "@/lib/whatsapp";

// In-memory stand-ins for the database-backed modules.
const db = vi.hoisted(() => ({
  contacts: new Map<string, Contact>(),
  messageIds: new Set<string>(),
  reports: [] as { churchId: string; count: number; baptismDate: string }[],
}));

vi.mock("@/lib/ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai")>()),
  extract: vi.fn(),
}));

vi.mock("@/lib/whatsapp", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/whatsapp")>()),
  sendTemplate: vi.fn(async () => true),
}));

vi.mock("@/lib/messages", () => ({
  logInbound: vi.fn(async ({ messageId }: { messageId: string }) => {
    if (db.messageIds.has(messageId)) return false;
    db.messageIds.add(messageId);
    return true;
  }),
  setInboundLanguage: vi.fn(async () => {}),
}));

vi.mock("@/lib/contacts", () => {
  const blank = (waId: string): Contact => ({
    wa_id: waId,
    name: null,
    role: null,
    email: null,
    church_name: null,
    city: null,
    country: null,
    language: null,
    consent_at: null,
    opted_out_at: null,
    state: "collecting",
    pending_count: null,
    church_id: null,
    created_at: new Date().toISOString(),
  });
  const createContact = vi.fn(async (insert: Partial<Contact> & { wa_id: string }) => {
    const contact = { ...blank(insert.wa_id), ...insert };
    db.contacts.set(contact.wa_id, contact);
    return contact;
  });
  const updateContact = vi.fn(async (waId: string, patch: Partial<Contact>) => {
    const contact = { ...db.contacts.get(waId)!, ...patch };
    db.contacts.set(waId, contact);
    return contact;
  });
  return {
    getContact: vi.fn(async (waId: string) => db.contacts.get(waId) ?? null),
    createContact,
    updateContact,
    saveContact: vi.fn(async (waId: string, existing: Contact | null, patch: Partial<Contact>) =>
      existing ? updateContact(waId, patch) : createContact({ ...patch, wa_id: waId }),
    ),
  };
});

vi.mock("@/lib/baptize", () => ({
  registerChurch: vi.fn(async ({ churchName }: { churchName: string }) => ({
    id: "church-1",
    name: churchName,
  })),
  saveBaptismReport: vi.fn(
    async (report: { churchId: string; count: number; baptismDate: string }) => {
      db.reports.push(report);
      return report;
    },
  ),
}));

const WA_ID = "15550001111";
let nextId = 0;

function text(body: string): InboundMessage {
  return { waId: WA_ID, messageId: `wamid.${nextId++}`, type: "text", text: body };
}

function extracted(partial: Omit<Partial<Extraction>, "fields"> & {
  fields?: Partial<Extraction["fields"]>;
}): Extraction {
  return {
    ...EMPTY_EXTRACTION,
    ...partial,
    fields: { ...EMPTY_EXTRACTION.fields, ...partial.fields },
  };
}

function seedRegistered(overrides: Partial<Contact> = {}) {
  db.contacts.set(WA_ID, {
    wa_id: WA_ID,
    name: "Ana",
    role: "Pastor",
    email: null,
    church_name: "Iglesia Esperanza",
    city: "Lima",
    country: "Peru",
    language: "es",
    consent_at: "2026-10-24T10:00:00Z",
    opted_out_at: null,
    state: "registered",
    pending_count: null,
    church_id: "church-1",
    created_at: "2026-10-24T10:00:00Z",
    ...overrides,
  });
}

const sent = () => vi.mocked(sendTemplate).mock.calls.map(([, language, key, vars]) => ({ language, key, vars }));
const contact = () => db.contacts.get(WA_ID)!;

beforeEach(() => {
  db.contacts.clear();
  db.messageIds.clear();
  db.reports.length = 0;
  vi.clearAllMocks();
});

describe("registration", () => {
  it("1: greets a new contact with the full field list in their language", async () => {
    vi.mocked(extract).mockResolvedValue(extracted({ language: "es", intent: "register" }));

    await handleInbound(text("hola quiero registrar mi iglesia"));

    expect(sent()).toEqual([{ language: "es", key: "welcome_fields", vars: undefined }]);
    expect(contact()).toMatchObject({ state: "collecting", language: "es" });
  });

  it("2: saves what was given and asks only for what is missing", async () => {
    vi.mocked(extract).mockResolvedValue(
      extracted({
        language: "pt",
        intent: "register",
        fields: { name: "João", church_name: "Igreja Fonte de Vida", city: "Recife" },
      }),
    );

    await handleInbound(text("Oi! Somos da Igreja Fonte de Vida, Recife. Pastor João."));

    expect(contact()).toMatchObject({
      name: "João",
      church_name: "Igreja Fonte de Vida",
      city: "Recife",
      language: "pt",
    });
    expect(sent()).toEqual([
      { language: "pt", key: "missing_fields", vars: { missing: ["role", "location", "consent"] } },
    ]);
  });

  it("submits the church once every required field is in", async () => {
    vi.mocked(extract)
      .mockResolvedValueOnce(
        extracted({
          language: "pt",
          intent: "register",
          fields: { name: "João", church_name: "Igreja Fonte de Vida", city: "Recife" },
        }),
      )
      .mockResolvedValueOnce(
        extracted({
          language: "pt",
          intent: "register",
          fields: { role: "Pastor", country: "Brasil", consent: true },
        }),
      );

    await handleInbound(text("Oi! Somos da Igreja Fonte de Vida, Recife. Pastor João."));
    await handleInbound(text("Sou o pastor, Brasil, SIM"));

    expect(registerChurch).toHaveBeenCalledWith({
      churchName: "Igreja Fonte de Vida",
      city: "Recife",
      country: "Brasil",
    });
    expect(contact()).toMatchObject({ state: "registered", church_id: "church-1" });
    expect(contact().consent_at).not.toBeNull();
    expect(sent().at(-1)).toEqual({
      language: "pt",
      key: "submitted_thanks",
      vars: { name: "João", church: "Igreja Fonte de Vida" },
    });
  });

  it("lets a later value overwrite an earlier one", async () => {
    db.contacts.set(WA_ID, { ...contactShell(), name: "Jon", language: "en" });
    vi.mocked(extract).mockResolvedValue(extracted({ language: "en", fields: { name: "John" } }));

    await handleInbound(text("Sorry, my name is John"));

    expect(contact().name).toBe("John");
  });
});

describe("baptism reports", () => {
  it("3: asks for the date, then saves the count", async () => {
    seedRegistered();
    vi.mocked(extract)
      .mockResolvedValueOnce(extracted({ language: "es", intent: "report", count: 14 }))
      .mockResolvedValueOnce(extracted({ language: "es", baptism_date: "2026-10-24" }));

    await handleInbound(text("14 bautismos"));
    expect(contact()).toMatchObject({ state: "awaiting_report_date", pending_count: 14 });
    expect(sent()).toEqual([{ language: "es", key: "report_date_question", vars: { count: 14 } }]);

    await handleInbound(text("hoy"));
    expect(saveBaptismReport).toHaveBeenCalledWith(
      expect.objectContaining({ churchId: "church-1", count: 14, baptismDate: "2026-10-24" }),
    );
    expect(contact()).toMatchObject({ state: "registered", pending_count: null });
    expect(sent().at(-1)).toEqual({
      language: "es",
      key: "report_saved",
      vars: { count: 14, church: "Iglesia Esperanza", date: "2026-10-24" },
    });
  });

  it("asks for the date again when the reply has none", async () => {
    seedRegistered({ state: "awaiting_report_date", pending_count: 9 });
    vi.mocked(extract).mockResolvedValue(extracted({ language: "es" }));

    await handleInbound(text("no sé"));

    expect(saveBaptismReport).not.toHaveBeenCalled();
    expect(sent()).toEqual([{ language: "es", key: "report_date_question", vars: { count: 9 } }]);
  });

  it("saves straight away when count and date arrive together", async () => {
    seedRegistered();
    vi.mocked(extract).mockResolvedValue(
      extracted({ language: "es", intent: "report", count: 5, baptism_date: "2026-10-20" }),
    );

    await handleInbound(text("5 bautismos el lunes"));

    expect(db.reports).toEqual([
      expect.objectContaining({ count: 5, baptismDate: "2026-10-20" }),
    ]);
    expect(sent()[0].key).toBe("report_saved");
  });

  it("6: asks for a number when the report has none", async () => {
    seedRegistered();
    vi.mocked(extract).mockResolvedValue(extracted({ language: "es", intent: "report" }));

    await handleInbound(text("muchos!!! gloria a Dios 🙌"));

    expect(sent()).toEqual([{ language: "es", key: "ask_for_number", vars: undefined }]);
  });

  it("explains how to report for anything else", async () => {
    seedRegistered();
    vi.mocked(extract).mockResolvedValue(extracted({ language: "es", intent: "question" }));

    await handleInbound(text("¿cómo funciona esto?"));

    expect(sent()[0].key).toBe("help_registered");
  });

  it("7: tells an unknown number with a count to register and saves nothing", async () => {
    vi.mocked(extract).mockResolvedValue(extracted({ language: "en", intent: "report", count: 30 }));

    await handleInbound(text("baptisms 30"));

    expect(sent()).toEqual([{ language: "en", key: "not_registered", vars: undefined }]);
    expect(saveBaptismReport).not.toHaveBeenCalled();
    expect(contact()).toMatchObject({ state: "collecting", church_id: null });
  });

  it("starts registration when that contact then replies REGISTER", async () => {
    vi.mocked(extract)
      .mockResolvedValueOnce(extracted({ language: "en", intent: "report", count: 30 }))
      .mockResolvedValueOnce(extracted({ language: "en", intent: "register" }));

    await handleInbound(text("baptisms 30"));
    await handleInbound(text("REGISTER"));

    expect(sent().at(-1)?.key).toBe("welcome_fields");
  });
});

describe("opt-out", () => {
  it("8: STOP opts out, and later messages get no reply", async () => {
    seedRegistered();

    await handleInbound(text("STOP"));
    expect(contact().state).toBe("opted_out");
    expect(contact().opted_out_at).not.toBeNull();
    expect(sent()).toEqual([{ language: "es", key: "stopped", vars: undefined }]);

    await handleInbound(text("14 bautismos"));
    expect(sendTemplate).toHaveBeenCalledTimes(1);
    expect(extract).not.toHaveBeenCalled();
  });

  it("recognizes stop words in other languages and punctuation", async () => {
    await handleInbound(text(" Arrêt! "));

    expect(contact()).toMatchObject({ state: "opted_out", language: "fr" });
    expect(sent()[0].key).toBe("stopped");
  });

  it("START opts back in to the right state", async () => {
    seedRegistered({ state: "opted_out", opted_out_at: "2026-10-24T11:00:00Z" });

    await handleInbound(text("iniciar"));

    expect(contact()).toMatchObject({ state: "registered", opted_out_at: null });
    expect(sent()).toEqual([{ language: "es", key: "welcome_back", vars: undefined }]);
  });
});

describe("other messages", () => {
  it("9: replies in a language without templates", async () => {
    vi.mocked(extract).mockResolvedValue(extracted({ language: "qu", intent: "register" }));

    await handleInbound(text("Allillanchu, iglesiaytam qillqachiyta munani"));

    expect(sent()).toEqual([{ language: "qu", key: "welcome_fields", vars: undefined }]);
  });

  it("10: asks for text when sent a photo", async () => {
    seedRegistered();

    await handleInbound({ waId: WA_ID, messageId: "wamid.photo", type: "image", text: null });

    expect(sent()).toEqual([{ language: "es", key: "send_as_text", vars: undefined }]);
    expect(extract).not.toHaveBeenCalled();
  });

  it("drops a message id it has already processed", async () => {
    seedRegistered();
    vi.mocked(extract).mockResolvedValue(extracted({ language: "es", intent: "report" }));
    const message = text("muchos");

    await handleInbound(message);
    await handleInbound(message);

    expect(sendTemplate).toHaveBeenCalledTimes(1);
  });
});

function contactShell(): Contact {
  return {
    wa_id: WA_ID,
    name: null,
    role: null,
    email: null,
    church_name: null,
    city: null,
    country: null,
    language: null,
    consent_at: null,
    opted_out_at: null,
    state: "collecting",
    pending_count: null,
    church_id: null,
    created_at: "2026-10-24T10:00:00Z",
  };
}
