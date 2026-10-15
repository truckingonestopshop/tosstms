import type { LoadStop, RateConExtract } from "@/lib/types";

// Local rate confirmation reader: regex rules for the common broker formats
// (AscendTMS tables, Shipper/Consignee blocks, McLeod PU/SO stops). Used when the
// online reader is unavailable, and to fill gaps it leaves. It only returns what it
// actually finds — never invented numbers or facility names.

const STATES = new Set(
  "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY AB BC MB NB NL NS ON PE QC SK".split(
    " ",
  ),
);

export function toIsoDate(s: string): string {
  if (!s) return "";
  const iso = s.match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const mdy = s.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (mdy) {
    const y = mdy[3].length === 2 ? `20${mdy[3]}` : mdy[3];
    return `${y}-${mdy[1].padStart(2, "0")}-${mdy[2].padStart(2, "0")}`;
  }
  const named = s.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/i);
  if (named) {
    const m = "janfebmaraprmayjunjulaugsepoctnovdec".indexOf(named[1].slice(0, 3).toLowerCase()) / 3 + 1;
    return `${named[3]}-${String(m).padStart(2, "0")}-${named[2].padStart(2, "0")}`;
  }
  return "";
}

const money = (s: string) => {
  const v = parseFloat(s.replace(/[^0-9.]/g, ""));
  return isNaN(v) ? 0 : v;
};

const BAD_IDS = new Set(["confirmation", "release", "rate", "number", "communication", "information", "date", "details"]);

/** Text from column layouts glues the next label onto a name: "Sarah Klein Phone" → "Sarah Klein". */
function trimName(n: string) {
  return n.replace(/\s+(?:phone|cell|truck|tractor|trailer|email|fax|ext|mc|dot|unit)\b.*$/i, "").trim();
}

function blankStop(type: "pickup" | "delivery"): Partial<LoadStop> {
  return { type, facility_name: "", address: "", city: "", state: "", zip: "", date: "", time: "", appointment: "", reference_numbers: "", instructions: "" };
}

