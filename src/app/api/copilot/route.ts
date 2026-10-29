// TOSS Copilot chat (TOSS Cloud). One streamed request per message; read tools run on their own
// with the person's session, actions come back as confirm cards. The DeepSeek key never leaves
// the server.

import { convertToModelMessages, createUIMessageStreamResponse, hasToolCall, isStepCount, streamText, toUIMessageStream, type UIMessage } from "ai";
import { createDeepSeek, type DeepSeekLanguageModelChatOptions } from "@ai-sdk/deepseek";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMember, supabaseServer } from "@/lib/supabase/server";
import { copilotInstructions } from "@/lib/copilot/prompt";
import { copilotTools } from "@/lib/copilot/tools";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_MESSAGES = 40;
const MAX_STEPS = 12;
// `deepseek-chat` was retired; `deepseek-flash` is the current fast model.
const MODEL = !process.env.DEEPSEEK_MODEL || process.env.DEEPSEEK_MODEL === "deepseek-chat" ? "deepseek-flash" : process.env.DEEPSEEK_MODEL;

const Body = z.object({
  id: z.string().max(100).optional(),
  messages: z.array(z.custom<UIMessage>((m) => typeof m === "object" && m !== null && "role" in m && "parts" in m)).min(1).max(500),
  page: z.string().max(300).nullish(),
  companyId: z.string().uuid().nullish(),
});

/** The recent part of the chat, starting at a user message. */
function recent(messages: UIMessage[]): UIMessage[] {
  const tail = messages.slice(-MAX_MESSAGES);
  const first = tail.findIndex((m) => m.role === "user");
  return first < 0 ? tail : tail.slice(first);
}

const fail = (status: number, message: string) => NextResponse.json({ error: { message } }, { status });

export async function POST(req: Request) {
  const user = await requireMember();
  if (!user) return fail(401, "Sign in to TOSS Cloud first.");
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) return fail(503, "TOSS Copilot isn't set up yet (DEEPSEEK_API_KEY is missing).");
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(400, z.prettifyError(parsed.error));
  const { messages, page, companyId } = parsed.data;

  const sb = await supabaseServer();
  const [{ data: session }, { data: member }, company] = await Promise.all([
    sb.auth.getSession(),
    sb.from("tms_members").select("sections").eq("user_id", user.id).maybeSingle(),
    companyId ? sb.from("tms_companies").select("name").eq("id", companyId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const accounting = !!(member?.sections as string[] | null)?.includes("accounting");
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });

  const tools = copilotTools({ sb, me: { id: user.id, fullName: user.fullName, token: session.session?.access_token ?? null, accounting }, today });
  const model = createDeepSeek({ apiKey: key, ...(process.env.DEEPSEEK_BASE_URL ? { baseURL: process.env.DEEPSEEK_BASE_URL } : {}) })(MODEL);

  const result = streamText({
    model,
    instructions: copilotInstructions({ today, name: user.fullName, role: user.role || "member", accounting, page: page ?? null, companyName: (company.data as { name?: string } | null)?.name ?? null, companyId: companyId ?? null }),
    messages: await convertToModelMessages(recent(messages), { tools, ignoreIncompleteToolCalls: true }),
    tools,
    // A confirm card, a navigation or answer buttons end the message: the person acts next.
    stopWhen: [
      isStepCount(MAX_STEPS),
      hasToolCall(
        "suggest_replies",
        "navigate",
        "propose_create_company",
        "propose_add_lead_from_hunter",
        "propose_update_company",
        "propose_update_from_hunter",
        "propose_add_company_note",
        "propose_create_case",
        "propose_create_opportunity",
        "propose_set_load_status",
        "propose_set_truck_availability",
      ),
    ],
    providerOptions: {
      deepseek: { userId: user.id.replace(/[^a-zA-Z0-9_-]/g, ""), thinking: { type: "enabled" }, reasoningEffort: "low" } satisfies DeepSeekLanguageModelChatOptions,
    },
    onEnd: ({ totalUsage }) => {
      console.log(`copilot ${MODEL} user=${user.id} in=${totalUsage.inputTokens ?? 0} cached=${totalUsage.inputTokenDetails?.cacheReadTokens ?? 0} out=${totalUsage.outputTokens ?? 0}`);
    },
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      tools,
      sendReasoning: false,
      onError: (e) => {
        console.error("copilot", e);
        const m = e instanceof Error ? e.message : "";
        if (/busy|overload|429|503/i.test(m)) return "The assistant service is busy right now. Try again in a moment.";
        return "Something went wrong on our side. Try again.";
      },
    }),
  });
}
