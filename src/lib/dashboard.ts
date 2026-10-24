import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import type { ChurchStatus } from "@/lib/supabase/database.types";

export type DashboardChurch = {
  id: string;
  name: string;
  city: string | null;
  country: string | null;
  status: ChurchStatus;
  createdAt: string;
  contact: { name: string | null; role: string | null; language: string | null } | null;
};

export type DashboardReport = {
  id: string;
  churchName: string;
  count: number;
  baptismDate: string;
  createdAt: string;
};

export type DashboardData = {
  totalBaptisms: number;
  churchCount: number;
  churches: DashboardChurch[];
  reports: DashboardReport[];
};

const RECENT_REPORTS = 50;

/**
 * Reads everything the dashboard shows. Runs on the server with the service
 * role, so contact details never need to be publicly readable.
 */
export async function getDashboardData(): Promise<DashboardData> {
  const db = supabaseAdmin();
  const [totals, churches, reports] = await Promise.all([
    db.from("dashboard_totals").select().single(),
    db
      .from("churches")
      .select("id, name, city, country, status, created_at, contacts(name, role, language)")
      .order("created_at", { ascending: false }),
    db
      .from("baptism_reports")
      .select("id, count, baptism_date, created_at, churches(name)")
      .order("created_at", { ascending: false })
      .limit(RECENT_REPORTS),
  ]);
  if (totals.error) throw totals.error;
  if (churches.error) throw churches.error;
  if (reports.error) throw reports.error;

  return {
    totalBaptisms: totals.data.total_baptisms,
    churchCount: totals.data.church_count,
    churches: churches.data.map((church) => ({
      id: church.id,
      name: church.name,
      city: church.city,
      country: church.country,
      status: church.status,
      createdAt: church.created_at,
      contact: church.contacts[0] ?? null,
    })),
    reports: reports.data.map((report) => ({
      id: report.id,
      churchName: report.churches.name,
      count: report.count,
      baptismDate: report.baptism_date,
      createdAt: report.created_at,
    })),
  };
}
