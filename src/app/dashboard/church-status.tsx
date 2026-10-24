"use client";

import { useState, useTransition } from "react";

import type { ChurchStatus as Status } from "@/lib/supabase/database.types";
import { approve, type ApproveResponse } from "./actions";

/**
 * Status badge, with an Approve button while the church is pending. Stays
 * mounted across the post-approval refresh so the send result remains visible.
 */
export function ChurchStatus({
  churchId,
  status,
}: {
  churchId: string;
  status: Status;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ApproveResponse | null>(null);

  if (status === "approved") {
    return (
      <div className="flex flex-col gap-1">
        <span className="inline-flex w-fit items-center rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-800">
          Approved
        </span>
        {result?.ok && !result.notified && (
          <span className="text-xs text-amber-700">WhatsApp message not sent</span>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            try {
              setResult(await approve(churchId));
            } catch {
              setResult({ ok: false, error: "Something went wrong" });
            }
          })
        }
        className="w-fit rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-800 disabled:cursor-wait disabled:opacity-60"
      >
        {pending ? "Approving…" : "Approve"}
      </button>
      {result && !result.ok && (
        <span className="text-xs text-red-700">{result.error}</span>
      )}
    </div>
  );
}
