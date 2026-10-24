import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";

const UNIQUE_VIOLATION = "23505";

/**
 * Logs an inbound message. Returns false if Meta already delivered this
 * message id (a webhook retry), in which case it must not be processed again.
 */
export async function logInbound(message: {
  messageId: string;
  waId: string;
  body: string;
}): Promise<boolean> {
  const { error } = await supabaseAdmin().from("messages").insert({
    wa_message_id: message.messageId,
    wa_id: message.waId,
    direction: "in",
    body: message.body,
  });
  if (error?.code === UNIQUE_VIOLATION) return false;
  if (error) throw error;
  return true;
}

export async function setInboundLanguage(
  messageId: string,
  language: string,
): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("messages")
    .update({ language })
    .eq("wa_message_id", messageId);
  if (error) console.error("setInboundLanguage failed", error);
}

export async function logOutbound(message: {
  waId: string;
  body: string;
  language: string | null;
  translatedByAi: boolean;
}): Promise<void> {
  const { error } = await supabaseAdmin().from("messages").insert({
    wa_id: message.waId,
    direction: "out",
    body: message.body,
    language: message.language,
    translated_by_ai: message.translatedByAi,
  });
  if (error) console.error("logOutbound failed", error);
}
