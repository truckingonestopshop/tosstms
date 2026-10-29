"use client";

import { useEffect, useState } from "react";
import { sb } from "./db";
import { useLiveTable } from "./live";
import type { AccAccount, AccCategory, AccField, AccMerchant, AccMethod, AccRecurring, AccSettings, AccTransaction } from "./accounting";

/** Everything TOSS Accounting reads, kept live. */
export function useAccounting() {
  const accounts = useLiveTable<AccAccount>("acc_accounts", { order: "name", ascending: true });
  const categories = useLiveTable<AccCategory>("acc_categories", { order: "sort", ascending: true });
  const merchants = useLiveTable<AccMerchant>("acc_merchants", { order: "name", ascending: true });
  const methods = useLiveTable<AccMethod>("acc_payment_methods", { order: "name", ascending: true });
  const fields = useLiveTable<AccField>("acc_custom_fields", { order: "sort", ascending: true });
  const recurring = useLiveTable<AccRecurring>("acc_recurring", { order: "next_date", ascending: true });
  const txs = useLiveTable<AccTransaction>("acc_transactions", { order: "date" });
  const [settings, setSettings] = useState<AccSettings | null>(null);
  useEffect(() => {
    let alive = true;
    sb()
      .from("acc_settings")
      .select("*")
      .eq("id", 1)
      .maybeSingle()
      .then(({ data }) => alive && setSettings((data as AccSettings) || { id: 1, require_receipt: true, require_proof: true }));
    return () => {
      alive = false;
    };
  }, []);
  const loaded = accounts.loaded && categories.loaded && txs.loaded;
  return { accounts, categories, merchants, methods, fields, recurring, txs, settings, setSettings, loaded };
}
export type Accounting = ReturnType<typeof useAccounting>;
