import { NextResponse, type NextRequest } from "next/server";
import { requireMember } from "@/lib/supabase/server";
import { chatJson, deepseekConfigured, type ChatMessage } from "@/lib/server/deepseek";
import { routeStops } from "@/lib/server/mapbox";
import { mergeExtract, readRateConText, toIsoDate } from "@/lib/ratecon/fallback";
import type { LoadStop, RateConExtract } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 90;

const MAX_FILE = 20 * 1024 * 1024;
const MAX_BODY = 32 * 1024 * 1024;
const MAX_IMAGE_CHARS = 6 * 1024 * 1024;

const SYSTEM = `You read US trucking rate confirmations (load tenders from freight brokers to a carrier) and return the load as JSON.
Rules:
- Only use what the document says. Use "" or null when a value is not present. Never guess numbers.
- gross_amount = the total the carrier is paid (line haul + accessorials listed as carrier pay). Number, no symbols.
- broker_* = the brokerage that issued the confirmation (not the carrier, not the shipper). broker_mc = broker's MC number digits.
- carrier_name / driver_name / truck_unit / trailer_number = the carrier side, if shown.
- stops: every pickup and delivery in order. type is "pickup" or "delivery". state = 2-letter code. date = YYYY-MM-DD.
  time = appointment time like "08:00" if one exact time; appointment = window or note like "FCFS 08:00–15:00" or "Appt 10:00".
  reference_numbers = PU#, PO#, BOL# etc for that stop joined with ", ". instructions = stop-specific notes as one string.
- Stops come ONLY from pickup / delivery / shipper / consignee / stop sections. Never use payment, remit-to,
  factoring, bank, "mail invoices to" or broker office addresses (e.g. "TBK BANK ... PO BOX ... DALLAS, TX") as stops.
  If a stop shows only "City, ST" with no street, leave address and zip empty.
- Tables such as "Dispatcher Driver Truck # Trailer #" followed by "george petru 632 013" mean dispatcher=george,
  driver=petru, truck_unit=632, trailer_number=013.
- loaded_miles only if the document states miles. weight_lbs number (an "Estimated Weight" counts).
- equipment_type = trailer type and size, e.g. "Flatbed 48 ft", "Conestoga 53 ft", "Dry Van 53 ft".
- broker_notes = only this load's practical requirements for dispatcher and driver (the "note to carrier", PPE, tarps,
  straps, tracking app, temperature, unloading, appointment rules) as a few short sentences. Leave out legal terms,
  payment/quick-pay terms, detention policy boilerplate, privacy policy and agreement text.
Return exactly:
{"load_number":"","rate_con_number":"","broker_name":"","broker_mc":"","broker_contact":"","broker_email":"","broker_phone":"",
"carrier_name":"","driver_name":"","truck_unit":"","trailer_number":"","gross_amount":0,"loaded_miles":null,"weight_lbs":null,
"commodity":"","equipment_type":"","broker_notes":"",
"stops":[{"type":"pickup","facility_name":"","address":"","city":"","state":"","zip":"","date":"","time":"","appointment":"","contact_name":"","phone":"","reference_numbers":"","commodity":"","weight":"","instructions":""}]}`;

const str = (v: unknown) => (v === null || v === undefined || v === "null" ? "" : String(v).trim());
const numOrUndef = (v: unknown) => {
  if (typeof v === "number") return isFinite(v) && v > 0 ? v : undefined;
  const n = parseFloat(String(v ?? "").replace(/[^0-9.]/g, ""));
  return isFinite(n) && n > 0 ? n : undefined;
};

function normalize(raw: unknown): RateConExtract {
  const r = (raw || {}) as Record<string, unknown>;
  const stops = Array.isArray(r.stops) ? (r.stops as Record<string, unknown>[]) : [];
  return {
    load_number: str(r.load_number) || undefined,
    rate_con_number: str(r.rate_con_number) || undefined,
    broker_name: str(r.broker_name) || undefined,
    broker_mc: str(r.broker_mc).replace(/\D/g, "") || undefined,
    broker_contact: str(r.broker_contact) || undefined,
    broker_email: str(r.broker_email) || undefined,
    broker_phone: str(r.broker_phone) || undefined,
    carrier_name: str(r.carrier_name) || undefined,
    driver_name: str(r.driver_name).replace(/\b[a-z]/g, (c) => c.toUpperCase()) || undefined,
    truck_unit: str(r.truck_unit) || undefined,
    trailer_number: str(r.trailer_number) || undefined,
    gross_amount: numOrUndef(r.gross_amount),
    loaded_miles: numOrUndef(r.loaded_miles),
    weight_lbs: numOrUndef(r.weight_lbs),
    commodity: str(r.commodity) || undefined,
    equipment_type: str(r.equipment_type) || undefined,
    broker_notes: str(r.broker_notes) || undefined,
    stops: stops
      .map((s) => ({
        type: (str(s.type).toLowerCase().startsWith("p") ? "pickup" : "delivery") as LoadStop["type"],
        facility_name: str(s.facility_name),
        address: str(s.address),
        city: str(s.city),
        state: str(s.state).toUpperCase().slice(0, 2),
        zip: str(s.zip),
        date: toIsoDate(str(s.date)) || "",
        time: str(s.time),
        appointment: str(s.appointment),
        contact_name: str(s.contact_name),
        phone: str(s.phone),
        reference_numbers: str(s.reference_numbers),
        commodity: str(s.commodity),
        weight: str(s.weight),
        instructions: Array.isArray(s.instructions) ? (s.instructions as unknown[]).map(str).filter(Boolean).join("\n") : str(s.instructions),
      }))
      .filter((s) => s.city || s.zip || s.address),
  };
}

