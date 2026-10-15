// Sample data for the development-only UI preview (/preview-ui). Never used in production.
import type { Company, DocType, DocumentItem, Driver, Invoice, Load, LoadStatus, Member, Settings, Truck } from "./types";
import { addDays, today } from "./format";

const t = today();
const now = new Date().toISOString();
const C1 = "demo-c1";
const C2 = "demo-c2";

export function demoData() {
  const members: Member[] = [
    { user_id: "demo-me", email: "dispatch@truckingonestopshop.net", full_name: "Preview Dispatcher", role: "owner", created_at: now },
    { user_id: "demo-2", email: "dayana@truckingonestopshop.net", full_name: "Dayana Villa", role: "dispatcher", created_at: now },
  ];
  const co = (id: string, name: string, mc: string, pct: number, cad: "weekly" | "monthly"): Company => ({
    id, name, mc_number: mc, dot_number: `3${mc}`, contact_name: "Owner", contact_phone: "(312) 555-0144", contact_email: "ops@example.com",
    address: "1420 W Carroll Ave, Chicago, IL 60607", commission_percent: pct, billing_cadence: cad, payment_terms_days: cad === "weekly" ? 7 : 30,
    factoring_company: "RTS Financial", factoring_email: null, status: "active", notes: null, created_at: now, updated_at: now,
  });
  const companies = [co(C1, "Apex Hauling LLC", "1428592", 10, "weekly"), co(C2, "Silverline Express Inc", "981244", 8, "monthly")];
  const dr = (id: string, c: string, name: string, cdl: string, med: string): Driver => ({
    id, company_id: c, name, phone: "(708) 555-8291", email: null, cdl_number: "IL-CDL-8839201", cdl_state: "IL", cdl_expiry: cdl,
    medical_card_expiry: med, status: "active", notes: null, created_at: now, updated_at: now,
  });
  const drivers = [
    dr("d1", C1, "Darius Miller", addDays(t, 400), addDays(t, 20)),
    dr("d2", C1, "Petru Duca", addDays(t, 700), addDays(t, 300)),
    dr("d3", C2, "Alexei Voronov", addDays(t, -3), addDays(t, 200)),
    dr("d4", C2, "Tariq Sterling", addDays(t, 500), addDays(t, 365)),
  ];
  const tr = (id: string, c: string, unit: string, type: string, drv: string | null, loc: string, status: Truck["status"] = "active"): Truck => ({
    id, company_id: c, unit_number: unit, trailer_number: `TR-${unit}0`, plate: "IL-P88291", vin_number: "1FUJGLDR8NLBP1019", year: 2022, make: "Freightliner",
    trailer_type: type, trailer_length: "53 ft", max_weight: 45000, door_type: "Swing doors", suspension: "Air ride", important_info: "TWIC, team capable",
    accessories: [{ id: "a1", name: "Straps", quantity: 12 }, { id: "a2", name: "Load bars", quantity: 2 }], desk_blocks: [], custom_pitch: null,
    assigned_driver_id: drv, current_location: loc, available_date: null, status, notes: null, created_at: now, updated_at: now,
  });
  const trucks = [
    tr("t1", C1, "101", "Reefer", "d1", "Chicago, IL"),
    tr("t2", C1, "104", "Flatbed", "d2", "Gary, IN"),
    tr("t3", C2, "301", "Dry Van", "d3", "Dallas, TX"),
    tr("t4", C2, "305", "Dry Van", "d4", "Memphis, TN", "out_of_service"),
  ];
  let n = 0;
  const ld = (c: string, d: string, tk: string, o: [string, string], de: [string, string], pu: number, days: number, gross: number, miles: number, status: LoadStatus, broker: string): Load => {
    n++;
    const pct = c === C1 ? 10 : 8;
    return {
      id: `l${n}`, company_id: c, driver_id: d, truck_id: tk, dispatcher_id: n % 2 ? "demo-me" : "demo-2", load_number: `${41820950 + n}`, rate_con_number: `RC-${7700 + n}`,
      status, broker_name: broker, broker_mc: "411443", broker_contact: "Jake Morris", broker_email: "jmorris@broker.com", broker_phone: "(513) 555-0182",
      origin_city: o[0], origin_state: o[1], destination_city: de[0], destination_state: de[1], pickup_date: addDays(t, pu), delivery_date: addDays(t, pu + days),
      gross_amount: gross, commission_percent: pct, dispatcher_cut: Math.round(gross * pct) / 100, loaded_miles: miles, deadhead_miles: 40 + (n * 13) % 90,
      weight_lbs: 42000, commodity: "Paper products", equipment_type: "Dry Van", broker_notes: "Tracking required. Call 1 hr before delivery.", internal_notes: null,
      stops: [
        { id: `s${n}a`, type: "pickup", facility_name: "Shipper DC", address: "1201 Industrial Blvd", city: o[0], state: o[1], zip: "", date: addDays(t, pu), time: "08:00", appointment: "FCFS 08:00–14:00", contact_name: "", phone: "", reference_numbers: `PU${n}88`, commodity: "", weight: "", instructions: "", status: status === "booked" ? "pending" : "completed" },
        { id: `s${n}b`, type: "delivery", facility_name: "Receiver", address: "4400 Logistics Way", city: de[0], state: de[1], zip: "", date: addDays(t, pu + days), time: "06:00", appointment: "", contact_name: "", phone: "", reference_numbers: "", commodity: "", weight: "", instructions: "", status: ["delivered", "invoiced", "paid"].includes(status) ? "completed" : "pending" },
      ],
      created_by: "demo-me", created_at: new Date(Date.now() - n * 3600e3).toISOString(), updated_at: now,
    };
  };
  const loads: Load[] = [
    ld(C1, "d1", "t1", ["Chicago", "IL"], ["Atlanta", "GA"], -1, 2, 3200, 716, "in_transit", "C.H. Robinson"),
    ld(C1, "d2", "t2", ["Gary", "IN"], ["Houston", "TX"], 1, 3, 4400, 1101, "booked", "TQL"),
    ld(C2, "d3", "t3", ["Dallas", "TX"], ["Memphis", "TN"], 0, 1, 2100, 452, "booked", "Arrive Logistics"),
    ld(C2, "d3", "t3", ["Memphis", "TN"], ["Columbus", "OH"], -9, 2, 2650, 580, "delivered", "Echo Global"),
    ld(C1, "d1", "t1", ["Milwaukee", "WI"], ["Nashville", "TN"], -12, 2, 2900, 559, "delivered", "Coyote"),
    ld(C1, "d2", "t2", ["Joliet", "IL"], ["Denver", "CO"], -20, 3, 3800, 1003, "invoiced", "Landstar"),
    ld(C2, "d4", "t4", ["Laredo", "TX"], ["Chicago", "IL"], -30, 3, 4100, 1340, "paid", "Uber Freight"),
    ld(C1, "d1", "t1", ["Atlanta", "GA"], ["Miami", "FL"], -40, 2, 2400, 662, "paid", "J.B. Hunt"),
    ld(C2, "d3", "t3", ["Columbus", "OH"], ["Newark", "NJ"], -50, 2, 2300, 535, "paid", "RXO"),
    ld(C1, "d2", "t2", ["Denver", "CO"], ["Phoenix", "AZ"], -60, 2, 2950, 821, "paid", "TQL"),
    ld(C1, "d1", "t1", ["Indianapolis", "IN"], ["Charlotte", "NC"], -70, 2, 2050, 586, "paid", "C.H. Robinson"),
    ld(C2, "d4", "t4", ["Houston", "TX"], ["Kansas City", "MO"], -5, 2, 2500, 742, "canceled_by_broker", "Echo Global"),
  ];
  const documents: DocumentItem[] = [
    { id: "doc1", company_id: C1, load_id: null, driver_id: null, truck_id: null, doc_type: "insurance", file_path: "x", file_name: "COI_Apex_2026.pdf", file_size: 382910, mime_type: "application/pdf", expires_on: addDays(t, 18), notes: null, uploaded_by: null, uploaded_at: now },
    { id: "doc2", company_id: C1, load_id: null, driver_id: null, truck_id: null, doc_type: "authority", file_path: "x", file_name: "MC_Authority.pdf", file_size: 142091, mime_type: "application/pdf", expires_on: null, notes: null, uploaded_by: null, uploaded_at: now },
    { id: "doc3", company_id: C1, load_id: "l1", driver_id: null, truck_id: null, doc_type: "rate_confirmation", file_path: "x", file_name: "RC-7701.pdf", file_size: 98120, mime_type: "application/pdf", expires_on: null, notes: null, uploaded_by: null, uploaded_at: now },
  ];
  const inv = (id: string, l: Load, status: Invoice["status"], issued: number): Invoice => ({
    id, company_id: l.company_id, invoice_number: `TOSS-2026-${1000 + Number(id.slice(-1))}`, invoice_type: "load", status, currency: "USD",
    issue_date: addDays(t, issued), due_date: addDays(t, issued + 7), period_start: l.delivery_date, period_end: l.delivery_date,
    total_gross: l.gross_amount, total_due: l.dispatcher_cut, amount_paid: status === "paid" ? l.dispatcher_cut : 0, notes: "Weekly dispatch service fee.",
    issuer_name: "Trucking One Stop Shop LLC", issuer_address: "Chicago, IL", issuer_email: "billing@truckingonestopshop.net", issuer_phone: "",
    bill_to_name: companies.find((c) => c.id === l.company_id)!.name, bill_to_details: "MC 1428592 · DOT 31428592", doc_overrides: { terms_title: "Dispatch agreement", terms_text: "10% of gross · weekly" },
    sent_at: now, paid_at: status === "paid" ? now : null, created_at: now, updated_at: now,
    lines: [{ id: `${id}-1`, invoice_id: id, load_id: l.id, position: 0, description: `${l.origin_city}, ${l.origin_state} → ${l.destination_city}, ${l.destination_state}`, line_date: l.delivery_date, quantity: 1, unit_price: l.dispatcher_cut, gross_amount: l.gross_amount, amount: l.dispatcher_cut, load_number: l.load_number, rate_con_number: l.rate_con_number, broker_name: l.broker_name, driver_name: null, origin: null, destination: null, pickup_date: l.pickup_date, delivery_date: l.delivery_date }],
  });
  const invoices = [inv("i1", loads[5], "sent", -14), inv("i2", loads[6], "paid", -25)];
  const docTypes: DocType[] = [
    ["rate_confirmation", "Rate Confirmation", "load"], ["bol", "Bill of Lading (BOL)", "load"], ["pod", "Proof of Delivery (POD)", "load"],
    ["insurance", "Certificate of Insurance (COI)", "company"], ["authority", "MC Authority", "company"], ["w9", "W-9", "company"],
    ["noa", "Notice of Assignment (NOA)", "company"], ["dispatch_agreement", "Dispatch Agreement", "company"], ["cdl", "CDL", "driver"],
    ["medical_card", "Medical Card", "driver"], ["registration", "Registration", "truck"], ["other", "Other", "any"],
  ].map(([key, name, scope]) => ({ key, name, scope: scope as DocType["scope"], is_default: true }));
  const settings: Settings = {
    id: 1, issuer_name: "Trucking One Stop Shop LLC", issuer_address: "Chicago, IL", issuer_email: "billing@truckingonestopshop.net",
    issuer_phone: "", invoice_prefix: "TOSS", remittance_text: "ACH / Zelle within terms.", footer_text: "Thank you for your business.",
  };
  return { members, companies, drivers, trucks, loads, documents, invoices, docTypes, settings };
}
