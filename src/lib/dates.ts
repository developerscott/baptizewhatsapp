/**
 * Today's date (YYYY-MM-DD) in APP_TIME_ZONE (an IANA zone, default UTC).
 * "Today" in a report resolves to this date.
 */
export function todayISO(now: Date = new Date()): string {
  const timeZone = process.env.APP_TIME_ZONE || "UTC";
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(now);
}

/** True for a real calendar date in YYYY-MM-DD form. */
export function isISODate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}
