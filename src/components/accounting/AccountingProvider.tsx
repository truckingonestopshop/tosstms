"use client";

import { createContext, useContext } from "react";
import { useAccounting, type Accounting } from "@/lib/useAccounting";

// TOSS Accounting's data, loaded once for all its pages and kept live.

const Ctx = createContext<Accounting | null>(null);

export function AccountingProvider({ children }: { children: React.ReactNode }) {
  const acc = useAccounting();
  return <Ctx.Provider value={acc}>{children}</Ctx.Provider>;
}

export function useAcc() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAcc outside AccountingProvider");
  return v;
}
