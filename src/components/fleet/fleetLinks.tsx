"use client";

import { createContext, useCallback, useContext } from "react";
import { useRouter } from "next/navigation";

// Where the fleet screens (Units, Trucks, Trailers, Drivers) link to. Inside a company they stay on
// Fleet & Company (/fleet?tab=…); on Equipment & Drivers (all companies) they stay on that page,
// so opening a truck, trailer or driver doesn't leave the section.

export type FleetPlace = "company" | "sections";
const Place = createContext<FleetPlace>("company");

export function FleetPlaceProvider({ value, children }: { value: FleetPlace; children: React.ReactNode }) {
  return <Place.Provider value={value}>{children}</Place.Provider>;
}

type FleetTab = "units" | "trucks" | "trailers" | "drivers";

/** href(tab) → that tab; href(tab, "truck", id) → that tab with the truck's sheet open. */
export function useFleetHref() {
  const place = useContext(Place);
  return useCallback(
    (tab: FleetTab, key?: string, id?: string | null) => {
      const extra = key && id ? `${key}=${id}` : "";
      if (place === "company") return `/fleet?tab=${tab}${extra ? `&${extra}` : ""}`;
      // Equipment & Drivers keeps the companies picked there (?co=…).
      const co = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("co") : null;
      return `/equipment?tab=${tab}${co ? `&co=${co}` : ""}${extra ? `&${extra}` : ""}`;
    },
    [place],
  );
}

/**
 * Open a truck / trailer / driver panel on the right without leaving the screen you're on (Units
 * stays Units): same page and tab, only the open panel changes.
 */
export function useOpenSheet() {
  const router = useRouter();
  return useCallback(
    (key: "truck" | "trailer" | "driver", id: string | null) => {
      const url = new URL(window.location.href);
      for (const k of ["truck", "trailer", "driver"]) url.searchParams.delete(k);
      if (id) url.searchParams.set(key, id);
      router.replace(`${url.pathname}${url.search}`, { scroll: false });
    },
    [router],
  );
}
