import { after, type NextRequest } from "next/server";

import { handleInbound } from "@/lib/flow";
import { parseWebhook } from "@/lib/whatsapp";

// Covers the AI call and replies, which run after the response is sent.
export const maxDuration = 60;

/** Meta's webhook verification handshake. */
export function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

  if (
    verifyToken &&
    params.get("hub.mode") === "subscribe" &&
    params.get("hub.verify_token") === verifyToken
  ) {
    return new Response(params.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

/**
 * Incoming messages. Meta retries any webhook that isn't answered with a 200
 * quickly, so acknowledge immediately and process the messages after the
 * response has been sent.
 */
export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  const messages = parseWebhook(payload);
  if (messages.length > 0) {
    after(async () => {
      for (const message of messages) {
        try {
          await handleInbound(message);
        } catch (error) {
          console.error("handleInbound failed", message.messageId, error);
        }
      }
    });
  }

  return new Response("ok", { status: 200 });
}
