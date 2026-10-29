import "server-only";

// What TOSS Copilot can change in TOSS Cloud. The model only proposes an action (a card in the
// chat); it runs here when the person clicks Confirm, with their own session, so the same access
// rules apply as for clicks. Every run is written to tms_copilot_actions.

import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient, adminConfigured } from "@/lib/server/admin";
import { upsertCarrier } from "@/lib/server/carriers";
import { hunterApi } from "./hunter";

const uuid = z.string().uuid();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date as YYYY-MM-DD");

/** Inputs of every action (also the tool schemas the model sees). */
export const ACTIONS = {
  create_company: z.object({
    name: z.string().trim().min(2).max(200).describe("Legal name"),
    dot_number: z.string().regex(/^\d{1,9}$/).optional().describe("USDOT number, digits"),
    mc_number: z.string().regex(/^\d{1,8}$/).optional().describe("MC number, digits"),
    stage: z.enum(["lead", "client"]).default("lead"),
    contact_first_name: z.string().max(80).optional(),
    contact_last_name: z.string().max(80).optional(),
    contact_phone: z.string().max(40).optional(),
    contact_email: z.string().email().optional(),
    notes: z.string().max(2000).optional(),
  }),
  add_lead_from_hunter: z.object({
    dot_number: z.string().regex(/^\d{1,9}$/).describe("USDOT number of the carrier in Lead Hunter"),
  }),
  add_company_note: z.object({
    company_id: uuid,
    note: z.string().trim().min(1).max(4000),
  }),
  create_case: z.object({
    kind: z.enum(["work", "customer_service"]).describe("work = a job TOSS does for the client; customer_service = a complaint, overcharge, suggestion"),
    company_id: uuid,
    title: z.string().trim().min(3).max(200),
    description: z.string().max(4000).optional(),
    priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
    due_date: day.optional(),
  }),
  create_opportunity: z.object({
    company_id: uuid,
    title: z.string().trim().min(3).max(200),
    service: z.enum(["dispatch", "dot_compliance", "mcpt", "accounting", "factoring", "fuel_card", "insurance", "other"]),
    value: z.number().min(0).max(10_000_000).default(0),
    expected_close: day.optional(),
  }),
  set_load_status: z.object({
    load_id: uuid,
    status: z.enum(["new", "booked", "in_transit", "delivered", "invoiced", "paid", "canceled_by_broker", "canceled_by_carrier"]),
  }),
  set_truck_availability: z.object({
    truck_id: uuid,
    current_location: z.string().max(120).optional().describe("City, ST"),
    available_date: day.nullable().optional().describe("null = ready now"),
  }),
} as const;

export type ActionName = keyof typeof ACTIONS;
export const ACTION_NAMES = Object.keys(ACTIONS) as ActionName[];

/** One line for the confirm card. */
export const ACTION_LABEL: Record<ActionName, string> = {
  create_company: "Add company",
  add_lead_from_hunter: "Add lead from Lead Hunter",
  add_company_note: "Add note to the company timeline",
  create_case: "Open a case",
  create_opportunity: "Create an opportunity",
  set_load_status: "Change load status",
  set_truck_availability: "Update truck location / availability",
};

type Me = { id: string; fullName: string; token: string | null };
type Result = { ok: true; message: string; href?: string; id?: string } | { ok: false; message: string };

