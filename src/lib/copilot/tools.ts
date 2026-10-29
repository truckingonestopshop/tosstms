import "server-only";

// TOSS Copilot's tools in TOSS Cloud.
// - Read tools run on their own, with the person's session (RLS), so Copilot sees exactly what
//   they can see on screen. Results are trimmed to what an answer needs.
// - Lead Hunter tools call Lead Hunter's API with the same token (the data Lead Hunter's own
//   Copilot uses).
// - Actions (propose_*) have no server code: the model's call shows a confirm card; the action runs
//   only when the person clicks Confirm (POST /api/copilot/act).
// - navigate and suggest_replies are handled in the browser.

import { tool, type InferUITools } from "ai";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fleetPaperwork } from "@/lib/docs";
import type { Company, DocType, DocumentItem, Driver, Trailer, Truck } from "@/lib/types";
import { ACTIONS, type ActionName } from "./actions";
import { HunterError, hunterApi } from "./hunter";

type Row = Record<string, unknown>;
const uuid = z.string().uuid();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const LIMIT = 25;
/** What a confirm card records once the person clicked (or declined). */
export const CARD_OUT = z.object({ ok: z.boolean(), message: z.string(), href: z.string().optional(), declined: z.boolean().optional() });

/** Rows without empty values (smaller for the model). */
const compact = (r: Row) => Object.fromEntries(Object.entries(r).filter(([, v]) => v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && !v.length)));
const fee = (l: { gross_amount: unknown; commission_percent: unknown }) => Math.round(Number(l.gross_amount || 0) * Number(l.commission_percent || 0)) / 100;
const activeServices = (s: unknown) =>
  Object.entries((s as Record<string, { on?: boolean; activation_date?: string | null }>) || {})
    .filter(([, v]) => v?.on)
    .map(([k, v]) => (v.activation_date ? `${k} (since ${v.activation_date})` : k));

function periodRange(p: string, today: string): { from: string; to: string } {
  const d = new Date(`${today}T12:00:00`);
  const ymd = (x: Date) => x.toISOString().slice(0, 10);
  if (p === "last_month") return { from: ymd(new Date(d.getFullYear(), d.getMonth() - 1, 1)), to: ymd(new Date(d.getFullYear(), d.getMonth(), 0)) };
  if (p === "last_90_days") return { from: ymd(new Date(d.getTime() - 89 * 86400000)), to: today };
  if (p === "this_year") return { from: `${d.getFullYear()}-01-01`, to: today };
  if (p === "all_time") return { from: "1900-01-01", to: today };
  return { from: ymd(new Date(d.getFullYear(), d.getMonth(), 1)), to: today };
}

export interface ToolContext {
  sb: SupabaseClient;
  me: { id: string; fullName: string; token: string | null; accounting: boolean };
  today: string;
}

/** A Lead Hunter call that answers the model with a readable error instead of failing the chat. */
async function hunter(ctx: ToolContext, path: string, body?: unknown) {
  if (!ctx.me.token) return { error: "Sign in again to reach Lead Hunter." };
  try {
    return await hunterApi(ctx.me.token, path, body);
  } catch (e) {
    return { error: e instanceof HunterError ? e.message : "Lead Hunter didn't answer." };
  }
}

const HUNTER_FILTER = z
  .record(z.string(), z.unknown())
  .describe(
    "Lead Hunter filter (same keys as its filter panel). Common keys: countries ['US'], states ['US-TX'] (COUNTRY-STATE codes), " +
      "entityTypes ['carrier'|'broker'], classdef ['AUTHORIZED FOR HIRE'], status ['A'] (active, not out of service), " +
      "authorityTypes ['carrier_property'|'broker_property'], authorityStatus ['active'|'pending'|'inactive'|'none'], " +
      "authorityAgeDays {min,max} (days since authority granted), companyAgeDays {min,max}, powerUnits {min,max} (trucks), drivers {min,max}, " +
      "cargoTypes ['general_freight','produce','refrigerated_food',…], hazmat true, insuranceStatus ['active'|'pending'|'none'], renewalMonths [1-12], " +
      "safetyRatings ['S'|'C'|'U'|'NONE'], inspectedWithinDays n, hasEmail true, hasPhone true, q 'name or DOT text', " +
      "sort {field:'authority_granted_date'|'power_units'|'last_inspection_date'|…, dir:'asc'|'desc'}. A bad key comes back as an error: fix and retry.",
  );