/** "Dallas, TX 75201" / "Dallas TX 75201" anywhere in a line. */
function cityStateZip(line: string) {
  const m = line.match(/([A-Za-z][A-Za-z .'-]{1,40}?),?\s+([A-Z]{2})\s+(\d{5})(?:-\d{4})?\b/);
  if (m && STATES.has(m[2])) return { city: m[1].replace(/^.*\b(?:address|city)\s*:\s*/i, "").trim(), state: m[2], zip: m[3] };
  return null;
}

export function readRateConText(raw: string): RateConExtract {
  const text = (raw || "").replace(/\r/g, "");
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const out: RateConExtract = {};

  // --- ids
  const load = text.match(/\b(?:load|order|shipment|pro)\s*(?:#|no\.?|number|id)\s*[:.]?\s*([A-Z0-9][A-Z0-9-]{2,})/i);
  if (load && !BAD_IDS.has(load[1].toLowerCase())) out.load_number = load[1];
  const rc =
    text.match(/\b(?:rate\s*con(?:firmation)?|confirmation)\s*(?:#|no\.?|number)\s*[:.]?\s*([A-Z0-9][A-Z0-9-]{2,})/i) ||
    text.match(/\b(?:BOL|PO|P\/O|reference)\s*(?:#|no\.?)\s*[:.]?\s*([A-Z0-9][A-Z0-9-]{2,})/i);
  if (rc && !BAD_IDS.has(rc[1].toLowerCase())) out.rate_con_number = rc[1];

  // --- rate
  // Totals first: line haul alone misses accessorials (tarp, extra stops, detention).
  const rate =
    text.match(/(?:total\s*(?:carrier\s*)?(?:pay|rate|amount|charges)|total\s*due|agreed\s*(?:rate|amount))\s*[:=]?\s*(?:USD\s*)?\$?\s*([\d,]+(?:\.\d{2})?)/i) ||
    text.match(/(?:carrier\s*(?:pay|rate)|flat\s*rate|line\s*haul|linehaul)\s*[:=]?\s*(?:USD\s*)?\$?\s*([\d,]+(?:\.\d{2})?)/i) ||
    text.match(/\bTotal\b[^\n$]{0,30}\$\s*([\d,]+(?:\.\d{2})?)/i) ||
    text.match(/\$\s*([1-9][\d,]{2,}(?:\.\d{2})?)/);
  if (rate) {
    const v = money(rate[1]);
    if (v >= 100 && v < 100000) out.gross_amount = v;
  }

  // --- miles, weight, commodity, equipment
  const miles = text.match(/(?:total\s*)?(?:miles|distance)\s*[:\s]\s*([\d,]{2,6})/i) || text.match(/([\d,]{2,6})\s*(?:loaded\s*)?miles\b/i);
  if (miles) out.loaded_miles = parseInt(miles[1].replace(/,/g, ""), 10) || undefined;
  const weight = text.match(/(?:total\s*)?weight\s*[:\s]\s*([\d,]{3,6})/i) || text.match(/([\d,]{4,6})\s*(?:lbs|pounds)\b/i);
  if (weight) out.weight_lbs = parseInt(weight[1].replace(/,/g, ""), 10) || undefined;
  const commodity = text.match(/(?:commodity|description of goods|product)\s*[:]\s*([^\n]{3,80})/i);
  if (commodity && !/claim|liabil|insur/i.test(commodity[1])) out.commodity = commodity[1].replace(/\s+(?:weight|wt|pieces|pallets)\b.*$/i, "").trim();
  const equip = text.match(/(?:equipment|trailer\s*type)\s*[:]\s*([^\n]{3,40})/i);
  if (equip) out.equipment_type = equip[1].trim();

  // --- broker
  const emails = [...text.matchAll(/([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g)].map((m) => m[1]);
  out.broker_email = emails.find((e) => !/driver|carrier|gmail|yahoo|outlook|hotmail/i.test(e)) || emails[0];
  for (const l of lines.slice(0, 20)) {
    if (/rate\s*confirm|load\s*confirm|page\s*\d|carrier|bill to|remit/i.test(l)) continue;
    if (/\b(LLC|INC|CORP|LOGISTICS|BROKERAGE|FREIGHT|TRANSPORTATION|SOLUTIONS|GROUP)\b/i.test(l) && l.length < 70) {
      out.broker_name = l.split(/[|•]/)[0].replace(/\s+(?:MC|DOT|Docket)\b.*$/i, "").trim();
      break;
    }
  }
  // Broker MC: an MC number on a line that isn't about the carrier.
  for (const l of lines) {
    if (/carrier/i.test(l)) continue;
    const mc = l.match(/\bMC\s*(?:#|no\.?)?\s*:?\s*(\d{5,7})\b/i);
    if (mc) {
      out.broker_mc = mc[1];
      break;
    }
  }
  if (out.broker_email) {
    const i = lines.findIndex((l) => l.includes(out.broker_email!));
    for (const o of [0, -1, 1, -2, 2]) {
      const ph = lines[i + o]?.match(/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
      if (i >= 0 && ph && !/driver|fax/i.test(lines[i + o])) {
        out.broker_phone = ph[0];
        break;
      }
    }
  }
  // Names: words separated by single spaces (a double space ends the name in column layouts).
  const contact = text.match(/\b(?:dispatcher|agent|broker\s*contact|contact|rep|booked\s*by)\s*(?:name)?\s*:\s*([A-Z][a-z]+(?: [A-Z][a-z]+){0,2})/i);
  if (contact) out.broker_contact = trimName(contact[1]);

  // --- carrier/driver/truck
  const carrier = text.match(/carrier\s*(?:name)?\s*[:]\s*([^\n]{3,60})/i);
  if (carrier) out.carrier_name = carrier[1].replace(/\s{2,}.*$/, "").replace(/\bMC\b.*$/i, "").trim();
  const driver = text.match(/\bdriver\s*(?:name)?\s*:\s*([A-Z][a-z]+(?: [A-Z][a-z]+){1,2})/i);
  if (driver && !/^(must|will|should|is|to|required)\b/i.test(driver[1])) out.driver_name = trimName(driver[1]);
  const unit = text.match(/\b(?:truck|tractor|power\s*unit)\s*(?:#|no\.?|number)?\s*:?\s*([0-9][A-Z0-9-]{0,9})\b/i);
  if (unit) out.truck_unit = unit[1];
  const trailer = text.match(/trailer\s*(?:#|no\.?)\s*[:]?\s*([A-Z0-9-]{1,12})\b/i);
  if (trailer) out.trailer_number = trailer[1];

  // --- stops
  const stops: Partial<LoadStop>[] = [];
  // A: numbered stop rows ("1 Pickup 09/15/26 08:00 …", "PU 1 …", "SO 2 …")
  // Also "STOP 1 - PICKUP", "Stop 2: Delivery", "1. Shipper".
  const rowRe =
    /(?:^|\n)\s*(?:(?:stop\s*)?(\d+)\s*[-:.–]?\s*(Pick\s*up|Pickup|Delivery|Drop|Shipper|Consignee|Receiver)|(PU|SO|DO|DEL)\s*(\d+))\b([\s\S]*?)(?=\n\s*(?:(?:stop\s*)?\d+\s*[-:.–]?\s*(?:Pick\s*up|Pickup|Delivery|Drop|Shipper|Consignee|Receiver)|(?:PU|SO|DO|DEL)\s*\d+)\b|\n\s*(?:commodity|total|line\s*haul|special\s*instructions|pay\s*items)\b|$)/gi;
  for (const m of text.matchAll(rowRe)) {
    const kind = (m[2] || m[3] || "").toLowerCase();
    const type = kind.startsWith("pick") || kind === "pu" ? "pickup" : "delivery";
    const body = m[5] || "";
    const s = blankStop(type);
    const bl = body.split("\n").map((x) => x.trim()).filter(Boolean);
    for (let j = 0; j < bl.length; j++) {
      const c = cityStateZip(bl[j]);
      if (c) {
        Object.assign(s, c);
        if (j > 0 && /\d/.test(bl[j - 1])) s.address = bl[j - 1].replace(/^address\s*:\s*/i, "");
        const nameLine = bl.slice(0, Math.max(0, j - 1)).find((x) => !/\d{1,2}[/-]\d{1,2}/.test(x)) || "";
        s.facility_name = nameLine.replace(/^name\s*:\s*/i, "").slice(0, 80);
        break;
      }
    }
    const d = body.match(/\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/);
    if (d) s.date = toIsoDate(d[0]);
    const t = body.match(/\b(\d{1,2}:\d{2})(?:\s*(?:-|to)\s*(\d{1,2}:\d{2}))?/);
    if (t) s.appointment = t[2] ? `${t[1]}–${t[2]}` : t[1];
    if (/fcfs|first come/i.test(body)) s.appointment = `FCFS ${s.appointment || ""}`.trim();
    else if (/\bappt|appointment/i.test(body) && s.appointment) s.appointment = `Appt ${s.appointment}`;
    const ref = body.match(/\b(?:PO|PU|P\/U|BOL|Ref(?:erence)?)\s*(?:#|no\.?|number)\s*:?\s*[A-Z0-9][A-Z0-9-]{2,}/i);
    if (ref) s.reference_numbers = ref[0].replace(/\s+/g, " ").trim();
    if (s.city) stops.push(s);
  }
  // B: Shipper / Consignee blocks
  if (stops.length < 2) {
    stops.length = 0;
    const blocks = [...text.matchAll(/(shipper|pick\s*up|origin|consignee|receiver|delivery|destination)\s*(?:information|info|location)?\s*:?\s*\n([\s\S]{10,400}?)(?=\n\s*(?:shipper|consignee|receiver|delivery|destination|pick\s*up|origin)\b|$)/gi)];
    for (const b of blocks) {
      const type = /shipper|pick|origin/i.test(b[1]) ? "pickup" : "delivery";
      const s = blankStop(type);
      const bl = b[2].split("\n").map((x) => x.trim()).filter(Boolean);
      for (let j = 0; j < bl.length; j++) {
        const c = cityStateZip(bl[j]);
        if (c) {
          Object.assign(s, c);
          if (j > 0) s.address = bl[j - 1].replace(/^address\s*:\s*/i, "");
          if (j > 1) s.facility_name = bl[0].replace(/^name\s*:\s*/i, "");
          break;
        }
      }
      const d = b[2].match(/\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/);
      if (d) s.date = toIsoDate(d[0]);
      if (s.city) stops.push(s);
    }
  }
  if (stops.length) {
    if (!stops.some((s) => s.type === "pickup")) stops[0].type = "pickup";
    if (stops.length > 1 && !stops.some((s) => s.type === "delivery")) stops[stops.length - 1].type = "delivery";
    out.stops = stops;
  } else {
    // Last resort: first two city/state/zip lines are pickup then delivery.
    const found = lines.map(cityStateZip).filter(Boolean) as { city: string; state: string; zip: string }[];
    if (found.length >= 2) {
      out.stops = [
        { ...blankStop("pickup"), ...found[0] },
        { ...blankStop("delivery"), ...found[found.length - 1] },
      ];
    }
  }
  if (out.stops?.length) {
    const pu = text.match(/(?:pick\s*up|ship)\s*date\s*[:]?\s*([\d/-]{6,10})/i);
    const del = text.match(/(?:deliver(?:y)?|del)\s*date\s*[:]?\s*([\d/-]{6,10})/i);
    if (pu && !out.stops[0].date) out.stops[0].date = toIsoDate(pu[1]);
    const last = out.stops[out.stops.length - 1];
    if (del && !last.date) last.date = toIsoDate(del[1]);
  }

  const instr = text.match(/(?:special\s*instructions|driver\s*instructions|load\s*notes|notes)\s*:?\s*\n?([\s\S]{10,600}?)(?:\n\s*\n|$)/i);
  if (instr) out.broker_notes = instr[1].replace(/\s+/g, " ").trim();
  return out;
}

/** Fill gaps in `primary` with values from `extra` (primary wins). */
export function mergeExtract(primary: RateConExtract, extra: RateConExtract): RateConExtract {
  const out: RateConExtract = { ...extra, ...Object.fromEntries(Object.entries(primary).filter(([, v]) => v !== undefined && v !== "" && v !== 0 && v !== null)) };
  out.stops = primary.stops?.length ? primary.stops : extra.stops;
  return out;
}
