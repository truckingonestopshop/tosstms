import { NextResponse, type NextRequest } from "next/server";
import { requireMember } from "@/lib/supabase/server";
import { suggestPlaces } from "@/lib/server/mapbox";

export const runtime = "nodejs";

/** GET ?q=chic → ["Chicago, IL", "Chicago Heights, IL", …] for the place fields. */
export async function GET(req: NextRequest) {
  if (!(await requireMember())) return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  const q = req.nextUrl.searchParams.get("q") || "";
  return NextResponse.json({ places: await suggestPlaces(q.slice(0, 80)) });
}
