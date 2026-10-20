"use client";

import { Avatar } from "@/components/ui/Bits";
import { useStore } from "@/lib/store";
import { avatarUrl } from "@/lib/db";

/** A team member's photo (or initials), looked up by user id. */
export function MemberAvatar({ id, className, name }: { id: string | null | undefined; className?: string; name?: string }) {
  const { memberById } = useStore();
  const m = memberById(id);
  return <Avatar name={name || m?.full_name || m?.email || "?"} src={avatarUrl(m?.avatar_path)} className={className} />;
}
