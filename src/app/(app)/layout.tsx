import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { NoAccess } from "@/components/layout/NoAccess";
import { currentUser } from "@/lib/supabase/server";
import { PREVIEW_COOKIE, previewAllowed } from "@/lib/preview";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await currentUser();
  if (!user) {
    // Development-only sample-data preview (see /preview-ui).
    if (previewAllowed() && (await cookies()).get(PREVIEW_COOKIE)?.value === "1") {
      return (
        <AppShell preview me={{ id: "demo-me", email: "dispatch@truckingonestopshop.net", fullName: "Preview Dispatcher", role: "owner" }}>
          {children}
        </AppShell>
      );
    }
    redirect("/login");
  }
  if (!user.role) return <NoAccess email={user.email} />;
  return <AppShell me={{ id: user.id, email: user.email, fullName: user.fullName, role: user.role }}>{children}</AppShell>;
}
