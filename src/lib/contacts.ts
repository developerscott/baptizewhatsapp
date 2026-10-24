import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import type {
  Contact,
  ContactUpdate,
  Database,
} from "@/lib/supabase/database.types";

type ContactInsert = Database["public"]["Tables"]["contacts"]["Insert"];

export async function getContact(waId: string): Promise<Contact | null> {
  const { data, error } = await supabaseAdmin()
    .from("contacts")
    .select()
    .eq("wa_id", waId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getContactForChurch(
  churchId: string,
): Promise<Contact | null> {
  const { data, error } = await supabaseAdmin()
    .from("contacts")
    .select()
    .eq("church_id", churchId)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function createContact(contact: ContactInsert): Promise<Contact> {
  const { data, error } = await supabaseAdmin()
    .from("contacts")
    .insert(contact)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateContact(
  waId: string,
  patch: ContactUpdate,
): Promise<Contact> {
  const { data, error } = await supabaseAdmin()
    .from("contacts")
    .update(patch)
    .eq("wa_id", waId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Creates the contact if it doesn't exist yet, otherwise updates it. */
export async function saveContact(
  waId: string,
  existing: Contact | null,
  patch: ContactUpdate,
): Promise<Contact> {
  return existing
    ? updateContact(waId, patch)
    : createContact({ ...patch, wa_id: waId });
}
