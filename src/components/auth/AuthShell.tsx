import Image from "next/image";
import { LogoMark } from "@/components/brand/Logo";
import { ProductSwitch, type Product } from "./ProductSwitch";

// Login and set-password frame, identical to TOSS Lead Hunter: one rounded dark frame split in
// two. Left: the company website's truck photo darkened from the bottom, the white logo
// and the team headline (first word in brand orange). Right: the dark form. Phones: the
// photo becomes a short banner on top. Always dark, whatever the app theme. The pill on the
// photo switches between TOSS Cloud and TOSS Lead Hunter in place: this is the one sign-in
// page for both (Lead Hunter's /login sends people here with ?app=leads).

const PRODUCTS: Product[] = [
  {
    key: "cloud",
    name: "TOSS Cloud",
    lead: "Dispatch",
    rest: "Every Load, Keep Every Truck Moving.",
    about:
      "Our team's dispatch platform at Trucking One Stop Shop: book loads, manage carriers and fleets, keep paperwork in order and bill on time.",
  },
  {
    key: "leads",
    name: "TOSS Lead Hunter",
    lead: "Find",
    rest: "Your Leads, Build Your Lists.",
    about:
      "Our team's lead platform at Trucking One Stop Shop: search every registered trucking company, check contacts and keep our lists in one place.",
  },
];

export const authInput =
  "w-full rounded-[10px] border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-base text-white placeholder:text-zinc-500 focus:border-[#f28c38] focus:outline-none focus:ring-1 focus:ring-[#f28c38] sm:text-sm";
export const authLabel = "block space-y-1.5 text-sm";
export const authLabelText = "font-semibold text-zinc-300";
/** The one orange action: black text on orange. */
export const authButton =
  "w-full rounded-full bg-[#f28c38] py-2.5 text-sm font-semibold text-[#0a0a0d] transition-colors hover:bg-[#db7522] disabled:bg-zinc-700 disabled:text-zinc-400";

export function AuthShell({
  children,
  app = "cloud",
  onApp,
}: {
  children: React.ReactNode;
  /** "cloud" | "leads": which product this sign-in opens */
  app?: string;
  /** shows the product switch */
  onApp?: (app: string) => void;
}) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-black sm:p-4 lg:p-8">
      <div className="grid min-h-dvh w-full max-w-6xl gap-2 bg-[#0a0a0d] p-2 sm:min-h-0 sm:gap-3 sm:rounded-[22px] sm:border sm:border-white/10 sm:p-3 lg:min-h-[640px] lg:grid-cols-[1.1fr_1fr]">
        <section className="relative flex min-h-[260px] overflow-hidden rounded-[16px] sm:min-h-[320px] lg:min-h-0">
          <Image
            src="/brand/login-hero.png"
            alt=""
            fill
            priority
            sizes="(min-width: 1024px) 55vw, 100vw"
            className="object-cover object-[65%_center] transition-transform duration-[1400ms] ease-[cubic-bezier(.22,.8,.2,1)]"
            style={{ transform: app === "leads" ? "scale(1.06) translateX(-1.5%)" : "none" }}
          />
          <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black via-black/55 to-black/25" />
          <ProductSwitch
            active={app}
            onChange={onApp}
            products={PRODUCTS}
            logo={
              <div className="flex items-center gap-3 text-white">
                <LogoMark className="h-8 w-auto sm:h-10" />
                <span className="rounded-md border border-white/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/80">
                  {app === "leads" ? "Lead Hunter" : "Cloud"}
                </span>
              </div>
            }
          />
        </section>

        <section className="flex flex-col justify-center px-3 py-8 text-white sm:px-10 lg:px-14">
          <div className="mx-auto w-full max-w-sm">{children}</div>
          <p className="mt-10 text-center text-[11px] text-zinc-500">Team access only. One TOSS account for TOSS Cloud and TOSS Lead Hunter.</p>
        </section>
      </div>
    </div>
  );
}
