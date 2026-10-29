import "server-only";

// TOSS Lead Hunter's API, called with the signed-in person's token: the same calls Lead Hunter's own
// Copilot makes, so both assistants see the same numbers. TOSS_API_URL can override the address;
// by default it is Lead Hunter's server.

export const HUNTER_API = (process.env.TOSS_API_URL || "https://toss-api.2-25-246-221.sslip.io").replace(/\/$/, "");

export class HunterError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** GET (no body) or POST (body) to the Lead Hunter API. 404 → null. */
export async function hunterApi(token: string, path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(`${HUNTER_API}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  }).catch(() => null);
  if (!res) throw new HunterError(502, "Lead Hunter didn't answer. Try again in a moment.");
  if (res.status === 404) return null;
  const json = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
  if (!res.ok) throw new HunterError(res.status, json?.error?.message || `Lead Hunter answered ${res.status}.`);
  return json;
}
