import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { NoAccess } from "@/components/layout/NoAccess";
import { currentUser, supabaseServer } from "@/lib/supabase/server";
import { PREVIEW_COOKIE, PREVIEW_VIEW_COOKIE, previewAllowed } from "@/lib/preview";
import { ArrivalCurtain } from "@/components/auth/AppSwitch";
import { ARRIVE_COOKIE } from "@/lib/appSwitch";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await currentUser();
  if (!user) {
    // Development-only sample-data preview (see /preview-ui).
    const jar = await cookies();
    if (previewAllowed() && jar.get(PREVIEW_COOKIE)?.value === "1") {
      const view = jar.get(PREVIEW_VIEW_COOKIE)?.value === "office" ? "office" : "dispatch";
      return (
        <AppShell preview me={{ id: "demo-me", email: "dispatch@truckingonestopshop.net", fullName: "Preview Dispatcher", role: "owner", view }}>
          {children}
        </AppShell>
      );
    }
    redirect("/login");
  }
  if (!user.role) {
    // Not on the TOSS Cloud team but has TOSS Lead Hunter: tosscloud.tech is the one front door,
    // so send them on to Lead Hunter, signed in.
    const sb = await supabaseServer();
    const { data: ws } = await sb.from("workspace_members").select("user_id").eq("user_id", user.id).limit(1);
    if (ws?.length) redirect("/go/leads");
    return <NoAccess email={user.email} />;
  }
  // Just switched over from TOSS Lead Hunter: start under the brand card and fade it out.
  const arriving = (await cookies()).get(ARRIVE_COOKIE)?.value === "1";
  return (
    <>
      {arriving && <ArrivalCurtain app="cloud" />}
      <AppShell me={{ id: user.id, email: user.email, fullName: user.fullName, role: user.role, view: user.view }}>{children}</AppShell>
    </>
  );
}