async function pdfText(bytes: Uint8Array) {
  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(bytes);
    const { text } = await extractText(pdf, { mergePages: true });
    return Array.isArray(text) ? text.join("\n") : text || "";
  } catch {
    return "";
  }
}

/**
 * POST multipart: file (the rate con), text (optional, text the browser already
 * extracted), images (optional, page renders of a scanned PDF as data URLs).
 */
export async function POST(req: NextRequest) {
  if (!(await requireMember())) return NextResponse.json({ error: "Not allowed" }, { status: 401 });

  // Rate cons are small; refuse anything that would tie up memory or the reader.
  if (Number(req.headers.get("content-length") || 0) > MAX_BODY) {
    return NextResponse.json({ error: "That file is too large. Rate confirmations should be under 20 MB." }, { status: 413 });
  }
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Upload failed. Try the file again." }, { status: 400 });
  }
  const raw = form.get("file");
  const file = raw instanceof File ? raw : null;
  if (file && file.size > MAX_FILE) {
    return NextResponse.json({ error: "That file is too large. Rate confirmations should be under 20 MB." }, { status: 413 });
  }
  let text = String(form.get("text") || "").slice(0, 200_000);
  const images = form
    .getAll("images")
    .map(String)
    .filter((s) => /^data:image\/(png|jpe?g|webp);base64,/.test(s) && s.length <= MAX_IMAGE_CHARS)
    .slice(0, 4);

  if (!text.trim() && file && (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"))) {
    text = await pdfText(new Uint8Array(await file.arrayBuffer()));
  }
  if (!images.length && file && /^image\/(png|jpe?g|webp)$/.test(file.type) && file.size < 4 * 1024 * 1024) {
    images.push(`data:${file.type};base64,${Buffer.from(await file.arrayBuffer()).toString("base64")}`);
  }
  const hasText = text.replace(/\s/g, "").length > 60;
  if (!hasText && !images.length) {
    return NextResponse.json({ error: "Couldn't read any text in this file. Fill the load in by hand, or try a clearer copy." }, { status: 422 });
  }

  const local = hasText ? readRateConText(text) : {};
  let primary: RateConExtract = {};
  let source: "online" | "local" = "local";
  let notice: string | undefined;

  if (deepseekConfigured()) {
    const content: ChatMessage["content"] = hasText
      ? `Rate confirmation text:\n\n${text.slice(0, 60000)}`
      : [{ type: "text", text: "Rate confirmation pages:" }, ...images.map((url) => ({ type: "image_url" as const, image_url: { url } }))];
    try {
      primary = normalize(await chatJson([{ role: "system", content: SYSTEM }, { role: "user", content }]));
      source = "online";
    } catch (e) {
      const msg = (e as Error).message || "";
      console.warn("rate con reader fell back to local rules:", msg);
      const busy = /busy|overload|503|529|429|timeout|no response|stalled|abort/i.test(msg);
      notice = !hasText
        ? busy
          ? "The full reader is busy and this file is a scan. It was read on this device instead; check every field."
          : "This scan couldn't be read in full. It was read on this device instead; check every field."
        : busy
          ? "The full reader is busy right now, so only the basics were filled. Check every field or press Read again."
          : "The full reader couldn't finish this document, so only the basics were filled. Check every field or press Read again.";
    }
  } else {
    notice = "Only the basics were filled. Check every field.";
  }

  const data = mergeExtract(primary, local);

  // Highway miles through all stops (Mapbox), unless the document already states them.
  let routeMiles: number | null = null;
  if (data.stops && data.stops.length >= 2) {
    try {
      const r = await Promise.race([
        routeStops(data.stops.map((s) => ({ address: s.address, city: s.city, state: s.state, zip: s.zip }))),
        new Promise<null>((res) => setTimeout(() => res(null), 9000)),
      ]);
      if (r && r.miles > 0) routeMiles = r.miles;
    } catch {}
  }

  if (!data.stops?.length && !data.gross_amount && !data.broker_name) {
    return NextResponse.json(
      { error: notice || "Nothing recognizable was found in this file. Fill the load in by hand.", source },
      { status: 422 },
    );
  }
  return NextResponse.json({ data, source, routeMiles, notice, textLength: text.length });
}