export function copilotTools(ctx: ToolContext) {
  const { sb } = ctx;
  const rows = async (q: PromiseLike<{ data: unknown; error: { message: string } | null }>) => {
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data || []) as Row[];
  };
  const names = async (table: "tms_companies" | "tms_drivers" | "tms_trucks", ids: unknown[]) => {
    const list = [...new Set(ids.filter(Boolean))] as string[];
    if (!list.length) return new Map<string, string>();
    const col = table === "tms_trucks" ? "id,unit_number" : "id,name";
    const r = await rows(sb.from(table).select(col).in("id", list));
    return new Map(r.map((x) => [x.id as string, String(x.name ?? `Unit ${x.unit_number}`)]));
  };

  const read = {
    find_companies: tool({
      description:
        "Find carrier companies in TOSS Cloud by name, USDOT, MC or contact; or list them (no query). Returns id (use it in other tools), name, DOT/MC, stage (lead/client), status, active services.",
      inputSchema: z.object({
        query: z.string().trim().max(120).optional(),
        stage: z.enum(["lead", "client"]).optional(),
        service: z.enum(["dispatch", "dot_compliance", "mcpt", "accounting", "factoring", "fuel_card", "insurance"]).optional().describe("only companies active in this service"),
        limit: z.number().int().min(1).max(100).default(LIMIT),
      }),
      execute: async ({ query, stage, service, limit }) => {
        let q = sb.from("tms_companies").select("id,name,dba_name,dot_number,mc_number,stage,status,services,contact_name,contact_phone,commission_percent").order("name").limit(500);
        if (stage) q = q.eq("stage", stage);
        if (query) {
          const t = query.replace(/[%,()]/g, " ").trim();
          q = q.or(`name.ilike.%${t}%,dba_name.ilike.%${t}%,dot_number.ilike.%${t}%,mc_number.ilike.%${t}%,contact_name.ilike.%${t}%`);
        }
        let list = await rows(q);
        if (service) list = list.filter((c) => (c.services as Record<string, { on?: boolean }> | null)?.[service]?.on);
        return { total: list.length, companies: list.slice(0, limit).map((c) => compact({ ...c, services: activeServices(c.services) })) };
      },
    }),

    company_details: tool({
      description:
        "Everything about one company: profile, contacts, services (with set up dates), dispatch fee %, safety snapshot, counts of trucks/trailers/drivers, open loads, unpaid invoices, open cases and opportunities, latest timeline notes.",
      inputSchema: z.object({ company_id: uuid }),
      execute: async ({ company_id }) => {
        const [c] = await rows(sb.from("tms_companies").select("*").eq("id", company_id).limit(1));
        if (!c) return { error: "No company with that id (or no access)." };
        const [trucks, trailers, drivers, loads, invoices, cases, opps, events] = await Promise.all([
          rows(sb.from("tms_trucks").select("status").eq("company_id", company_id)),
          rows(sb.from("tms_trailers").select("status").eq("company_id", company_id)),
          rows(sb.from("tms_drivers").select("status,termination_date").eq("company_id", company_id)),
          rows(sb.from("tms_loads").select("status").eq("company_id", company_id).in("status", ["new", "booked", "in_transit", "delivered"])),
          rows(sb.from("tms_invoices").select("status,total_due,amount_paid,due_date").eq("company_id", company_id).in("status", ["sent", "draft"])),
          rows(sb.from("tms_cases").select("status").eq("company_id", company_id).neq("status", "closed")),
          rows(sb.from("tms_opportunities").select("status,value").eq("company_id", company_id).eq("status", "open")),
          rows(sb.from("tms_company_events").select("kind,message,actor_name,created_at").eq("company_id", company_id).order("created_at", { ascending: false }).limit(8)),
        ]);
        const comp = (c.compliance || {}) as { safety_rating?: string; fmcsa?: Row };
        return {
          company: compact({
            id: c.id, name: c.name, dba: c.dba_name, dot: c.dot_number, mc: c.mc_number, stage: c.stage, status: c.status, dot_status: c.dot_status, mc_status: c.mc_status,
            client_since: c.became_client_at, address: [c.street, c.city, c.state, c.zip].filter(Boolean).join(", ") || c.address,
            contact: compact({ name: c.contact_name, phone: c.contact_phone, email: c.contact_email }),
            secondary: compact({ name: [c.secondary_first_name, c.secondary_last_name].filter(Boolean).join(" "), title: c.secondary_title, phone: c.secondary_phone, email: c.secondary_email }),
            services: activeServices(c.services), dispatch_fee_percent: c.commission_percent, billing: c.billing_cadence, factoring: c.factoring_company, notes: c.notes,
            safety: compact({ rating: comp.safety_rating, fmcsa: comp.fmcsa ? compact(comp.fmcsa as Row) : null }),
          }),
          counts: {
            trucks_active: trucks.filter((t) => t.status === "active").length, trucks_total: trucks.length, trailers: trailers.length,
            drivers_active: drivers.filter((d) => d.status === "active" && !d.termination_date).length, drivers_total: drivers.length,
            open_loads: loads.length, unpaid_invoices: invoices.filter((i) => i.status === "sent").length,
            unpaid_amount: Math.round(invoices.filter((i) => i.status === "sent").reduce((s, i) => s + Number(i.total_due || 0) - Number(i.amount_paid || 0), 0) * 100) / 100,
            open_cases: cases.length, open_opportunities: opps.length, pipeline_value: opps.reduce((s, o) => s + Number(o.value || 0), 0),
          },
          timeline: events.map(compact),
          page: `/fleet?company=${company_id}`,
        };
      },
    }),

    loads: tool({
      description:
        "Loads (dispatch). Filter by company, status, pickup date range or a text search (load #, broker, city). Each row: id, load #, status, lane, pickup/delivery, gross, TOSS fee, driver, truck, broker. Also totals.",
      inputSchema: z.object({
        company_id: uuid.optional(),
        status: z.array(z.enum(["new", "booked", "in_transit", "delivered", "invoiced", "paid", "canceled_by_broker", "canceled_by_carrier"])).optional(),
        from: day.optional().describe("pickup on/after"),
        to: day.optional().describe("pickup on/before"),
        search: z.string().trim().max(80).optional(),
        limit: z.number().int().min(1).max(100).default(LIMIT),
      }),
      execute: async ({ company_id, status, from, to, search, limit }) => {
        let q = sb
          .from("tms_loads")
          .select("id,load_number,status,company_id,driver_id,truck_id,broker_name,origin_city,origin_state,destination_city,destination_state,pickup_date,delivery_date,gross_amount,commission_percent,loaded_miles")
          .order("pickup_date", { ascending: false, nullsFirst: false })
          .limit(1000);
        if (company_id) q = q.eq("company_id", company_id);
        if (status?.length) q = q.in("status", status);
        if (from) q = q.gte("pickup_date", from);
        if (to) q = q.lte("pickup_date", to);
        if (search) {
          const t = search.replace(/[%,()]/g, " ").trim();
          q = q.or(`load_number.ilike.%${t}%,broker_name.ilike.%${t}%,origin_city.ilike.%${t}%,destination_city.ilike.%${t}%,rate_con_number.ilike.%${t}%`);
        }
        const list = await rows(q);
        const [co, dr, tr] = await Promise.all([names("tms_companies", list.map((l) => l.company_id)), names("tms_drivers", list.map((l) => l.driver_id)), names("tms_trucks", list.map((l) => l.truck_id))]);
        const gross = list.reduce((s, l) => s + Number(l.gross_amount || 0), 0);
        return {
          total: list.length,
          total_gross: Math.round(gross),
          total_toss_fee: Math.round(list.reduce((s, l) => s + fee(l as never), 0)),
          loads: list.slice(0, limit).map((l) =>
            compact({
              id: l.id, load_number: l.load_number, status: l.status, company: co.get(l.company_id as string), lane: `${l.origin_city}, ${l.origin_state} → ${l.destination_city}, ${l.destination_state}`,
              pickup: l.pickup_date, delivery: l.delivery_date, gross: l.gross_amount, toss_fee: fee(l as never), miles: l.loaded_miles, driver: dr.get(l.driver_id as string), truck: tr.get(l.truck_id as string), broker: l.broker_name, page: `/loads/${l.id}`,
            }),
          ),
        };
      },
    }),

    load_details: tool({
      description: "One load in full (stops, broker contact, rate, notes, documents on file) by id or load number.",
      inputSchema: z.object({ load_id: uuid.optional(), load_number: z.string().max(60).optional() }),
      execute: async ({ load_id, load_number }) => {
        if (!load_id && !load_number) return { error: "Give load_id or load_number." };
        let q = sb.from("tms_loads").select("*").limit(1);
        q = load_id ? q.eq("id", load_id) : q.ilike("load_number", load_number!);
        const [l] = await rows(q);
        if (!l) return { error: "Load not found." };
        const docs = await rows(sb.from("tms_documents").select("doc_type,file_name,uploaded_at").eq("load_id", l.id));
        const [co, dr, tr] = await Promise.all([names("tms_companies", [l.company_id]), names("tms_drivers", [l.driver_id]), names("tms_trucks", [l.truck_id])]);
        return {
          load: compact({ ...l, company: co.get(l.company_id as string), driver: dr.get(l.driver_id as string), truck: tr.get(l.truck_id as string), toss_fee: fee(l as never), internal_notes: l.internal_notes, page: `/loads/${l.id}` }),
          documents: docs,
        };
      },
    }),

    fleet: tool({
      description:
        "Trucks, trailers or drivers, for one company or all. Trucks: unit, VIN, plate, status, driver, trailer, location, availability, owned/leased. Drivers: license, expiries, phone, status, hired/terminated, truck. Trailers: unit, type, length, plate, hooked truck.",
      inputSchema: z.object({
        kind: z.enum(["trucks", "trailers", "drivers"]),
        company_id: uuid.optional(),
        search: z.string().trim().max(80).optional().describe("unit, VIN, plate, name, phone or license #"),
        include_inactive: z.boolean().default(false),
        limit: z.number().int().min(1).max(100).default(LIMIT),
      }),
      execute: async ({ kind, company_id, search, include_inactive, limit }) => {
        const table = kind === "trucks" ? "tms_trucks" : kind === "trailers" ? "tms_trailers" : "tms_drivers";
        let q = sb.from(table).select("*").limit(1000);
        if (company_id) q = q.eq("company_id", company_id);
        let list = await rows(q);
        if (!include_inactive) list = list.filter((x) => x.status !== "inactive" && !x.termination_date);
        if (search) {
          const t = search.toLowerCase();
          list = list.filter((x) => [x.unit_number, x.vin_number, x.plate, x.name, x.phone, x.cdl_number, x.email].some((v) => String(v || "").toLowerCase().includes(t)));
        }
        const co = await names("tms_companies", list.map((x) => x.company_id));
        const drv = kind === "trucks" ? await names("tms_drivers", list.map((x) => x.assigned_driver_id)) : new Map<string, string>();
        const pick = (x: Row) =>
          kind === "trucks"
            ? { id: x.id, unit: x.unit_number, company: co.get(x.company_id as string), status: x.status, vin: x.vin_number, plate: x.plate, plate_state: x.plate_state, year: x.year, make: x.make, model: x.model, driver: drv.get(x.assigned_driver_id as string), trailer: x.trailer_number, equipment: [x.trailer_length, x.trailer_type].filter(Boolean).join(" "), location: x.current_location, available_from: x.available_date, ownership: x.ownership, page: `/fleet?company=${x.company_id}&tab=trucks&truck=${x.id}` }
            : kind === "trailers"
              ? { id: x.id, unit: x.unit_number, company: co.get(x.company_id as string), status: x.status, type: x.trailer_type, length: x.trailer_length, plate: x.plate, vin: x.vin_number, ownership: x.ownership, page: `/fleet?company=${x.company_id}&tab=trailers&trailer=${x.id}` }
              : { id: x.id, name: x.name, company: co.get(x.company_id as string), status: x.termination_date || x.status === "inactive" ? "terminated" : "active", phone: x.phone, email: x.email, license: [x.license_type, x.cdl_number, x.cdl_state].filter(Boolean).join(" "), license_expires: x.cdl_expiry, medical_expires: x.medical_card_expiry, dob: x.dob, hired: x.hire_date, terminated: x.termination_date, page: `/fleet?company=${x.company_id}&tab=drivers&driver=${x.id}` };
        return { total: list.length, [kind]: list.slice(0, limit).map((x) => compact(pick(x))) };
      },
    }),

    invoices: tool({
      description: "Invoices TOSS sent to carriers (dispatch fees and custom). Filter by company, status, overdue. Rows: number, company, status, issue/due dates, total, paid, balance. Also totals.",
      inputSchema: z.object({
        company_id: uuid.optional(),
        status: z.array(z.enum(["draft", "sent", "paid", "void"])).optional(),
        overdue_only: z.boolean().default(false),
        limit: z.number().int().min(1).max(100).default(LIMIT),
      }),
      execute: async ({ company_id, status, overdue_only, limit }) => {
        let q = sb.from("tms_invoices").select("id,invoice_number,invoice_type,status,company_id,bill_to_name,issue_date,due_date,total_due,amount_paid").order("issue_date", { ascending: false }).limit(1000);
        if (company_id) q = q.eq("company_id", company_id);
        if (status?.length) q = q.in("status", status);
        let list = await rows(q);
        if (overdue_only) list = list.filter((i) => i.status === "sent" && i.due_date && String(i.due_date) < ctx.today);
        const co = await names("tms_companies", list.map((i) => i.company_id));
        const bal = (i: Row) => Math.round((Number(i.total_due || 0) - Number(i.amount_paid || 0)) * 100) / 100;
        return {
          total: list.length,
          total_billed: Math.round(list.reduce((s, i) => s + Number(i.total_due || 0), 0)),
          total_open_balance: Math.round(list.filter((i) => i.status === "sent").reduce((s, i) => s + bal(i), 0)),
          invoices: list.slice(0, limit).map((i) => compact({ id: i.id, number: i.invoice_number, type: i.invoice_type, status: i.status, company: co.get(i.company_id as string) || i.bill_to_name, issued: i.issue_date, due: i.due_date, total: i.total_due, paid: i.amount_paid, balance: bal(i), overdue: i.status === "sent" && i.due_date && String(i.due_date) < ctx.today, page: `/invoices/${i.id}` })),
        };
      },
    }),

    paperwork: tool({
      description:
        "Paperwork to-dos (the same rules as Pending): documents missing, expired or expiring within 30 days for carriers, drivers, trucks and trailers. Optionally one company.",
      inputSchema: z.object({ company_id: uuid.optional(), limit: z.number().int().min(1).max(200).default(60) }),
      execute: async ({ company_id, limit }) => {
        const of = (table: string, cols: string) => {
          const q = sb.from(table).select(cols);
          return company_id ? q.eq(table === "tms_companies" ? "id" : "company_id", company_id) : q;
        };
        const [companies, drivers, trucks, trailers, documents, docTypes] = await Promise.all([
          rows(of("tms_companies", "id,name,status")),
          rows(of("tms_drivers", "id,company_id,name,status,termination_date,waived_docs,cdl_expiry")),
          rows(of("tms_trucks", "id,company_id,unit_number,status")),
          rows(of("tms_trailers", "id,company_id,unit_number,status")),
          rows(of("tms_documents", "*")),
          rows(sb.from("tms_doc_types").select("*")),
        ]);
        const holders = fleetPaperwork({
          companies: companies as unknown as Company[],
          drivers: drivers as unknown as Driver[],
          trucks: trucks as unknown as Truck[],
          trailers: trailers as unknown as Trailer[],
          documents: documents as unknown as DocumentItem[],
          docTypes: docTypes as unknown as DocType[],
        });
        const co = new Map(companies.map((c) => [c.id as string, c.name as string]));
        const items = holders.flatMap((h) =>
          [...h.bad, ...h.soon].map((i) => compact({ company: co.get(h.companyId), who: h.name, document: i.type.name, state: i.state, expires: i.doc?.expires_on, page: h.href })),
        );
        const order: Record<string, number> = { expired: 0, missing: 1, soon: 2, no_date: 3 };
        items.sort((a, b) => (order[a.state as string] ?? 9) - (order[b.state as string] ?? 9));
        return { total: items.length, expired: items.filter((i) => i.state === "expired").length, missing: items.filter((i) => i.state === "missing").length, expiring_30_days: items.filter((i) => i.state === "soon").length, items: items.slice(0, limit) };
      },
    }),

    sales: tool({
      description: "Sales opportunities (pipelines): title, company, stage, status (open/won/lost), value, service, owner, expected close. Filter by company or status.",
      inputSchema: z.object({ company_id: uuid.optional(), status: z.enum(["open", "won", "lost", "abandoned"]).optional(), limit: z.number().int().min(1).max(100).default(LIMIT) }),
      execute: async ({ company_id, status, limit }) => {
        let q = sb.from("tms_opportunities").select("id,number,title,company_id,status,value,service,expected_close,stage_id,owner_id,created_at").order("created_at", { ascending: false }).limit(500);
        if (company_id) q = q.eq("company_id", company_id);
        if (status) q = q.eq("status", status);
        const list = await rows(q);
        const [co, stages, members] = await Promise.all([
          names("tms_companies", list.map((o) => o.company_id)),
          rows(sb.from("tms_pipeline_stages").select("id,name")),
          rows(sb.from("tms_members").select("user_id,full_name")),
        ]);
        const st = new Map(stages.map((s) => [s.id as string, s.name as string]));
        const mb = new Map(members.map((m) => [m.user_id as string, m.full_name as string]));
        return {
          total: list.length,
          open_value: list.filter((o) => o.status === "open").reduce((s, o) => s + Number(o.value || 0), 0),
          opportunities: list.slice(0, limit).map((o) => compact({ id: o.id, number: o.number, title: o.title, company: co.get(o.company_id as string), status: o.status, stage: st.get(o.stage_id as string), value: o.value, service: o.service, owner: mb.get(o.owner_id as string), expected_close: o.expected_close, page: `/sales?tab=opportunities&opp=${o.id}` })),
        };
      },
    }),

    cases: tool({
      description: "Cases (work TOSS does for clients) and customer service cases. Filter by kind, company, open/closed.",
      inputSchema: z.object({ kind: z.enum(["work", "customer_service"]).optional(), company_id: uuid.optional(), open_only: z.boolean().default(true), limit: z.number().int().min(1).max(100).default(LIMIT) }),
      execute: async ({ kind, company_id, open_only, limit }) => {
        let q = sb.from("tms_cases").select("id,number,kind,title,category,status,priority,company_id,due_date,owner_id,updated_at").order("updated_at", { ascending: false }).limit(500);
        if (kind) q = q.eq("kind", kind);
        if (company_id) q = q.eq("company_id", company_id);
        if (open_only) q = q.neq("status", "closed");
        const list = await rows(q);
        const co = await names("tms_companies", list.map((c) => c.company_id));
        return { total: list.length, cases: list.slice(0, limit).map((c) => compact({ ...c, company: co.get(c.company_id as string), company_id: undefined, owner_id: undefined, page: `${c.kind === "work" ? "/cases" : "/customer-service"}?case=${c.id}` })) };
      },
    }),

    business_summary: tool({
      description:
        "TOSS's numbers for a period: loads, carriers' gross, TOSS dispatch fees, invoices billed and collected, new clients, open pipeline. Optionally one company.",
      inputSchema: z.object({ period: z.enum(["this_month", "last_month", "last_90_days", "this_year", "all_time"]).default("this_month"), company_id: uuid.optional() }),
      execute: async ({ period, company_id }) => {
        const r = periodRange(period, ctx.today);
        let lq = sb.from("tms_loads").select("status,gross_amount,commission_percent,pickup_date").gte("pickup_date", r.from).lte("pickup_date", r.to);
        let iq = sb.from("tms_invoices").select("status,total_due,issue_date").gte("issue_date", r.from).lte("issue_date", r.to);
        if (company_id) {
          lq = lq.eq("company_id", company_id);
          iq = iq.eq("company_id", company_id);
        }
        const [loads, invoices, payments, clients] = await Promise.all([
          rows(lq),
          rows(iq),
          rows(sb.from("tms_invoice_payments").select("amount,paid_on,invoice_id").gte("paid_on", r.from).lte("paid_on", r.to)),
          rows(sb.from("tms_companies").select("id,became_client_at").gte("became_client_at", r.from)),
        ]);
        const live = loads.filter((l) => !String(l.status).startsWith("canceled"));
        return {
          period: r,
          loads: live.length,
          carriers_gross: Math.round(live.reduce((s, l) => s + Number(l.gross_amount || 0), 0)),
          toss_dispatch_fees: Math.round(live.reduce((s, l) => s + fee(l as never), 0)),
          invoices_billed: Math.round(invoices.filter((i) => i.status !== "void").reduce((s, i) => s + Number(i.total_due || 0), 0)),
          collected: company_id ? undefined : Math.round(payments.reduce((s, p) => s + Number(p.amount || 0), 0)),
          new_clients: company_id ? undefined : clients.length,
        };
      },
    }),

    team: tool({
      description: "The TOSS Cloud team: names, roles, positions, phones, emails.",
      inputSchema: z.object({}),
      execute: async () => ({ members: (await rows(sb.from("tms_members").select("full_name,email,role,position,phone,phone_ext").order("full_name"))).map(compact) }),
    }),

    accounting_summary: tool({
      description: "TOSS's own money (TOSS Accounting): money in / out for a period, by category, and account balances. Only for people with Accounting access.",
      inputSchema: z.object({ period: z.enum(["this_month", "last_month", "last_90_days", "this_year", "all_time"]).default("this_month") }),
      execute: async ({ period }) => {
        if (!ctx.me.accounting) return { error: "This person doesn't have TOSS Accounting access." };
        const r = periodRange(period, ctx.today);
        const [txs, cats, accounts] = await Promise.all([
          rows(sb.from("acc_transactions").select("kind,amount,date,category_id,counterparty").gte("date", r.from).lte("date", r.to)),
          rows(sb.from("acc_categories").select("id,name")),
          rows(sb.from("acc_accounts").select("id,name,kind,opening_balance,active")),
        ]);
        const cat = new Map(cats.map((c) => [c.id as string, c.name as string]));
        const sum = (k: string) => Math.round(txs.filter((t) => t.kind === k).reduce((s, t) => s + Number(t.amount || 0), 0));
        const byCat = (k: string) => {
          const m = new Map<string, number>();
          for (const t of txs.filter((x) => x.kind === k)) m.set(cat.get(t.category_id as string) || "Uncategorized", (m.get(cat.get(t.category_id as string) || "Uncategorized") || 0) + Number(t.amount || 0));
          return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([name, amount]) => ({ name, amount: Math.round(amount) }));
        };
        return { period: r, money_in: sum("income"), money_out: sum("expense"), net: sum("income") - sum("expense"), expenses_by_category: byCat("expense"), income_by_category: byCat("income"), accounts: accounts.filter((a) => a.active).map((a) => a.name), page: "/accounting" };
      },
    }),

    // ---- Lead Hunter (every registered trucking company) ----
    hunter_count: tool({
      description: "Count trucking companies in Lead Hunter (about 4.5 million US/CA/MX carriers and brokers) that match a filter.",
      inputSchema: z.object({ filter: HUNTER_FILTER }),
      execute: async ({ filter }) => hunter(ctx, "/v1/leads/count", filter),
    }),
    hunter_search: tool({
      description: "Find trucking companies in Lead Hunter that match a filter: up to 25 rows with USDOT, MC, name, city/state, trucks, drivers, authority, insurance, safety.",
      inputSchema: z.object({ filter: HUNTER_FILTER, limit: z.number().int().min(1).max(25).default(10) }),
      execute: async ({ filter, limit }) => {
        const r = (await hunter(ctx, "/v1/leads/search", { ...filter, page: 1, pageSize: limit })) as { rows?: Row[]; total?: number; error?: string };
        if (!r || r.error) return r;
        const keep = ["dotNumber", "mcNumber", "legalName", "dbaName", "phyCity", "phyState", "powerUnits", "totalDrivers", "authorityStatus", "authorityGrantedDate", "insuranceStatus", "insuranceCompany", "safetyRating", "lastInspectionDate", "phone", "email"];
        return { total: r.total, rows: (r.rows || []).map((x) => compact(Object.fromEntries(keep.map((k) => [k, x[k]])))) };
      },
    }),
    hunter_company: tool({
      description:
        "One carrier's full record in Lead Hunter by USDOT number OR MC number (an 'MC#' / 'docket' is the mc field): registration, authority, insurance, fleet, contacts, safety (inspections, out-of-service rates, crashes, safety measures). Use it for any 'look up / research / summarize this DOT or MC'.",
      inputSchema: z.object({
        dot: z.string().regex(/^\d{1,9}$/).optional().describe("USDOT number, digits"),
        mc: z.string().regex(/^\d{1,8}$/).optional().describe("MC number, digits only (no 'MC')"),
      }),
      execute: async ({ dot, mc }) => {
        let usdot = dot;
        if (!usdot && mc) {
          // MC → the carrier's USDOT through Lead Hunter's search (it matches MC numbers exactly).
          const r = (await hunter(ctx, "/v1/leads/search", { q: `MC${mc.replace(/^0+/, "")}`, page: 1, pageSize: 1 })) as { rows?: Row[]; error?: string } | null;
          if (r && "error" in r && r.error) return r;
          usdot = r?.rows?.[0]?.dotNumber ? String(r.rows[0].dotNumber) : undefined;
          if (!usdot) return { error: `No carrier with MC ${mc} in Lead Hunter.` };
        }
        if (!usdot) return { error: "Give a USDOT or MC number." };
        const p = (await hunter(ctx, `/v1/leads/${usdot}/profile`)) as Row | null;
        if (!p) return { error: "No carrier with that number in Lead Hunter." };
        if ("error" in p) return p;
        const pickArr = (k: string, n: number) => (Array.isArray(p[k]) ? (p[k] as Row[]).slice(0, n).map(compact) : undefined);
        return compact({
          lead: compact((p.lead as Row) || {}),
          safety_24m: p.safety24m,
          crashes_24m: p.crashSummary24m,
          sms_measures: pickArr("smsMeasures", 10),
          insurance: pickArr("policies", 5),
          authority: pickArr("authorities", 5),
          recent_inspections: pickArr("inspections", 5),
          already_in_cloud_hint: "Use find_companies with the USDOT to see if TOSS Cloud already has it.",
        });
      },
    }),
  };

  // Actions: a confirm card each; nothing runs until the person clicks Confirm.
  const card = <S extends z.ZodType>(name: ActionName, schema: S) =>
    tool({
      description: `Propose: ${name.replace(/_/g, " ")}. Shows a confirm card with these details; it runs only when the person clicks Confirm. Your message ends with the card.`,
      inputSchema: schema,
      outputSchema: CARD_OUT,
    });
  const actionTools = {
    propose_create_company: card("create_company", ACTIONS.create_company),
    propose_add_lead_from_hunter: card("add_lead_from_hunter", ACTIONS.add_lead_from_hunter),
    propose_add_company_note: card("add_company_note", ACTIONS.add_company_note),
    propose_create_case: card("create_case", ACTIONS.create_case),
    propose_create_opportunity: card("create_opportunity", ACTIONS.create_opportunity),
    propose_set_load_status: card("set_load_status", ACTIONS.set_load_status),
    propose_set_truck_availability: card("set_truck_availability", ACTIONS.set_truck_availability),
  } satisfies Record<`propose_${ActionName}`, unknown>;

  const ui = {
    navigate: tool({
      description:
        "Open a page in TOSS Cloud for the person (it happens right away). Use the page paths returned by other tools, or: /dashboard, /fleet (companies), /fleet?company=ID&tab=profile|equipment_list|drivers|trucks|trailers|docs|dot|mcpt|services|sales|cases|vault, /dispatch, /loads, /loads/ID, /invoices, /invoices/ID, /billing, /sales, /cases, /customer-service, /pending, /equipment, /documents, /credentials, /accounting, /users, /settings. Add ?company=ID to any section page to narrow it to one company.",
      inputSchema: z.object({ path: z.string().regex(/^\/[A-Za-z0-9/_\-?=&.%]*$/), why: z.string().max(120).optional() }),
      outputSchema: z.object({ opened: z.boolean() }),
    }),
    suggest_replies: tool({
      description: "Ask ONE question with 2–6 short answer buttons. Call it last: your message ends there.",
      inputSchema: z.object({ question: z.string().trim().min(3).max(200), options: z.array(z.string().trim().min(1).max(40)).min(2).max(6) }),
    }),
  };

  return { ...read, ...actionTools, ...ui };
}

export type CopilotTools = ReturnType<typeof copilotTools>;
export type CopilotUITools = InferUITools<CopilotTools>;
