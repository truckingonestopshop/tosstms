"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  LogOut,
  Monitor,
  Moon,
  Search,
  Settings,
  Sun,
  BarChart3,
  UserRound,
  ShieldCheck,
  ArrowUpRight,
  Menu,
} from "lucide-react";
import { LogoMark } from "@/components/brand/Logo";
import { Popover, MenuItem, MenuLabel, MenuSep } from "@/components/ui/Menu";
import { useStore } from "@/lib/store";
import { MemberAvatar } from "@/components/team/MemberAvatar";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/format";
import { signOut } from "@/app/login/actions";
import { SidebarDrawer } from "./Sidebar";
import { SearchPalette } from "./SearchPalette";
import { CompanySearch } from "./CompanySearch";
import { useAppLeave } from "@/components/auth/AppSwitch";
import { AppSwitcher } from "./AppSwitcher";
import { canOpen } from "./nav";
import { toast } from "@/lib/toast";

/** /go/leads sends people back with ?switch_error=… when Lead Hunter can't open. */
function useSwitchError() {
  useEffect(() => {
    const url = new URL(window.location.href);
    const msg = url.searchParams.get("switch_error");
    if (!msg) return;
    toast.error(msg);
    url.searchParams.delete("switch_error");
    history.replaceState(null, "", url);
  }, []);
}

export function Header() {
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const { hasLeads, me, memberById } = useStore();
  const path = usePathname();
  const accounting = path.startsWith("/accounting");
  // A single app (no Lead Hunter, no Accounting access) shows its name next to the logo instead.
  const switcher = hasLeads || canOpen(memberById(me.id) ?? { role: me.role }, "accounting");
  useSwitchError();

  return (
    <header
      className="no-print sticky top-0 z-40 border-b border-line bg-surface/85 backdrop-blur-xl"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="flex h-14 w-full items-center gap-3 px-4 sm:px-6 lg:px-5">
        <button onClick={() => setMenuOpen(true)} className="-ml-1.5 rounded-lg p-2 text-fg-2 hover:bg-surface-2 lg:hidden" aria-label="Open menu">
          <Menu className="h-[18px] w-[18px]" />
        </button>
        <Link
          href={accounting ? "/accounting" : "/"}
          className="flex shrink-0 items-center gap-2 text-fg"
          aria-label="TOSS Cloud home"
        >
          <LogoMark className="h-[22px] w-auto" />
          {!switcher && (
            <span className="hidden rounded border border-line-strong px-1 py-px text-[9px] font-bold uppercase tracking-[0.14em] text-fg-3 sm:inline">
              Cloud
            </span>
          )}
        </Link>
        {switcher && (
          <div className="hidden sm:block">
            <AppSwitcher />
          </div>
        )}

        {/* Companies are TOSS Cloud's; Accounting is TOSS's own money. */}
        {!accounting && (
          <>
            <div className="mx-1 hidden h-5 w-px bg-line sm:block" />
            <CompanySearch />
          </>
        )}


        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <button
            onClick={() => setSearchOpen(true)}
            className="hidden h-8 items-center gap-2 rounded-lg border border-line bg-surface-2/60 pl-2.5 pr-1.5 text-[13px] text-fg-3 transition-colors hover:border-line-strong hover:text-fg md:flex"
          >
            <Search className="h-3.5 w-3.5" />
            <span className="pr-6">Search</span>
            <kbd className="rounded border border-line bg-surface px-1 text-[10px] font-semibold text-fg-4">
              Ctrl K
            </kbd>
          </button>
          <button
            onClick={() => setSearchOpen(true)}
            className="rounded-lg p-2 text-fg-2 hover:bg-surface-2 md:hidden"
            aria-label="Search"
          >
            <Search className="h-[18px] w-[18px]" />
          </button>
          <UserMenu />
        </div>
      </div>
      <SearchPalette open={searchOpen} onOpenChange={setSearchOpen} />
      <SidebarDrawer open={menuOpen} onClose={closeMenu} />
    </header>
  );
}


function UserMenu() {
  const { me, memberById, isSuperAdmin, hasLeads } = useStore();
  const { go, curtain } = useAppLeave();
  const self = memberById(me.id);
  const name = self?.full_name || me.fullName || me.email;
  const { choice, setChoice } = useTheme();
  const router = useRouter();
  return (
    <>
      <Popover
        align="end"
        width={240}
        trigger={({ toggle, ref }) => (
          <button
            ref={ref}
            onClick={toggle}
            className="rounded-full p-0.5 hover:ring-2 hover:ring-line"
            aria-label="Account"
          >
            <MemberAvatar id={me.id} name={name} />
          </button>
        )}
      >
        {(close) => (
          <div>
            <div className="px-2.5 py-2">
              <div className="truncate text-[13px] font-semibold text-fg">
                {name}
              </div>
              <div className="truncate text-xs text-fg-3">
                {self?.position || me.email}
              </div>
              <div className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-fg-4">
                {me.role}
              </div>
            </div>
            <MenuItem
              icon={UserRound}
              onClick={() => {
                close();
                router.push("/profile");
              }}
            >
              My profile
            </MenuItem>
            {isSuperAdmin && (
              <MenuItem
                icon={ShieldCheck}
                onClick={() => {
                  close();
                  router.push("/admin");
                }}
              >
                Admin panel
              </MenuItem>
            )}
            {hasLeads && (
              <a
                href="/go/leads"
                onClick={(e) => {
                  e.preventDefault();
                  close();
                  go("leads", "/go/leads");
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-fg-2 hover:bg-surface-2 hover:text-fg"
              >
                <ArrowUpRight className="h-4 w-4 opacity-70" />
                Open TOSS Lead Hunter
              </a>
            )}
            <MenuSep />
            <MenuLabel>Appearance</MenuLabel>
            <div className="mx-1 mb-1 grid grid-cols-3 gap-1 rounded-lg bg-surface-2 p-0.5">
              {(
                [
                  { v: "light", icon: Sun, label: "Light" },
                  { v: "dark", icon: Moon, label: "Dark" },
                  { v: "system", icon: Monitor, label: "Auto" },
                ] as const
              ).map((o) => (
                <button
                  key={o.v}
                  onClick={() => setChoice(o.v)}
                  className={cn(
                    "flex flex-col items-center gap-0.5 rounded-md py-1.5 text-[11px] font-medium",
                    choice === o.v
                      ? "bg-surface text-fg shadow-sm ring-1 ring-line"
                      : "text-fg-3 hover:text-fg",
                  )}
                >
                  <o.icon className="h-3.5 w-3.5" />
                  {o.label}
                </button>
              ))}
            </div>
            <MenuSep />
            <div className="lg:hidden">
              <MenuItem
                icon={BarChart3}
                onClick={() => {
                  close();
                  router.push("/analytics");
                }}
              >
                Analytics
              </MenuItem>
            </div>
            <MenuItem
              icon={Settings}
              onClick={() => {
                close();
                router.push("/settings");
              }}
            >
              Settings
            </MenuItem>
            <form action={signOut}>
              <button className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-fg-2 hover:bg-surface-2 hover:text-fg">
                <LogOut className="h-4 w-4 opacity-70" />
                Sign out
              </button>
            </form>
          </div>
        )}
      </Popover>
      {curtain}
    </>
  );
}
