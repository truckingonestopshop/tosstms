"use client";

import type { RateConExtract } from "@/lib/types";

export interface ReadResult {
  data: RateConExtract;
  source: "online" | "local";
  routeMiles: number | null;
  notice?: string;
}

/** Downscales any image (PNG page render, phone photo, HEIC on Safari) to a JPEG data URL. */
async function toJpeg(src: Blob | string, maxW = 1600): Promise<string | null> {
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
    return c.toDataURL("image/jpeg", 0.85);
  } catch {
    return null;
  }
}

/**
 * Pulls the text layer out of a PDF in the browser. Scanned / faxed PDFs have no
 * text, so their first pages are rendered to images instead. Photos are resized.
 */
async function prepare(file: File, onStatus: (s: string) => void) {
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!isPdf) {
    onStatus("Preparing photo…");
    const jpg = await toJpeg(file);
    return { text: "", images: jpg ? [jpg] : [] };
  }
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
        const png = await renderPageAsImage(bytes.slice(), p, { toDataURL: true, width: 1600 });
        images.push((await toJpeg(png)) || png);
      } catch {}
    }
  }
  return { text, images };
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

async function post(file: File, text: string, images: string[]) {
  const form = new FormData();
  form.append("file", file);
  if (text) form.append("text", text);
  for (const i of images) form.append("images", i);
  const res = await fetch("/api/ratecon", { method: "POST", body: form, signal: AbortSignal.timeout(75000) });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

export async function readRateCon(file: File, onStatus: (s: string) => void): Promise<ReadResult> {
  const { text, images } = await prepare(file, onStatus);
  onStatus("Reading rate confirmation…");
  let r = await post(file, text, images);

  // A scan the online reader couldn't handle: read it here, then parse that text.
  const scanFailed = !text && images.length && (!r.ok || !(r.json as ReadResult).data?.stops?.length);
  if (scanFailed) {
    try {
      const ocrText = await ocr(images, onStatus);
      if (ocrText.replace(/\s/g, "").length > 60) {
        onStatus("Filling in the load…");
        const again = await post(file, ocrText, []);
        if (again.ok) r = again;
      }
    } catch {
      // keep the first answer
    }
  }
  if (!r.ok) throw new Error((r.json as { error?: string }).error || "Couldn't read this file.");
  return r.json as ReadResult;
}