export async function runAction(sb: SupabaseClient, me: Me, name: ActionName, raw: unknown): Promise<Result> {
  const parsed = ACTIONS[name].safeParse(raw);
  if (!parsed.success) return { ok: false, message: z.prettifyError(parsed.error) };
  const input = parsed.data as Record<string, unknown>;
  const fail = (e: { message: string } | null | undefined, fallback: string): Result => ({ ok: false, message: e?.message || fallback });
  /** Checks the change really landed: reads the row back with the person's own access. */
  const check = async (table: string, id: string, expect?: Record<string, unknown>): Promise<boolean> => {
    const { data } = await sb.from(table).select("*").eq("id", id).maybeSingle();
    if (!data) return false;
    return !expect || Object.entries(expect).every(([k, v]) => (data as Record<string, unknown>)[k] === v);
  };
  const notSeen = (what: string): Result => ({ ok: false, message: `${what} didn't save (I checked and it isn't there). Try again or add it from the page.` });

  switch (name) {
    case "create_company": {
      const i = input as z.infer<typeof ACTIONS.create_company>;
      if (i.dot_number) {
        const { data: twin } = await sb.from("tms_companies").select("id,name").eq("dot_number", i.dot_number).maybeSingle();
        if (twin) return { ok: false, message: `${twin.name} already has USDOT ${i.dot_number}.` };
      }
      const { data, error } = await sb
        .from("tms_companies")
        .insert({
          name: i.name,
          dot_number: i.dot_number ?? null,
          mc_number: i.mc_number ? i.mc_number.replace(/\D/g, "") : null,
          stage: i.stage,
          contact_first_name: i.contact_first_name ?? null,
          contact_last_name: i.contact_last_name ?? null,
          contact_name: [i.contact_first_name, i.contact_last_name].filter(Boolean).join(" ") || null,
          contact_phone: i.contact_phone ?? null,
          contact_email: i.contact_email ?? null,
          notes: i.notes ?? null,
          created_by: me.id,
          ...(i.stage === "client" ? { became_client_at: new Date().toISOString() } : {}),
        })
        .select("id,name")
        .single();
      if (error) return fail(error, "Couldn't add the company");
      if (!(await check("tms_companies", data.id))) return notSeen(data.name);
      return { ok: true, message: `${data.name} added as a ${i.stage}. Checked: it's in Companies.`, id: data.id, href: `/fleet?company=${data.id}` };
    }

    case "add_lead_from_hunter": {
      const i = input as z.infer<typeof ACTIONS.add_lead_from_hunter>;
      if (!me.token) return { ok: false, message: "Sign in again." };
      const lead = (await hunterApi(me.token, `/v1/leads/${i.dot_number}`)) as Record<string, unknown> | null;
      if (!lead) return { ok: false, message: `Lead Hunter has no carrier with USDOT ${i.dot_number}.` };
      if (!adminConfigured()) return { ok: false, message: "The server key for adding carriers isn't set." };
      const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
      const officer = s(lead.officer1) || "";
      const r = await upsertCarrier(
        adminClient(),
        {
          contactId: null,
          type: "lead",
          dot: i.dot_number,
          // Cloud keeps MC numbers as digits ("1291694"); Lead Hunter writes "MC1291694".
          mc: s(lead.mcNumber)?.replace(/\D/g, "") || null,
          name: s(lead.legalName),
          dba: s(lead.dbaName),
          ein: null,
          firstName: officer.split(/\s+/)[0] || null,
          lastName: officer.split(/\s+/).slice(1).join(" ") || null,
          phone: s(lead.phone) || s(lead.cellPhone),
          email: s(lead.email),
          street: s(lead.phyStreet),
          city: s(lead.phyCity),
          state: s(lead.phyState),
          zip: s(lead.phyZip),
          secondFirst: null,
          secondLast: null,
          services: [],
          source: null,
          referredBy: null,
          soldBy: me.fullName,
        },
        "TOSS Copilot",
        "lead",
      );
      if (!r.companyId) return { ok: false, message: r.message };
      if (!(await check("tms_companies", r.companyId))) return notSeen(s(lead.legalName) || "The company");
      return {
        ok: true,
        message: r.action === "created" ? `${s(lead.legalName)} added to Companies as a lead. Checked: it's there.` : `${s(lead.legalName)} was already in Companies; I filled in what was missing.`,
        id: r.companyId,
        href: `/fleet?company=${r.companyId}`,
      };
    }

    case "add_company_note": {
      const i = input as z.infer<typeof ACTIONS.add_company_note>;
      const { data, error } = await sb.from("tms_company_events").insert({ company_id: i.company_id, kind: "note", message: i.note, actor_id: me.id, actor_name: me.fullName }).select("id").single();
      if (error) return fail(error, "Couldn't add the note");
      if (!(await check("tms_company_events", data.id))) return notSeen("The note");
      return { ok: true, message: "Note added to the timeline. Checked: it's there.", href: `/fleet?company=${i.company_id}&tab=profile` };
    }

    case "create_case": {
      const i = input as z.infer<typeof ACTIONS.create_case>;
      const { data, error } = await sb
        .from("tms_cases")
        .insert({ kind: i.kind, company_id: i.company_id, title: i.title, description: i.description ?? null, priority: i.priority, due_date: i.due_date ?? null, status: "open", owner_id: me.id, created_by: me.id })
        .select("id,number")
        .single();
      if (error) return fail(error, "Couldn't open the case");
      if (!(await check("tms_cases", data.id))) return notSeen("The case");
      const base = i.kind === "work" ? "/cases" : "/customer-service";
      return { ok: true, message: `Case #${data.number} opened. Checked: it's there.`, id: data.id, href: `${base}?case=${data.id}` };
    }

    case "create_opportunity": {
      const i = input as z.infer<typeof ACTIONS.create_opportunity>;
      const { data: pipe } = await sb.from("tms_pipelines").select("id").eq("active", true).order("sort").limit(1).maybeSingle();
      if (!pipe) return { ok: false, message: "There is no active pipeline in Sales." };
      const { data: stage } = await sb.from("tms_pipeline_stages").select("id").eq("pipeline_id", pipe.id).order("sort").limit(1).maybeSingle();
      const { data, error } = await sb
        .from("tms_opportunities")
        .insert({ company_id: i.company_id, title: i.title, service: i.service, value: i.value, expected_close: i.expected_close ?? null, pipeline_id: pipe.id, stage_id: stage?.id ?? null, status: "open", owner_id: me.id, created_by: me.id, source: "TOSS Copilot" })
        .select("id,number")
        .single();
      if (error) return fail(error, "Couldn't create the opportunity");
      if (!(await check("tms_opportunities", data.id))) return notSeen("The opportunity");
      return { ok: true, message: `Opportunity #${data.number} created. Checked: it's in Sales.`, id: data.id, href: `/sales?tab=opportunities&opp=${data.id}` };
    }

    case "set_load_status": {
      const i = input as z.infer<typeof ACTIONS.set_load_status>;
      const { data, error } = await sb.from("tms_loads").update({ status: i.status }).eq("id", i.load_id).select("id,load_number").single();
      if (error) return fail(error, "Couldn't change the status");
      if (!(await check("tms_loads", data.id, { status: i.status }))) return notSeen("The status change");
      return { ok: true, message: `Load ${data.load_number || ""} is now ${i.status.replace(/_/g, " ")}.`.replace("  ", " "), href: `/loads/${data.id}` };
    }

    case "set_truck_availability": {
      const i = input as z.infer<typeof ACTIONS.set_truck_availability>;
      const patch: Record<string, unknown> = {};
      if (i.current_location !== undefined) patch.current_location = i.current_location;
      if (i.available_date !== undefined) patch.available_date = i.available_date;
      if (!Object.keys(patch).length) return { ok: false, message: "Nothing to change." };
      const { data, error } = await sb.from("tms_trucks").update(patch).eq("id", i.truck_id).select("id,unit_number,company_id").single();
      if (error) return fail(error, "Couldn't update the truck");
      if (!(await check("tms_trucks", data.id, patch))) return notSeen("The truck update");
      return { ok: true, message: `Unit ${data.unit_number} updated.`, href: `/fleet?company=${data.company_id}&tab=trucks&truck=${data.id}` };
    }
  }
}
