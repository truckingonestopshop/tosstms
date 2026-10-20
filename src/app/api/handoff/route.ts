import { adminClient, AdminError } from "@/lib/server/admin";
import { cloudOrigin, handoffUrl } from "@/lib/server/handoff";

// TOSS Lead Hunter → TOSS Cloud. Lead Hunter's server calls this with the signed-in person's
// access token (Authorization: Bearer …); Supabase checks the token, and the answer is a
// one-time link that signs the same person in here. Server to server only: no CORS.
export async function POST(req: Request) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return Response.json({ error: "Sign in required" }, { status: 401 });
  try {
    const { data, error } = await adminClient().auth.getUser(token);
    if (error || !data.user) return Response.json({ error: "Sign in required" }, { status: 401 });
    const body = (await req.json().catch(() => ({}))) as { next?: unknown };
    const url = await handoffUrl({ id: data.user.id, email: data.user.email ?? null }, "cloud", body.next ?? "/", cloudOrigin(req));
    return Response.json({ url }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    const status = e instanceof AdminError ? e.status : 500;
    return Response.json({ error: e instanceof Error ? e.message : "Something went wrong" }, { status });
  }
}
