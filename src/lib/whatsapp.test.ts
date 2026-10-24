import { describe, expect, it } from "vitest";

import { parseWebhook } from "@/lib/whatsapp";

const payload = (value: object) => ({
  object: "whatsapp_business_account",
  entry: [{ id: "1", changes: [{ field: "messages", value }] }],
});

describe("parseWebhook", () => {
  it("reads a text message", () => {
    const body = payload({
      messaging_product: "whatsapp",
      contacts: [{ wa_id: "15550001111", profile: { name: "Test" } }],
      messages: [
        {
          from: "15550001111",
          id: "wamid.A",
          timestamp: "1761300000",
          type: "text",
          text: { body: "14 bautismos" },
        },
      ],
    });
    expect(parseWebhook(body)).toEqual([
      { waId: "15550001111", messageId: "wamid.A", type: "text", text: "14 bautismos" },
    ]);
  });

  it("reads non-text messages with no text", () => {
    const body = payload({
      messages: [{ from: "15550001111", id: "wamid.B", type: "image", image: { id: "x" } }],
    });
    expect(parseWebhook(body)).toEqual([
      { waId: "15550001111", messageId: "wamid.B", type: "image", text: null },
    ]);
  });

  it("ignores delivery and read statuses", () => {
    const body = payload({ statuses: [{ id: "wamid.A", status: "delivered" }] });
    expect(parseWebhook(body)).toEqual([]);
  });

  it("ignores malformed payloads", () => {
    expect(parseWebhook(null)).toEqual([]);
    expect(parseWebhook({ entry: "nope" })).toEqual([]);
  });
});
