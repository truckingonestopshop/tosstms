/**
 * Where to go after signing in: only a path on this site ("/loads/123"), never another
 * site ("//evil.com", "/\evil.com", "https://…") or the login page itself. Anything else → "/".
 */
export function safeNext(v: unknown): string {
  if (typeof v !== "string" || v.length > 512) return "/";
  if (!v.startsWith("/") || v.startsWith("//") || v.includes("\\")) return "/";
  if (/[\u0000-\u001f\u007f]/.test(v)) return "/";
  if (v === "/login" || v.startsWith("/login?") || v.startsWith("/login/")) return "/";
  return v;
}
