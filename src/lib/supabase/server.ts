import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";

/** Supabase client bound to the signed-in user's cookies (RLS applies). */
export async function supabaseServer() {
  const store = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (list) => {
          try {
            for (const { name, value, options } of list) store.set(name, value, options);
          } catch {
            // Server Components can't write cookies; proxy.ts refreshes them.
          }
        },
      },
    },
  );
}

export type TmsRole = "owner" | "dispatcher";

export interface CurrentUser {
  id: string;
  email: string;
  fullName: string;
  /** null = signed in to TOSS but not added to the TMS team. */
  role: TmsRole | null;
  view: "dispatch" | "office";
}

/** The signed-in user and their TMS role, or null. Cached per request. */
export const currentUser = cache(async function currentUser(): Promise<CurrentUser | null> {
  const sb = await supabaseServer();
  const { data, error } = await sb.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  const id = data.claims.sub as string;
  const email = (data.claims.email as string | undefined) ?? "";
  const { data: member } = await sb.from("tms_members").select("full_name, role, workspace_view").eq("user_id", id).maybeSingle();
  return {
    id,
    email,
    fullName: member?.full_name || email.split("@")[0],
    role: (member?.role as TmsRole | undefined) ?? null,
    view: member?.workspace_view === "office" ? "office" : "dispatch",
  };
});

/** Use in route handlers: returns the user only if they are a TMS member. */
export async function requireMember() {
  const user = await currentUser();
  if (!user || !user.role) {
    // Development-only sample-data preview (see /preview-ui).
    if (process.env.NODE_ENV === "development" && (await cookies()).get("tms_ui_preview")?.value === "1") {
      return { id: "demo-me", email: "preview@localhost", fullName: "Preview", role: "owner" as TmsRole, view: "dispatch" as const };
    }
    return null;
  }
  return user;
}
