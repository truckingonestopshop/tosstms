// Runs one TOSS Copilot action after the person clicked Confirm on its card, with their own
// session (same access rules as clicking in the app), and logs it in tms_copilot_actions.

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMember, supabaseServer } from "@/lib/supabase/server";
import { ACTION_NAMES, runAction, type ActionName } from "@/lib/copilot/actions";

export const runtime = "nodejs";

const Body = z.object({
  action: z.enum(ACTION_NAMES as [ActionName, ...ActionName[]]),
  input: z.record(z.string(), z.unknown()),
  threadId: z.string().uuid().nullish(),
});

export async function POST(req: Request) {
  const user = await requireMember();
  if (!user) return NextResponse.json({ ok: false, message: "Sign in to TOSS Cloud first." }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, message: z.prettifyError(parsed.error) }, { status: 400 });
  const { action, input, threadId } = parsed.data;

  const sb = await supabaseServer();
  const { data: session } = await sb.auth.getSession();
  const result = await runAction(sb, { id: user.id, fullName: user.fullName, token: session.session?.access_token ?? null }, action, input).catch((e: Error) => ({ ok: false as const, message: e.message || "The action failed." }));
  await sb.from("tms_copilot_actions").insert({ user_id: user.id, thread_id: threadId ?? null, action, input, result, ok: result.ok });
  return NextResponse.json(result);
}
