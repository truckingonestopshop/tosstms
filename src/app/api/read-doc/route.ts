import { NextResponse, type NextRequest } from "next/server";
import { chatJson, deepseekConfigured, type ChatMessage } from "@/lib/server/deepseek";
import { requireMember } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 90;

// Reads a cab card (truck registration) or a driving license so the truck / driver form can
// fill in what's empty. POST multipart: kind ("cab_card" | "license"), text (from a PDF) and/or
// images (data URLs), prepared in the browser like rate confirmations. Nothing is stored.

const MAX_IMAGE_CHARS = 6 * 1024 * 1024;

const PROMPTS = {
  cab_card: `You read US/Canada truck registrations ("cab card", IRP apportioned registration, state registration).
Return only what the document shows; "" when a value isn't there. Never guess.
- unit_number = the fleet's unit / vehicle number if printed (e.g. "Unit 104", "Veh #28"), not the plate.
- plate = license plate number; plate_state = 2-letter state/province of the plate.
- year = 4-digit model year; make = manufacturer (e.g. "Freightliner", "Peterbilt"); model = model (e.g. "Cascadia", "579").
- vin = the 17-character VIN, uppercase, no spaces.
- expires = registration expiration date as YYYY-MM-DD.
Return this json exactly: {"unit_number":"","plate":"","plate_state":"","year":"","make":"","model":"","vin":"","expires":""}`,
  license: `You read driving licenses (US states, Mexico licencia federal, Canada).
Return only what the document shows; "" when a value isn't there. Never guess.
- first_name / last_name = the license holder (US licenses print LAST name first; split correctly). Title case.
- license_number = the license / DL number exactly as printed.
- region = issuing US state as 2-letter code, or "MX" for Mexico, or "CAN" for Canada.
- license_type = "CDL" if it is a commercial license (class A, B or C commercial, "CDL"), "DL" for a regular license,
  "International CDL" for a Mexican federal license (licencia federal de conductor).
- expires = expiration date as YYYY-MM-DD.
Return this json exactly: {"first_name":"","last_name":"","license_number":"","region":"","license_type":"","expires":""}`,
} as const;
type Kind = keyof typeof PROMPTS;

const str = (v: unknown) => (v === null || v === undefined || v === "null" ? "" : String(v).trim());
const iso = (v: unknown) => (/^\d{4}-\d{2}-\d{2}$/.test(str(v)) ? str(v) : "");

export async function POST(req: NextRequest) {
  if (!(await requireMember())) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (!deepseekConfigured()) return NextResponse.json({ error: "Reading documents isn't set up on the server." }, { status: 503 });
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected a file" }, { status: 400 });
  }
  const kind = String(form.get("kind") || "") as Kind;
  if (!(kind in PROMPTS)) return NextResponse.json({ error: "Unknown document" }, { status: 400 });
  const text = String(form.get("text") || "").slice(0, 40_000);
  const images = form
    .getAll("images")
    .map(String)
    .filter((s) => /^data:image\/(png|jpe?g|webp);base64,/.test(s) && s.length <= MAX_IMAGE_CHARS)
    .slice(0, 4);
  if (text.replace(/\s/g, "").length < 20 && !images.length) {
    return NextResponse.json({ error: "Couldn't read this file. Fill the details in by hand." }, { status: 422 });
  }
  const intro = kind === "cab_card" ? "Truck registration (cab card):" : "Driving license:";
  const content: ChatMessage["content"] = images.length
    ? [{ type: "text", text: text ? `${intro}\n\n${text}` : intro }, ...images.map((url) => ({ type: "image_url" as const, image_url: { url } }))]
    : `${intro}\n\n${text}`;

  try {
    const r = (await chatJson([{ role: "system", content: PROMPTS[kind] }, { role: "user", content }], { timeoutMs: 80000 })) as Record<string, unknown>;
    if (kind === "cab_card") {
      const vin = str(r.vin).toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, "");
      return NextResponse.json({
        data: {
          unit_number: str(r.unit_number),
          plate: str(r.plate).toUpperCase(),
          plate_state: str(r.plate_state).toUpperCase().slice(0, 2),
          year: /^(19|20)\d{2}$/.test(str(r.year)) ? str(r.year) : "",
          make: str(r.make),
          model: str(r.model),
          vin: vin.length === 17 ? vin : "",
          expires: iso(r.expires),
        },
      });
    }
    const region = str(r.region).toUpperCase();
    const type = str(r.license_type);
    return NextResponse.json({
      data: {
        first_name: str(r.first_name),
        last_name: str(r.last_name),
        license_number: str(r.license_number),
        region: /^[A-Z]{2}$/.test(region) || region === "CAN" ? region : "",
        license_type: ["CDL", "DL", "International CDL"].includes(type) ? type : "",
        expires: iso(r.expires),
      },
    });
  } catch (e) {
    return NextResponse.json({ error: `Couldn't read it right now: ${(e as Error).message}` }, { status: 502 });
  }
}
