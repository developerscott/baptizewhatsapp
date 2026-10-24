import "server-only";

/**
 * Reads a required server-side environment variable. Read lazily (at call time,
 * not import time) so `next build` works without secrets present.
 */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
