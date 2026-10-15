import "server-only";

// DeepSeek (OpenAI-compatible) chat call, streamed. Streaming matters: when the service
// is overloaded it answers "busy" right away instead of holding the connection open.

const BASE = (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/+$/, "");
const KEY = process.env.DEEPSEEK_API_KEY || "";
// `deepseek-chat` was retired; `deepseek-flash` reads text and images.
const MODEL = !process.env.DEEPSEEK_MODEL || process.env.DEEPSEEK_MODEL === "deepseek-chat" ? "deepseek-flash" : process.env.DEEPSEEK_MODEL;

export const deepseekConfigured = () => !!KEY;

type Part = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
export interface ChatMessage {
  role: "system" | "user";
  content: string | Part[];
}

export async function chatJson(messages: ChatMessage[], { timeoutMs = 52000, firstByteMs = 20000 } = {}): Promise<unknown> {
  if (!KEY) throw new Error("DeepSeek key missing");
  const ctrl = new AbortController();
  const total = setTimeout(() => ctrl.abort(new Error("timeout")), timeoutMs);
  let first = setTimeout(() => ctrl.abort(new Error("no response")), firstByteMs);
  try {
    const res = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
      body: JSON.stringify({
        model: MODEL,
        messages,
        stream: true,
        temperature: 0,
        // The model thinks before answering and the thinking counts against this
        // budget; at 6,000 a 3-page rate con used it all and the answer came back empty.
        max_tokens: 24000,
        response_format: { type: "json_object" },
      }),
      signal: ctrl.signal,
    });
    if (!res.ok || !res.body) {
      const t = await res.text().catch(() => "");
      throw new Error(`DeepSeek ${res.status}: ${t.slice(0, 200)}`);
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let content = "";
    let finish: string | null = null;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      clearTimeout(first);
      first = setTimeout(() => ctrl.abort(new Error("stalled")), firstByteMs);
      buf += dec.decode(value, { stream: true });
      // A busy/overload error can arrive as a plain JSON body.
      if (!content && buf.trimStart().startsWith("{") && buf.includes('"error"')) {
        try {
          const e = JSON.parse(buf);
          throw new Error(e?.error?.message || "DeepSeek error");
        } catch (err) {
          if (err instanceof SyntaxError) continue;
          throw err;
        }
      }
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") continue;
        try {
          const j = JSON.parse(data);
          if (j.error) throw new Error(j.error.message || "DeepSeek error");
          content += j.choices?.[0]?.delta?.content || "";
          finish = j.choices?.[0]?.finish_reason || finish;
        } catch (err) {
          if (!(err instanceof SyntaxError)) throw err;
        }
      }
    }
    const cleaned = content.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    if (!cleaned) throw new Error(finish === "length" ? "answer cut off (token limit)" : `empty answer (${finish || "no finish reason"})`);
    try {
      return JSON.parse(cleaned);
    } catch {
      throw new Error(`answer was not valid JSON (${finish || "?"}): ${cleaned.slice(0, 120)}`);
    }
  } finally {
    clearTimeout(total);
    clearTimeout(first);
  }
}
