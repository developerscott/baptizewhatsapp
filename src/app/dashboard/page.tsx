import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense, type ReactNode } from "react";

import {
  getDashboardData,
  type DashboardChurch,
  type DashboardReport,
} from "@/lib/dashboard";
import { ChurchStatus } from "./church-status";
import { LiveUpdates } from "./live-updates";

export const metadata: Metadata = {
  title: "Dashboard · Baptism In Your Pocket",
};

export default function DashboardPage() {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-4 py-6 sm:px-8 sm:py-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-sky-700">
            Baptize The World
          </p>
          <h1 className="text-3xl font-bold text-slate-900 sm:text-4xl">
            Baptism In Your Pocket
          </h1>
        </div>
        <LiveUpdates />
      </header>

      <Suspense fallback={<DashboardSkeleton />}>
        <Dashboard />
      </Suspense>
    </main>
  );
}

async function Dashboard() {
  await connection();
  const data = await getDashboardData();
  const timeZone = process.env.APP_TIME_ZONE || "UTC";

  return (
    <>
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Stat label="Baptisms reported" value={data.totalBaptisms} />
        <Stat label="Churches registered" value={data.churchCount} />
      </section>

      <Panel title="Churches">
        {data.churches.length === 0 ? (
          <Empty>No churches yet. Text the WhatsApp number to register one.</Empty>
        ) : (
          <ChurchesTable churches={data.churches} timeZone={timeZone} />
        )}
      </Panel>

      <Panel title="Recent reports">
        {data.reports.length === 0 ? (
          <Empty>No baptisms reported yet.</Empty>
        ) : (
          <ReportsTable reports={data.reports} timeZone={timeZone} />
        )}
      </Panel>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-8">
      <p className="text-base font-medium text-slate-600 sm:text-lg">{label}</p>
      <p className="mt-2 text-6xl font-bold tabular-nums text-slate-900 sm:text-8xl">
        {value.toLocaleString("en-US")}
      </p>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
      <h2 className="border-b border-slate-200 px-6 py-4 text-xl font-semibold text-slate-900">
        {title}
      </h2>
      <div className="overflow-x-auto">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="px-6 py-10 text-center text-slate-500">{children}</p>;
}

const th = "px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500";
const td = "px-6 py-4 align-top";

function ChurchesTable({
  churches,
  timeZone,
}: {
  churches: DashboardChurch[];
  timeZone: string;
}) {
  return (
    <table className="min-w-full divide-y divide-slate-200 text-base">
      <thead className="bg-slate-50">
        <tr>
          <th className={th}>Church</th>
          <th className={th}>Contact</th>
          <th className={th}>Language</th>
          <th className={th}>Registered</th>
          <th className={th}>Status</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {churches.map((church) => (
          <tr key={church.id}>
            <td className={td}>
              <p className="font-semibold text-slate-900">{church.name}</p>
              <p className="text-sm text-slate-500">
                {[church.city, church.country].filter(Boolean).join(", ")}
              </p>
            </td>
            <td className={td}>
              <p className="text-slate-900">{church.contact?.name ?? "—"}</p>
              <p className="text-sm text-slate-500">{church.contact?.role}</p>
            </td>
            <td className={`${td} text-slate-700`}>
              {languageName(church.contact?.language)}
            </td>
            <td className={`${td} whitespace-nowrap text-slate-700`}>
              {formatDateTime(church.createdAt, timeZone)}
            </td>
            <td className={td}>
              <ChurchStatus churchId={church.id} status={church.status} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ReportsTable({
  reports,
  timeZone,
}: {
  reports: DashboardReport[];
  timeZone: string;
}) {
  return (
    <table className="min-w-full divide-y divide-slate-200 text-base">
      <thead className="bg-slate-50">
        <tr>
          <th className={th}>Church</th>
          <th className={`${th} text-right`}>Baptisms</th>
          <th className={th}>Baptism date</th>
          <th className={th}>Received</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {reports.map((report) => (
          <tr key={report.id}>
            <td className={`${td} font-semibold text-slate-900`}>{report.churchName}</td>
            <td className={`${td} text-right text-2xl font-bold tabular-nums text-slate-900`}>
              {report.count.toLocaleString("en-US")}
            </td>
            <td className={`${td} whitespace-nowrap text-slate-700`}>
              {formatDate(report.baptismDate)}
            </td>
            <td className={`${td} whitespace-nowrap text-slate-700`}>
              {formatDateTime(report.createdAt, timeZone)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-8" aria-busy>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="h-40 rounded-2xl bg-slate-200 sm:h-48" />
        <div className="h-40 rounded-2xl bg-slate-200 sm:h-48" />
      </div>
      <div className="h-64 rounded-2xl bg-slate-200" />
    </div>
  );
}

function languageName(code: string | null | undefined): string {
  if (!code) return "—";
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}

function formatDateTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(new Date(iso));
}

function formatDate(isoDate: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(`${isoDate}T00:00:00Z`));
}
