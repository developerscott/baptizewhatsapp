import "server-only";

/**
 * Mock Baptize The World adapter.
 *
 * Everything Baptize itself would own (churches, baptism reports, approvals)
 * goes through this file. Today each function writes to our own Supabase
 * tables. This is the one place a real Baptize API would plug in later: swap
 * these bodies for API calls and nothing else in the app needs to change.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import type { BaptismReport, Church } from "@/lib/supabase/database.types";

export type ChurchRegistration = {
  churchName: string;
  city: string | null;
  country: string | null;
};

/** Registers a church. New churches wait in `pending_review` until approved. */
export async function registerChurch(
  registration: ChurchRegistration,
): Promise<Church> {
  const { data, error } = await supabaseAdmin()
    .from("churches")
    .insert({
      name: registration.churchName,
      city: registration.city,
      country: registration.country,
      status: "pending_review",
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export type BaptismReportInput = {
  churchId: string;
  waId: string;
  count: number;
  /** YYYY-MM-DD */
  baptismDate: string;
  rawMessage: string | null;
};

/** Records a baptism report. Counts are saved exactly as reported. */
export async function saveBaptismReport(
  report: BaptismReportInput,
): Promise<BaptismReport> {
  const { data, error } = await supabaseAdmin()
    .from("baptism_reports")
    .insert({
      church_id: report.churchId,
      wa_id: report.waId,
      count: report.count,
      baptism_date: report.baptismDate,
      raw_message: report.rawMessage,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export type ApproveResult =
  | { status: "approved"; church: Church }
  | { status: "already_approved"; church: Church }
  | { status: "not_found" };

/**
 * Approves a pending church. Only a `pending_review` row transitions, so a
 * double click can't approve (and notify) twice.
 */
export async function approveChurch(churchId: string): Promise<ApproveResult> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("churches")
    .update({ status: "approved", approved_at: new Date().toISOString() })
    .eq("id", churchId)
    .eq("status", "pending_review")
    .select()
    .maybeSingle();
  if (error) throw error;
  if (data) return { status: "approved", church: data };

  const existing = await db
    .from("churches")
    .select()
    .eq("id", churchId)
    .maybeSingle();
  if (existing.error) throw existing.error;
  return existing.data
    ? { status: "already_approved", church: existing.data }
    : { status: "not_found" };
}
