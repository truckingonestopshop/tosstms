import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { GhlCustomer } from "@/lib/ghl";
import type { Company, ServiceInfo, Services } from "@/lib/types";

// Carriers coming from outside (GoHighLevel workflow, TOSS Lead Hunter's "Send to TOSS"): create
// the carrier, or fill in what's missing on the one it already is (same GHL contact or same DOT).
// Never overwrites what the team typed, never deletes.

export type CarrierInput = GhlCustomer;
export type CarrierAction = "created" | "updated" | "unchanged" | "failed";

/** Each sold service, checked, with where the sale came from. */
function services(c: CarrierInput, current: Services = {}): Services {
  const out: Services = { ...current };
  for (const k of c.services) {
    if (out[k]?.on) continue;
    const s: ServiceInfo = { ...out[k], on: true };
    if (c.source && !s.source) s.source = c.source;
    if (c.referredBy && !s.referred_by) s.referred_by = c.referredBy;
    if (c.soldBy && !s.sold_by) s.sold_by = c.soldBy;
    out[k] = s;
  }
  return out;
}

function newCompany(c: CarrierInput, from: string) {
  return {
    name: c.name!,
    dba_name: c.dba,
    ein: c.ein,
    dot_number: c.dot,
    mc_number: c.mc,
    street: c.street,
    city: c.city,
    state: c.state,
    zip: c.zip,
    contact_first_name: c.firstName,
    contact_last_name: c.lastName,
    contact_phone: c.phone,
    contact_email: c.email,
    secondary_first_name: c.secondFirst,
    secondary_last_name: c.secondLast,
    services: services(c),
    ghl_contact_id: c.contactId,
    status: "active",
    // Dispatch terms start blank: the team fills them in (same as a new carrier from the form).
    commission_percent: 0,
    notes: `Added from ${from} on ${new Date().toISOString().slice(0, 10)}.`,
    created_by: null,
  };
}

/** Only what's empty on the carrier, plus services it doesn't have yet. */
function fillIn(row: Company, c: CarrierInput) {
  const patch: Record<string, unknown> = {};
  const fill = (key: keyof Company, v: string | null) => {
    if (v && !(row[key] as string | null | undefined)) patch[key] = v;
  };
  fill("dba_name", c.dba);
  fill("ein", c.ein);
  fill("mc_number", c.mc);
  fill("contact_phone", c.phone);
  fill("contact_email", c.email);
  fill("secondary_first_name", c.secondFirst);
  fill("secondary_last_name", c.secondLast);
  if (!row.contact_first_name && !row.contact_last_name && !row.contact_name) {
    fill("contact_first_name", c.firstName);
    fill("contact_last_name", c.lastName);
  }
  // The address only when the carrier has none at all (parts belong together).
  if (!row.street && !row.city && !row.state && !row.zip && !row.address) {
    fill("street", c.street);
    fill("city", c.city);
    fill("state", c.state);
    fill("zip", c.zip);
  }
  if (!row.ghl_contact_id && c.contactId) patch.ghl_contact_id = c.contactId;
  const next = services(c, row.services ?? {});
  if (JSON.stringify(next) !== JSON.stringify(row.services ?? {})) patch.services = next;
  return patch;
}

/** The carrier with this DOT (oldest first), or null. */
export async function carrierByDot(a: SupabaseClient, dot: string): Promise<Company | null> {
  const { data } = await a.from("tms_companies").select("*").eq("dot_number", dot).order("created_at").limit(1);
  return ((data || [])[0] as Company | undefined) ?? null;
}

/**
 * Create or fill in. `from` names the source in the new carrier's notes ("GoHighLevel",
 * "TOSS Lead Hunter"). Expects c.dot and c.name to be set.
 */
export async function upsertCarrier(a: SupabaseClient, c: CarrierInput, from: string): Promise<{ action: CarrierAction; message: string; companyId: string | null }> {
  // Same GHL contact first, then the same DOT.
  let existing: Company | null = null;
  if (c.contactId) existing = ((await a.from("tms_companies").select("*").eq("ghl_contact_id", c.contactId).maybeSingle()).data as Company | null) ?? null;
  if (!existing) existing = await carrierByDot(a, c.dot!);

  if (!existing) {
    const { data, error } = await a.from("tms_companies").insert(newCompany(c, from)).select("id").single();
    if (error) return { action: "failed", message: error.message, companyId: null };
    return { action: "created", message: `Carrier created: ${c.name}`, companyId: data.id as string };
  }
  const patch = fillIn(existing, c);
  if (!Object.keys(patch).length) return { action: "unchanged", message: `Already in TOSS Cloud with these details: ${existing.name}`, companyId: existing.id };
  const { error } = await a.from("tms_companies").update(patch).eq("id", existing.id);
  if (error) return { action: "failed", message: error.message, companyId: existing.id };
  return { action: "updated", message: `Filled in: ${Object.keys(patch).join(", ")}`, companyId: existing.id };
}
