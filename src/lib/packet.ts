"use client";

import { fetchFileBytes } from "./db";
import type { DocumentItem } from "./types";

const ORDER = ["rate_confirmation", "bol", "pod", "lumper_receipt", "scale_ticket"];

/**
 * Merges a load's paperwork (rate con, BOL, POD, receipts…) into one PDF for the
 * factoring company or the broker. Images are placed on letter-size pages.
 */
export async function buildPacket(docs: DocumentItem[], fileName: string) {
  const { PDFDocument } = await import("pdf-lib");
  const out = await PDFDocument.create();
  const sorted = [...docs].sort((a, b) => {
    const ia = ORDER.indexOf(a.doc_type);
    const ib = ORDER.indexOf(b.doc_type);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
  let added = 0;
  const skipped: string[] = [];
  for (const d of sorted) {
    try {
      const { bytes, type } = await fetchFileBytes(d.file_path);
      const mime = d.mime_type || type || "";
      if (mime.includes("pdf") || d.file_name.toLowerCase().endsWith(".pdf")) {
        const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
        const pages = await out.copyPages(src, src.getPageIndices());
        pages.forEach((p) => out.addPage(p));
        added++;
      } else if (/png|jpe?g/.test(mime) || /\.(png|jpe?g)$/i.test(d.file_name)) {
        const img = /png/.test(mime) || d.file_name.toLowerCase().endsWith(".png") ? await out.embedPng(bytes) : await out.embedJpg(bytes);
        const page = out.addPage([612, 792]);
        const m = 24;
        const scale = Math.min((612 - m * 2) / img.width, (792 - m * 2) / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        page.drawImage(img, { x: (612 - w) / 2, y: (792 - h) / 2, width: w, height: h });
        added++;
      } else {
        skipped.push(d.file_name);
      }
    } catch {
      skipped.push(d.file_name);
    }
  }
  if (!added) throw new Error("None of the files could be added (only PDF, PNG and JPG are supported).");
  const bytes = await out.save();
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return { added, skipped };
}
