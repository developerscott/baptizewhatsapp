import { afterEach, describe, expect, it, vi } from "vitest";

import { isISODate, todayISO } from "@/lib/dates";

describe("todayISO", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("uses UTC by default", () => {
    expect(todayISO(new Date("2026-10-25T01:00:00Z"))).toBe("2026-10-25");
  });

  it("uses APP_TIME_ZONE when set", () => {
    vi.stubEnv("APP_TIME_ZONE", "America/Los_Angeles");
    expect(todayISO(new Date("2026-10-25T01:00:00Z"))).toBe("2026-10-24");
  });
});

describe("isISODate", () => {
  it.each([
    ["2026-10-24", true],
    ["2026-02-30", false],
    ["24/10/2026", false],
    ["2026-1-4", false],
  ])("%s → %s", (value, expected) => {
    expect(isISODate(value)).toBe(expected);
  });
});
