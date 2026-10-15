"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  Building2,
  Check,
  ChevronsUpDown,
  Layers,
  LogOut,
  Monitor,
  Moon,
  Plus,
  Search,
  Settings,
  Sun,
  BarChart3,
} from "lucide-react";
import { LogoMark } from "@/components/brand/Logo";
import { ButtonLink } from "@/components/ui/Button";
import { Popover, MenuItem, MenuLabel, MenuSep } from "@/components/ui/Menu";
import { Avatar } from "@/components/ui/Bits";
import { useStore } from "@/lib/store";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/format";
import { signOut } from "@/app/login/actions";
import { NAV } from "./nav";
import { SearchPalette } from "./SearchPalette";

export function Header() {
  const path = usePathname();
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <header className="no-print sticky top-0 z-40 border-b border-line bg-surface/85 backdrop-blur-xl" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      <div className="mx-auto flex h-14 w-full max-w-[1600px] items-center gap-3 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex shrink-0 items-center gap-2 text-fg" aria-label="TOSS TMS home">
          <LogoMark className="h-[22px] w-auto" />
          <span className="hidden rounded border border-line-strong px-1 py-px text-[9px] font-bold uppercase tracking-[0.14em] text-fg-3 sm:inline">
            TMS
          </span>
        </Link>

        <div className="mx-1 hidden h-5 w-px bg-line sm:block" />
        <CompanySwitcher />

        <nav className="ml-2 hidden items-center gap-0.5 lg:flex">
          {NAV.map((n) => {
            const on = n.match(path);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors",
                  on ? "bg-surface-2 text-fg" : "text-fg-3 hover:bg-surface-2/60 hover:text-fg",
                )}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <button
            onClick={() => setSearchOpen(true)}
            className="hidden h-8 items-center gap-2 rounded-lg border border-line bg-surface-2/60 pl-2.5 pr-1.5 text-[13px] text-fg-3 transition-colors hover:border-line-strong hover:text-fg md:flex"
          >
            <Search className="h-3.5 w-3.5" />
            <span className="pr-6">Search</span>
            <kbd className="rounded border border-line bg-surface px-1 text-[10px] font-semibold text-fg-4">Ctrl K</kbd>
          </button>
          <button onClick={() => setSearchOpen(true)} className="rounded-lg p-2 text-fg-2 hover:bg-surface-2 md:hidden" aria-label="Search">
            <Search className="h-[18px] w-[18px]" />
          </button>
          <ButtonLink href="/loads/new" variant="primary" size="sm" className="hidden md:inline-flex">
            <Plus className="h-4 w-4" />
            New load
          </ButtonLink>
          <UserMenu />
        </div>
      </div>
      <SearchPalette open={searchOpen} onOpenChange={setSearchOpen} />
    </header>
  );
}

function CompanySwitcher() {
  const { companies, scope, setScope, scopedCompany, loads } = useStore();
  const router = useRouter();
  const [q, setQ] = useState("");
  const list = companies.filter((c) => !q || c.name.toLowerCase().includes(q.toLowerCase()) || (c.mc_number || "").includes(q));
  const activeLoads = (id: string) => loads.filter((l) => l.company_id === id && ["new", "booked", "in_transit"].includes(l.status)).length;

  return (
    <Popover
      width={300}
      onOpenChange={(o) => !o && setQ("")}
      trigger={({ toggle, ref }) => (
        <button
          ref={ref}
          onClick={toggle}
          className="flex h-8 min-w-0 items-center gap-2 rounded-lg px-2 text-[13px] font-medium text-fg hover:bg-surface-2"
        >
          {scopedCompany ? <Building2 className="h-4 w-4 shrink-0 text-fg-3" /> : <Layers className="h-4 w-4 shrink-0 text-fg-3" />}
          <span className="max-w-[120px] truncate sm:max-w-[200px]">{scopedCompany ? scopedCompany.name : "All companies"}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-fg-4" />
        </button>
      )}
    >
      {(close) => (
        <div>
          {companies.length > 6 && (
            <div className="p-1">
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Find a company…"
                className="h-8 w-full rounded-md border border-line bg-surface-2 px-2.5 text-[13px] text-fg placeholder:text-fg-4 focus:outline-none"
              />
            </div>
          )}
          <MenuItem
            icon={Layers}
            active={scope === "all"}
            hint={scope === "all" ? <Check className="h-3.5 w-3.5" /> : undefined}
            onClick={() => {
              setScope("all");
              close();
            }}
          >
            All companies
          </MenuItem>
          <MenuSep />
          <MenuLabel>Carriers</MenuLabel>
          {list.length === 0 && <div className="px-2.5 py-2 text-[13px] text-fg-4">{companies.length ? "No match" : "No companies yet"}</div>}
          {list.map((c) => (
            <button
              key={c.id}
              onClick={() => {
                setScope(c.id);
                close();
              }}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-surface-2",
                scope === c.id && "bg-surface-2",
              )}
            >
              <div className="min-w-0 flex-1">
                <div className={cn("truncate text-[13px] text-fg", scope === c.id && "font-semibold")}>{c.name}</div>
                <div className="truncate text-[11px] text-fg-4">
                  {c.mc_number ? `MC ${c.mc_number} · ` : ""}
                  {c.commission_percent}% · {activeLoads(c.id)} active
                </div>
              </div>
              {c.status === "inactive" && <span className="text-[10px] uppercase text-fg-4">Inactive</span>}
              {scope === c.id && <Check className="h-3.5 w-3.5 text-fg" />}
            </button>
          ))}
          <MenuSep />
          <MenuItem
            icon={Plus}
            onClick={() => {
              close();
              router.push("/fleet?new=company");
            }}
          >
            Add carrier company
          </MenuItem>
        </div>
      )}
    </Popover>
  );
}

function UserMenu() {
  const { me } = useStore();
  const { choice, setChoice } = useTheme();
  const router = useRouter();
  return (
    <Popover
      align="end"
      width={240}
      trigger={({ toggle, ref }) => (
        <button ref={ref} onClick={toggle} className="rounded-full p-0.5 hover:ring-2 hover:ring-line" aria-label="Account">
          <Avatar name={me.fullName || me.email} />
        </button>
      )}
    >
      {(close) => (
        <div>
          <div className="px-2.5 py-2">
            <div className="truncate text-[13px] font-semibold text-fg">{me.fullName}</div>
            <div className="truncate text-xs text-fg-3">{me.email}</div>
            <div className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-fg-4">{me.role}</div>
          </div>
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
                  choice === o.v ? "bg-surface text-fg shadow-sm ring-1 ring-line" : "text-fg-3 hover:text-fg",
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
  );
}
