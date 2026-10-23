// Services a carrier can be active in (chosen on the company form) and where the sale came from.

import type { Company, ServiceKey, ServiceSource } from "./types";

export const SERVICES: { key: ServiceKey; label: string }[] = [
  { key: "dispatch", label: "Dispatch" },
  { key: "dot_compliance", label: "DOT Compliance" },
  { key: "mcpt", label: "MCPT" },
  { key: "accounting", label: "Accounting" },
  { key: "factoring", label: "Factoring" },
  { key: "fuel_card", label: "Fuel Card" },
  { key: "insurance", label: "Insurance" },
];

export const SOURCES: { v: ServiceSource; label: string }[] = [
  { v: "call_list", label: "Call list" },
  { v: "instagram", label: "Marketing · Instagram" },
  { v: "facebook", label: "Marketing · Facebook" },
  { v: "x", label: "Marketing · X" },
  { v: "email", label: "Marketing · Email" },
  { v: "text", label: "Marketing · Text" },
  { v: "whatsapp", label: "Marketing · WhatsApp" },
  { v: "linkedin", label: "Marketing · LinkedIn" },
  { v: "fiverr", label: "Marketing · Fiverr" },
  { v: "referral", label: "Referred by client" },
  { v: "cross_sale", label: "Cross sale" },
];

export const sourceLabel = (v?: ServiceSource | null) => SOURCES.find((s) => s.v === v)?.label ?? "";
export const serviceLabel = (k: ServiceKey) => SERVICES.find((s) => s.key === k)?.label ?? k;

export const hasService = (c: Pick<Company, "services"> | null | undefined, k: ServiceKey) => !!c?.services?.[k]?.on;
export const activeServices = (c: Pick<Company, "services"> | null | undefined) => SERVICES.filter((s) => hasService(c, s.key));
