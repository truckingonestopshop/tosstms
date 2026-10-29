"use client";

import { createContext, useContext } from "react";
import { useLiveTable } from "@/lib/live";
import type { Agreement, LostReason, OppField, OppItem, OppTask, Opportunity, Pipeline, Product, Stage, Template } from "@/lib/sales";

// Sales data (pipelines, stages, opportunities with their products and tasks, lost reasons, custom
// fields, products, templates, agreements), loaded once for the Sales section and kept live.

function useSalesData() {
  return {
    pipelines: useLiveTable<Pipeline>("tms_pipelines", { order: "sort", ascending: true }),
    stages: useLiveTable<Stage>("tms_pipeline_stages", { order: "sort", ascending: true }),
    opps: useLiveTable<Opportunity>("tms_opportunities"),
    items: useLiveTable<OppItem>("tms_opportunity_items", { order: "sort", ascending: true }),
    tasks: useLiveTable<OppTask>("tms_opportunity_tasks", { order: "created_at", ascending: true }),
    reasons: useLiveTable<LostReason>("tms_lost_reasons", { order: "sort", ascending: true }),
    fields: useLiveTable<OppField>("tms_opportunity_fields", { order: "sort", ascending: true }),
    products: useLiveTable<Product>("tms_products", { order: "sort", ascending: true }),
    templates: useLiveTable<Template>("tms_templates", { order: "name", ascending: true }),
    agreements: useLiveTable<Agreement>("tms_agreements"),
  };
}
export type SalesData = ReturnType<typeof useSalesData>;

const Ctx = createContext<SalesData | null>(null);

export function SalesProvider({ children }: { children: React.ReactNode }) {
  const data = useSalesData();
  return <Ctx.Provider value={data}>{children}</Ctx.Provider>;
}

export function useSales() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSales outside SalesProvider");
  return v;
}

/** Stages of a pipeline, in order. */
export const stagesOf = (stages: Stage[], pipelineId: string | null | undefined) => stages.filter((s) => s.pipeline_id === pipelineId).sort((a, b) => a.sort - b.sort);
