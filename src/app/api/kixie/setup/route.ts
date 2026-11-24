import { NextResponse, type NextRequest } from "next/server";
import { adminClient, adminConfigured } from "@/lib/server/admin";
import { emailConfigured } from "@/lib/server/email";
import { TOSS_EVENTS, createWebhook, hookName, kixieConfigured, listWebhooks, removeWebhook, webhookSecret, type KixieHook } from "@/lib/server/kixie";
import { agent } from "@/lib/server/agent";

export const runtime = "nodejs";

// Settings → Phone & Inbox.
//   GET    is Kixie set up, which TOSS webhooks Kixie has, and my Kixie login email
//   POST   (owners) connect: point Kixie's webhooks at this site (replaces TOSS's old ones)
//   PATCH  { kixieEmail } my own Kixie login email

const idOf = (h: KixieHook) => h.webhookid ?? h.id ?? h.webhookId;
const eventOf = (h: KixieHook) => String(h.eventname ?? h.eventName ?? h.event ?? "");
const locationOf = (h: KixieHook) => String(h.location ?? h.url ?? h.webhookurl ?? "");
const isToss = (h: KixieHook) => String(h.name ?? "").startsWith("TOSS Cloud ") || locationOf(h).includes("/api/kixie/webhook");

export async function GET(req: NextRequest) {
  const me = await agent();
  if (!me) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const out = {
    kixie: kixieConfigured(),
    email: emailConfigured(),
    kixieEmail: me.kixieEmail,
    owner: me.role === "owner",
    webhookUrl: `${req.nextUrl.origin}/api/kixie/webhook`,
    lookupUrl: `${req.nextUrl.origin}/api/kixie/lookup`,
    hooks: [] as { event: string; location: string; ok: boolean }[],
    hooksError: null as string | null,
  };
  if (out.kixie) {
    try {
      const hooks = (await listWebhooks()).filter(isToss);
      out.hooks = TOSS_EVENTS.map((ev) => {
        const h = hooks.find((x) => eventOf(x).toLowerCase() === ev.toLowerCase());
        return { event: ev, location: h ? locationOf(h) : "", ok: !!h && locationOf(h) === out.webhookUrl };
      });
    } catch (e) {
      out.hooksError = e instanceof Error ? e.message : "Couldn't read Kixie's webhooks";
    }
  }
  return NextResponse.json(out);
}

export async function POST(req: NextRequest) {
  const me = await agent();
  if (!me || me.role !== "owner") return NextResponse.json({ error: "Only owners can connect Kixie" }, { status: 403 });
  if (!kixieConfigured() || !webhookSecret()) return NextResponse.json({ error: "Kixie isn't set up (KIXIE_API_KEY, KIXIE_BUSINESS_ID)" }, { status: 503 });
  const origin = req.nextUrl.origin;
  if (/localhost|127\.0\.0\.1|\[::1\]/.test(origin)) {
    return NextResponse.json({ error: "Kixie can't reach this computer. Connect from the live TOSS Cloud site." }, { status: 400 });
  }
  const location = `${origin}/api/kixie/webhook`;
  try {
    // replace TOSS's own webhooks (an old address, or a second copy); other webhooks are left alone
    for (const h of (await listWebhooks()).filter(isToss)) {
      const id = idOf(h);
      if (id !== undefined && id !== null) await removeWebhook(id as string | number);
    }
    const done: string[] = [];
    for (const ev of TOSS_EVENTS) {
      await createWebhook(ev, location);
      done.push(hookName(ev));
    }
    return NextResponse.json({ ok: true, location, created: done });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Kixie said no" }, { status: 502 });
  }
}

export async function PATCH(req: NextRequest) {
  const me = await agent();
  if (!me) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  if (!adminConfigured()) return NextResponse.json({ error: "Server not set up (SUPABASE_SECRET_KEY)" }, { status: 503 });
  const { kixieEmail } = (await req.json().catch(() => ({}))) as { kixieEmail?: string };
  const v = (kixieEmail || "").trim().toLowerCase();
  if (v && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return NextResponse.json({ error: "That isn't an email address" }, { status: 400 });
  const { error } = await adminClient().from("tms_members").update({ kixie_email: v || null }).eq("user_id", me.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, kixieEmail: v || me.email });
}
