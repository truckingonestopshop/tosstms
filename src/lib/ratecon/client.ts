"use client";

import type { RateConExtract } from "@/lib/types";

export interface ReadResult {
  data: RateConExtract;
  source: "online" | "local";
  routeMiles: number | null;
  notice?: string;
}

/**
 * Pulls the text layer out of a PDF in the browser. Scanned / faxed PDFs have no
 * text, so their first pages are rendered to images instead and read from those.
 */
async function prepare(file: File, onStatus: (s: string) => void) {
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!isPdf) return { text: "", images: [] as string[] };
  onStatus("Opening PDF…");
  const { getDocumentProxy, extractText, renderPageAsImage } = await import("unpdf");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const pdf = await getDocumentProxy(bytes.slice());
  let text = "";
  try {
    const r = await extractText(pdf, { mergePages: true });
    text = Array.isArray(r.text) ? r.text.join("\n") : r.text;
  } catch {}
  const images: string[] = [];
  if (text.replace(/\s/g, "").length < 80) {
    onStatus("Scanned document, preparing pages…");
    const pages = Math.min(pdf.numPages, 3);
    for (let p = 1; p <= pages; p++) {
      try {
        const url = await renderPageAsImage(bytes.slice(), p, { toDataURL: true, width: 1400 });
        images.push(url);
      } catch {}
    }
  }
  return { text, images };
}

export async function readRateCon(file: File, onStatus: (s: string) => void): Promise<ReadResult> {
  const { text, images } = await prepare(file, onStatus);
  onStatus("Reading rate confirmation…");
  const form = new FormData();
  form.append("file", file);
  if (text) form.append("text", text);
  for (const i of images) form.append("images", i);
  const res = await fetch("/api/ratecon", { method: "POST", body: form, signal: AbortSignal.timeout(75000) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Couldn't read this file.");
  return json as ReadResult;
}
