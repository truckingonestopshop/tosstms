"use client";

import { useEffect, useState } from "react";
import { sb } from "@/lib/db";

/** Unread incoming texts, emails, missed calls and voicemails (the Inbox badge), kept live. */
export function useInboxUnread() {
  const [n, setN] = useState(0);
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const count = () =>
      sb()
        .from("tms_comms")
        .select("id", { count: "exact", head: true })
        .eq("direction", "inbound")
        .is("read_at", null)
        .then(({ count: c }) => alive && setN(c || 0));
    count();
    const ch = sb()
      .channel(`inbox-unread-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tms_comms" }, () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(count, 400);
      })
      .subscribe();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      sb().removeChannel(ch);
    };
  }, []);
  return n;
}
