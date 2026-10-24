"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { approveChurch } from "@/lib/baptize";
import { getContactForChurch } from "@/lib/contacts";
import { requireEnv } from "@/lib/env";
import { sendTemplate } from "@/lib/whatsapp";

export type ApproveResponse =
  | { ok: true; notified: boolean }
  | { ok: false; error: string };

/**
 * Approves a church and sends the `approved` message to its contact.
 *
 * No auth: the V1 demo dashboard shows test data only (see README). Add an
 * auth check here before this runs against real data.
 */
export async function approve(churchId: string): Promise<ApproveResponse> {
  const id = z.uuid().safeParse(churchId);
  if (!id.success) return { ok: false, error: "Invalid church id" };

  const resourcesLink = requireEnv("RESOURCES_LINK");
  const result = await approveChurch(id.data);
  if (result.status === "not_found") {
    return { ok: false, error: "Church not found" };
  }

  refresh();
  if (result.status === "already_approved") return { ok: true, notified: false };

  const contact = await getContactForChurch(result.church.id);
  if (!contact || contact.opted_out_at) return { ok: true, notified: false };

  const notified = await sendTemplate(contact.wa_id, contact.language, "approved", {
    name: contact.name,
    church: result.church.name,
    resources_link: resourcesLink,
  });
  return { ok: true, notified };
}
