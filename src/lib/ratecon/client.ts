"use client";

import type { RateConExtract } from "@/lib/types";

export interface ReadResult {
  data: RateConExtract;
  source: "online" | "local";
  routeMiles: number | null;
  notice?: string;
}

/** Downscales any image (PNG page render, phone photo, HEIC on Safari) to a JPEG data URL. */
async function toJpeg(src: Blob | string, maxW = 1600, quality = 0.85): Promise<string | null> {
  try {
    const url = typeof src === "string" ? src : URL.createObjectURL(src);
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    const scale = Math.min(1, maxW / img.naturalWidth);
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * scale);
    c.height = Math.round(img.naturalHeight * scale);
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    if (typeof src !== "string") URL.revokeObjectURL(url);
    return c.toDataURL("image/jpeg", quality);
  } catch {
    return null;
  }
}

type TextItem = { str: string; transform: number[]; width: number; height: number };
const MAX_PAGES = 10;
const MAX_IMAGE_PAGES = 8;
// Vercel refuses request bodies over ~4.5 MB; keep the page images under that together.
const IMAGE_BUDGET = 3_800_000;

/**
 * One page's text with its layout kept: words on the same printed line stay on one
 * line, and wide gaps (table columns) become " | " so a row like
 * "Dispatcher  Driver  Truck #" still lines up with the values under it.
 */
function pageLines(items: TextItem[]) {
  const words = items.filter((i) => i.str && i.str.trim()).map((i) => ({ s: i.str, x: i.transform[4], y: i.transform[5], w: i.width, h: Math.abs(i.height || i.transform[3] || 10) }));
  words.sort((p, q) => q.y - p.y || p.x - q.x);
  const lines: { y: number; h: number; ws: typeof words }[] = [];
  for (const w of words) {
    const line = lines.find((l) => Math.abs(l.y - w.y) <= Math.max(2, Math.min(l.h, w.h) * 0.45));
    if (line) line.ws.push(w);
    else lines.push({ y: w.y, h: w.h, ws: [w] });
  }
  lines.sort((p, q) => q.y - p.y);
  return lines
    .map((l) => {
      const ws = l.ws.sort((p, q) => p.x - q.x);
      let out = "";
      let end = -Infinity;
      for (const w of ws) {
        const gap = w.x - end;
        const charW = w.s.length ? w.w / w.s.length : 5;
        if (out) out += gap > Math.max(14, charW * 3) ? " | " : gap > charW * 0.25 || !/^[,.;:)]/.test(w.s) ? " " : "";
        out += w.s.trim();
        end = w.x + w.w;
      }
      return out.replace(/\s{2,}/g, " ").trim();
    })
    .filter(Boolean)
    .join("\n");
}

/** Approximate size of a data URL once sent. */
const sizeOf = (images: string[]) => images.reduce((n, i) => n + i.length, 0);

/**
 * Reads every page of a PDF in the browser: the text with its layout (for the reader)
 * and the plain text (for the on-device rules). Pages without a text layer (scans,
 * faxes, a photo pasted into the PDF) are rendered to images so they get read too.
 * Photos are resized.
 */
async function prepare(file: File, onStatus: (s: string) => void) {
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!isPdf) {
    onStatus("Preparing photo…");
    const jpg = await toJpeg(file);
    return { text: "", layout: "", images: jpg ? [jpg] : [], pages: 1 };
  }
  onStatus("Opening PDF…");
  const { getDocumentProxy, extractText, renderPageAsImage } = await import("unpdf");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const pdf = await getDocumentProxy(bytes.slice());
  const pages = Math.min(pdf.numPages, MAX_PAGES);
  let text = "";
  try {
    const r = await extractText(pdf, { mergePages: true });
    text = Array.isArray(r.text) ? r.text.join("\n") : r.text;
  } catch {}

  const parts: string[] = [];
  const scanned: number[] = [];
  for (let p = 1; p <= pages; p++) {
    onStatus(pages > 1 ? `Reading page ${p} of ${pages}…` : "Reading page…");
    let body = "";
    try {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      body = pageLines(content.items as unknown as TextItem[]);
    } catch {}
    if (body.replace(/\s/g, "").length < 40) scanned.push(p);
    parts.push(`--- Page ${p} of ${pdf.numPages} ---\n${body || "(no text on this page, see the page image)"}`);
  }
  const layout = parts.join("\n\n");

  const images: string[] = [];
  if (scanned.length) {
    const list = scanned.slice(0, MAX_IMAGE_PAGES);
    // Fewer pixels per page when there are many, so they all fit in one upload.
    const width = list.length > 4 ? 1200 : 1500;
    for (const [n, p] of list.entries()) {
      onStatus(`Preparing scanned page ${n + 1} of ${list.length}…`);
      try {
        const png = await renderPageAsImage(bytes.slice(), p, { toDataURL: true, width });
        let jpg = (await toJpeg(png, width, 0.8)) || png;
        if (sizeOf(images) + jpg.length > IMAGE_BUDGET) jpg = (await toJpeg(png, 1000, 0.6)) || jpg;
        if (sizeOf(images) + jpg.length > IMAGE_BUDGET) break;
        images.push(jpg);
      } catch {}
    }
  }
  return { text, layout, images, pages: pdf.numPages };
}

/** Reads text from page images on this device (used when the online reader is busy). */
async function ocr(images: string[], onStatus: (s: string) => void) {
  const { createWorker } = await import("tesseract.js");
  onStatus("Reading the scan on this device…");
  const worker = await createWorker("eng");
  let text = "";
  try {
    for (let i = 0; i < images.length; i++) {
      onStatus(`Reading page ${i + 1} of ${images.length}…`);
      const r = await worker.recognize(images[i]);
      text += `\n${r.data.text}`;
    }
  } finally {
    await worker.terminate();
  }
  return text;
}

async function post(file: File, p: { text: string; layout?: string; images: string[] }) {
  const form = new FormData();
  // The server only needs the file itself when nothing could be prepared here; leaving
  // it out keeps big scans under the upload limit.
  if (!p.text && !p.layout && !p.images.length) form.append("file", file);
  else form.append("name", file.name);
  if (p.text) form.append("text", p.text);
  if (p.layout) form.append("layout", p.layout);
  for (const i of p.images) form.append("images", i);
  const res = await fetch("/api/ratecon", { method: "POST", body: form, signal: AbortSignal.timeout(85000) });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

export async function readRateCon(file: File, onStatus: (s: string) => void): Promise<ReadResult> {
  const prep = await prepare(file, onStatus);
  onStatus(prep.pages > 1 ? `Reading all ${prep.pages} pages…` : "Reading rate confirmation…");
  let r = await post(file, prep);

  // A scan the online reader couldn't handle: read it here, then parse that text.
  const hasText = prep.text.replace(/\s/g, "").length > 80;
  const scanFailed = !hasText && prep.images.length && (!r.ok || !(r.json as ReadResult).data?.stops?.length);
  if (scanFailed) {
    try {
      const ocrText = await ocr(prep.images, onStatus);
      if (ocrText.replace(/\s/g, "").length > 60) {
        onStatus("Filling in the load…");
        const again = await post(file, { text: [prep.text, ocrText].filter(Boolean).join("\n"), images: [] });
        if (again.ok) r = again;
      }
    } catch {
      // keep the first answer
    }
  }
  if (!r.ok) throw new Error((r.json as { error?: string }).error || "Couldn't read this file.");
  return r.json as ReadResult;
}
