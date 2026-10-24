import "server-only";

import { z } from "zod";

import { requireEnv } from "@/lib/env";
import { render, type TemplateKey, type TemplateVars } from "@/lib/i18n";
import { logOutbound } from "@/lib/messages";

export type InboundMessage = {
  /** WhatsApp id of the sender: phone digits, no "+". */
  waId: string;
  /** Meta's message id, used to drop webhook retries. */
  messageId: string;
  /** "text", "image", "audio", "sticker", ... */
  type: string;
  text: string | null;
};

const WebhookPayload = z.object({
  entry: z
    .array(
      z.object({
        changes: z
          .array(
            z.object({
              value: z
                .object({
                  messages: z
                    .array(
                      z.object({
                        from: z.string(),
                        id: z.string(),
                        type: z.string(),
                        text: z.object({ body: z.string() }).optional(),
                      }),
                    )
                    .optional(),
                })
                .optional(),
            }),
          )
          .default([]),
      }),
    )
    .default([]),
});

/**
 * Pulls every inbound message out of a Meta webhook payload. Delivery and
 * read status callbacks carry no `messages` and yield an empty list.
 */
export function parseWebhook(payload: unknown): InboundMessage[] {
  const parsed = WebhookPayload.safeParse(payload);
  if (!parsed.success) return [];

  return parsed.data.entry.flatMap((entry) =>
    entry.changes.flatMap((change) =>
      (change.value?.messages ?? []).map((message) => ({
        waId: message.from,
        messageId: message.id,
        type: message.type,
        text: message.text?.body ?? null,
      })),
    ),
  );
}

type SendMeta = { language: string | null; translatedByAi: boolean };

/**
 * Sends a free-form text message through the WhatsApp Cloud API and logs it.
 * Free-form messages only deliver within 24 hours of the contact's last
 * inbound message. Returns whether Meta accepted the message.
 */
export async function sendText(
  to: string,
  body: string,
  meta: SendMeta = { language: null, translatedByAi: false },
): Promise<boolean> {
  const url = `https://graph.facebook.com/${requireEnv("WHATSAPP_GRAPH_VERSION")}/${requireEnv("WHATSAPP_PHONE_NUMBER_ID")}/messages`;

  let ok = false;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${requireEnv("WHATSAPP_TOKEN")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: { body, preview_url: true },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    ok = res.ok;
    if (!res.ok) {
      console.error("WhatsApp send failed", res.status, await res.text());
    }
  } catch (error) {
    console.error("WhatsApp send failed", error);
  }

  await logOutbound({ waId: to, body, ...meta });
  return ok;
}

/** Renders a template in the given language and sends it. */
export async function sendTemplate(
  to: string,
  language: string | null,
  key: TemplateKey,
  vars?: TemplateVars,
): Promise<boolean> {
  const { body, ...meta } = await render(key, language, vars);
  return sendText(to, body, meta);
}
