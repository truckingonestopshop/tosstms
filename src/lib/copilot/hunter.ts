import "server-only";

// TOSS Lead Hunter's API (every FMCSA dataset), called with the signed-in person's token: the same
// calls Lead Hunter's own Copilot makes, so both assistants see the same numbers.

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
  const base = process.env.TOSS_API_URL;
  if (!base) throw new HunterError(503, "Lead Hunter isn't connected (TOSS_API_URL is not set).");
  const res = await fetch(`${base.replace(/\/$/, "")}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  }).catch(() => null);
  if (!res) throw new HunterError(502, "Couldn't reach Lead Hunter.");
  if (res.status === 404) return null;
  const json = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
  if (!res.ok) throw new HunterError(res.status, json?.error?.message || `Lead Hunter answered ${res.status}.`);
  return json;
}
