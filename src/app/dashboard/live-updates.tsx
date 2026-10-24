"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { supabaseBrowser } from "@/lib/supabase/browser";

const REFRESH_DEBOUNCE_MS = 250;

/**
 * Subscribes to Supabase Realtime on churches and baptism reports and
 * re-renders the dashboard on any change.
 */
export function LiveUpdates() {
  const router = useRouter();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const supabase = supabaseBrowser();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const scheduleRefresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), REFRESH_DEBOUNCE_MS);
    };

    const channel = supabase
      .channel("dashboard")
      .on("postgres_changes", { event: "*", schema: "public", table: "churches" }, scheduleRefresh)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "baptism_reports" },
        scheduleRefresh,
      )
      .subscribe((status) => setConnected(status === "SUBSCRIBED"));

    return () => {
      clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [router]);

  return (
    <span className="inline-flex items-center gap-2 text-sm font-medium text-slate-600">
      <span
        className={`size-2.5 rounded-full ${connected ? "animate-pulse bg-emerald-500" : "bg-slate-300"}`}
        aria-hidden
      />
      {connected ? "Live" : "Connecting…"}
    </span>
  );
}
