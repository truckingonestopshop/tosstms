import { NextResponse } from "next/server";
import { chatJson, deepseekConfigured } from "@/lib/server/deepseek";
import { requireMember, supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * A short summary of a carrier's timeline (Profile): what happened on the account, written only
 * from the timeline entries (newest 150) and the carrier's basic details. Nothing is stored.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Unknown carrier" }, { status: 400 });
  if (!(await requireMember())) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (!deepseekConfigured()) return NextResponse.json({ error: "Summaries aren't set up on the server." }, { status: 503 });

  const sb = await supabaseServer();
  const [{ data: company }, { data: events }] = await Promise.all([
    sb.from("tms_companies").select("name,dot_number,mc_number,status,dot_status,mc_status,services,notes,created_at").eq("id", id).maybeSingle(),
    sb.from("tms_company_events").select("kind,message,attachments,actor_name,created_at").eq("company_id", id).order("created_at", { ascending: false }).limit(150),
  ]);
  if (!company) return NextResponse.json({ error: "Carrier not found" }, { status: 404 });
  if (!events?.length) return NextResponse.json({ summary: "Nothing has happened on this account yet.", points: [] });

  const lines = events
    .slice()
    .reverse()
    .map((e) => {
      const files = Array.isArray(e.attachments) && e.attachments.length ? ` [files: ${(e.attachments as { name: string }[]).map((a) => a.name).join(", ")}]` : "";
      return `${String(e.created_at).slice(0, 10)} · ${e.kind} · ${e.actor_name || "System"}: ${e.message || ""}${files}`;
    })
    .join("\n");
  const services = Object.entries((company.services as Record<string, { on?: boolean }>) || {})
    .filter(([, v]) => v?.on)
    .map(([k]) => k)
    .join(", ");

  try {
    const out = (await chatJson(
      [
        {
          role: "system",
          content:
            "You summarize a trucking carrier's account history for an office team. Use only the facts in the timeline below; never guess, advise or rate. " +
            'Answer as json: {"summary": "3 to 5 plain sentences, oldest to newest, with dates", "points": ["up to 5 short open items or recent changes, only if the timeline shows them"]}.',
        },
        {
          role: "user",
          content: `Carrier: ${company.name} · USDOT ${company.dot_number ?? "—"} · MC ${company.mc_number ?? "—"} · client ${company.status} · DOT status ${company.dot_status ?? "not recorded"} · MC status ${company.mc_status ?? "not recorded"} · services: ${services || "none"}\n\nTimeline (oldest first):\n${lines}`,
        },
      ],
      { timeoutMs: 50000 },
    )) as { summary?: unknown; points?: unknown };
    const summary = typeof out?.summary === "string" ? out.summary.trim() : "";
    const points = Array.isArray(out?.points) ? out.points.filter((p): p is string => typeof p === "string" && !!p.trim()).slice(0, 5) : [];
    if (!summary) return NextResponse.json({ error: "No summary came back. Try again." }, { status: 502 });
    return NextResponse.json({ summary, points });
  } catch (e) {
    return NextResponse.json({ error: `The summary couldn't be written: ${(e as Error).message}` }, { status: 502 });
  }
}
