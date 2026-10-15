"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

/**
 * Supabase's default invite / reset emails return to the Site URL with the session in the
 * URL fragment (#access_token=…&refresh_token=…&type=invite). The fragment never reaches
 * the server, so this picks it up in the browser, stores the session in cookies, and sends
 * invited users on to set a password.
 */
export function EmailLinkSession() {
  const router = useRouter();
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    if (!accessToken || !refreshToken) return;
    const type = params.get("type");
    history.replaceState(null, "", window.location.pathname);
    supabaseBrowser()
      .auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(({ error }) => {
        if (error) router.replace("/login?error=link");
        else router.replace(type === "invite" || type === "recovery" ? "/set-password" : "/");
      });
  }, [router]);
  return null;
}
