"use client";

import { AUTO, FIELD_TYPES, TOSS, newFieldId, type AutoKey, type FieldType, type PageSize, type SignField } from "@/lib/signing";

// Written templates (kind "written"): HTML typed in the editor, with two kinds of tokens in it:
//   merge values  <span data-merge="company.name">  → replaced by the value when it's sent
//   fields        <span data-field="id" data-type…> → TOSS's are typed in before sending; signers'
//                 become boxes on the PDF, at the place they end up after the text is laid out.
// The same CSS lays out the editor and the PDF, so what you type is what gets signed.

/** Letter page in CSS px (96 per inch): 8.5 × 11 in, 0.75 in margins. */
export const PAGE = { w: 816, h: 1056, m: 72 };
export const CONTENT_W = PAGE.w - PAGE.m * 2;
const CONTENT_H = PAGE.h - PAGE.m * 2;

/** Size of a field box in the text (px). */
export const FIELD_BOX: Record<FieldType, { w: number; h: number }> = {
  signature: { w: 230, h: 50 },
  initials: { w: 70, h: 36 },
  date: { w: 120, h: 22 },
  text: { w: 220, h: 22 },
  name: { w: 220, h: 22 },
  email: { w: 220, h: 22 },
  company: { w: 240, h: 22 },
  title: { w: 160, h: 22 },
  number: { w: 110, h: 22 },
  dropdown: { w: 180, h: 24 },
  radio: { w: 180, h: 44 },
  checkbox: { w: 16, h: 16 },
  attachment: { w: 180, h: 26 },
};

export const WDOC_CSS = `
.wdoc { font-family: Arial, Helvetica, sans-serif; font-size: 14px; line-height: 1.5; color: #111; word-wrap: break-word; }
.wdoc p { margin: 0 0 10px; min-height: 1.5em; }
.wdoc h1 { font-size: 26px; font-weight: 700; margin: 0 0 12px; line-height: 1.25; }
.wdoc h2 { font-size: 20px; font-weight: 700; margin: 14px 0 8px; line-height: 1.3; }
.wdoc h3 { font-size: 16px; font-weight: 700; margin: 12px 0 6px; }
.wdoc ul { list-style: disc; padding-left: 26px; margin: 0 0 10px; }
.wdoc ol { list-style: decimal; padding-left: 26px; margin: 0 0 10px; }
.wdoc li { margin: 2px 0; }
.wdoc table { border-collapse: collapse; width: 100%; margin: 0 0 12px; }
.wdoc td, .wdoc th { border: 1px solid #c8c8cc; padding: 6px 8px; vertical-align: top; }
.wdoc th { background: #f4f4f5; font-weight: 700; text-align: left; }
.wdoc img { max-width: 100%; height: auto; display: inline-block; }
.wdoc hr { border: 0; border-top: 1px solid #d4d4d8; margin: 12px 0; }
.wdoc hr.page-break { border-top: 2px dashed #f28c38; margin: 18px 0; }
.wdoc a { color: #1d4ed8; text-decoration: underline; }
.wdoc blockquote { border-left: 3px solid #d4d4d8; margin: 0 0 10px; padding-left: 12px; color: #444; }
.wdoc .tk { display: inline-flex; align-items: center; vertical-align: middle; border-radius: 4px; padding: 0 6px; font-size: 12px; line-height: 1.6; font-weight: 600; white-space: nowrap; cursor: pointer; user-select: none; }
.wdoc .tk-merge { background: #ede9fe; color: #5b21b6; border: 1px solid #c4b5fd; }
.wdoc .tk-field { background: #e0f2fe; color: #075985; border: 1px dashed #0284c7; }
.wdoc .tk-field[data-role="toss"] { background: #f4f4f5; color: #3f3f46; border-color: #a1a1aa; }
.wdoc .tk.tk-sel { outline: 2px solid #f28c38; outline-offset: 1px; }
`;

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
export const autoLabel = (k: string) => AUTO.find((a) => a.v === k)?.label || k;

export function mergeToken(key: AutoKey) {
  return `<span class="tk tk-merge" data-merge="${key}" contenteditable="false">${esc(autoLabel(key))}</span>&nbsp;`;
}

export function fieldTokenLabel(f: Pick<SignField, "label" | "type">, roleLabel: string) {
  return `${f.label || FIELD_TYPES.find((t) => t.v === f.type)?.label} · ${roleLabel}`;
}
/** A field's other settings (choices, format check, read-only, condition, formula) on its chip. */
export type FieldExtra = Pick<SignField, "options" | "validation" | "readOnly" | "showIf" | "formula">;
export const extraOf = (el: HTMLElement): FieldExtra => {
  try {
    return JSON.parse(el.dataset.extra || "{}") as FieldExtra;
  } catch {
    return {};
  }
};
export function fieldToken(f: Omit<SignField, "x" | "y" | "w" | "h" | "page">, roleLabel: string) {
  const box = FIELD_BOX[f.type];
  const extra: FieldExtra = { options: f.options, validation: f.validation, readOnly: f.readOnly, showIf: f.showIf, formula: f.formula };
  return `<span class="tk tk-field" data-field="${f.id}" data-type="${f.type}" data-role="${esc(f.role)}" data-label="${esc(f.label)}" data-required="${f.required ? "1" : ""}" data-auto="${f.auto || ""}" data-extra="${esc(JSON.stringify(extra))}" contenteditable="false" style="min-width:${Math.min(box.w, 160)}px">${esc(fieldTokenLabel(f, roleLabel))}</span>&nbsp;`;
}
export const newWrittenField = (type: FieldType, role: string): Omit<SignField, "x" | "y" | "w" | "h" | "page"> => {
  const t = FIELD_TYPES.find((x) => x.v === type)!;
  return {
    id: newFieldId(),
    type,
    role,
    label: t.label,
    required: type !== "checkbox",
    auto: t.auto ?? null,
    validation: t.validation ?? null,
    options: type === "dropdown" || type === "radio" ? ["Option 1", "Option 2"] : undefined,
  };
};

const fieldOf = (el: HTMLElement): SignField => ({
  id: el.dataset.field!,
  type: el.dataset.type as FieldType,
  role: el.dataset.role || TOSS,
  label: el.dataset.label || "",
  required: el.dataset.required === "1",
  auto: (el.dataset.auto || null) as AutoKey | null,
  ...extraOf(el),
  page: 0,
  x: 0,
  y: 0,
  w: 0,
  h: 0,
});

/** The fields typed into a written document, in order (no positions yet). */
export function fieldsFromBody(html: string): SignField[] {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  return Array.from(doc.querySelectorAll<HTMLElement>("[data-field]")).map(fieldOf);
}

/** Merge keys used in a written document. */
export function mergesIn(html: string): AutoKey[] {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  return [...new Set(Array.from(doc.querySelectorAll<HTMLElement>("[data-merge]")).map((e) => e.dataset.merge as AutoKey))];
}

/**
 * Lays out a written document on letter pages and makes the PDF. Merge values and TOSS's fields
 * are filled in as text; signer fields become empty boxes and come back with their place on the
 * page (shares of the page, like fields placed on an uploaded PDF).
 */
export async function renderWritten(body: string, opts: { merge: (key: AutoKey) => string; toss: Record<string, string> }): Promise<{ bytes: Uint8Array; pages: PageSize[]; fields: SignField[] }> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas-pro"), import("jspdf")]);
  const host = document.createElement("div");
  host.style.cssText = `position:fixed;left:-20000px;top:0;width:${CONTENT_W}px;background:#fff;`;
  host.innerHTML = `<style>${WDOC_CSS}</style><div class="wdoc"></div>`;
  const root = host.querySelector<HTMLElement>(".wdoc")!;
  root.innerHTML = body;
  document.body.appendChild(host);
  try {
    // Values in, fields as boxes.
    root.querySelectorAll<HTMLElement>("[data-merge]").forEach((el) => {
      const v = opts.merge(el.dataset.merge as AutoKey);
      el.replaceWith(document.createTextNode(v || "____________"));
    });
    const signerFields: HTMLElement[] = [];
    root.querySelectorAll<HTMLElement>("[data-field]").forEach((el) => {
      const f = fieldOf(el);
      if (f.role === TOSS) {
        const v = opts.toss[f.id] || "";
        el.replaceWith(document.createTextNode(f.type === "checkbox" ? (v === "true" ? "☒" : "☐") : v || "____________"));
        return;
      }
      const box = FIELD_BOX[f.type];
      el.removeAttribute("class");
      el.removeAttribute("contenteditable");
      el.textContent = "";
      el.style.cssText = `display:inline-block;vertical-align:bottom;width:${box.w}px;height:${box.h}px;${f.type === "checkbox" ? "border:1px solid #555;" : "border-bottom:1px solid #333;"}`;
      signerFields.push(el);
    });
    root.querySelectorAll(".tk").forEach((el) => el.classList.remove("tk", "tk-sel"));
    // Images must be loaded before measuring.
    await Promise.all(Array.from(root.querySelectorAll("img")).map((img) => (img.complete ? null : new Promise((r) => ((img.onload = r), (img.onerror = r))))));

    // Pagination: nothing straddles a page edge; page breaks start a new page.
    const topOf = (el: Element) => el.getBoundingClientRect().top - root.getBoundingClientRect().top;
    const blocks = (parent: Element): Element[] =>
      Array.from(parent.children).flatMap((el) => {
        const tag = el.tagName;
        if ((tag === "UL" || tag === "OL") && el.getBoundingClientRect().height > CONTENT_H / 2) return Array.from(el.children);
        if (tag === "TABLE" && el.getBoundingClientRect().height > CONTENT_H / 2) return Array.from(el.querySelectorAll("tr"));
        return [el];
      });
    for (const el of blocks(root)) {
      const top = topOf(el);
      const h = el.getBoundingClientRect().height;
      const next = (Math.floor(top / CONTENT_H) + 1) * CONTENT_H;
      const push = (by: number) => {
        if (el.tagName === "TR") (el as HTMLElement).querySelectorAll<HTMLElement>("td,th").forEach((c) => (c.style.paddingTop = `${by + 6}px`));
        else (el as HTMLElement).style.marginTop = `${parseFloat(getComputedStyle(el).marginTop) + by}px`;
      };
      if (el.tagName === "HR" && el.classList.contains("page-break")) {
        (el as HTMLElement).style.cssText = `border:0;margin:0;height:${Math.max(0, next - top)}px;`;
        continue;
      }
      if (top < next && top + h > next && h <= CONTENT_H) push(next - top);
    }

    const total = Math.max(CONTENT_H, root.scrollHeight);
    const count = Math.ceil(total / CONTENT_H);
    const base = root.getBoundingClientRect();
    const fields: SignField[] = signerFields.map((el) => {
      const r = el.getBoundingClientRect();
      const top = r.top - base.top;
      const page = Math.min(count - 1, Math.floor(top / CONTENT_H));
      return { ...fieldOf(el), page, x: (PAGE.m + r.left - base.left) / PAGE.w, y: (PAGE.m + top - page * CONTENT_H) / PAGE.h, w: r.width / PAGE.w, h: r.height / PAGE.h };
    });

    const scale = 2;
    root.style.height = `${count * CONTENT_H}px`;
    const shot = await html2canvas(root, { scale, backgroundColor: "#ffffff", useCORS: true, width: CONTENT_W, height: count * CONTENT_H, windowWidth: CONTENT_W });
    const pdf = new jsPDF({ unit: "pt", format: "letter", orientation: "portrait" });
    for (let p = 0; p < count; p++) {
      const c = document.createElement("canvas");
      c.width = PAGE.w * scale;
      c.height = PAGE.h * scale;
      const g = c.getContext("2d")!;
      g.fillStyle = "#fff";
      g.fillRect(0, 0, c.width, c.height);
      g.drawImage(shot, 0, p * CONTENT_H * scale, CONTENT_W * scale, CONTENT_H * scale, PAGE.m * scale, PAGE.m * scale, CONTENT_W * scale, CONTENT_H * scale);
      if (p > 0) pdf.addPage("letter", "portrait");
      pdf.addImage(c.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, 612, 792);
    }
    return { bytes: new Uint8Array(pdf.output("arraybuffer")), pages: Array.from({ length: count }, () => ({ w: 612, h: 792 })), fields };
  } finally {
    host.remove();
  }
}

export const STARTER = `<h1>Document title</h1><p>This agreement is made on ${"<span class=\"tk tk-merge\" data-merge=\"today\" contenteditable=\"false\">Today&#39;s date</span>"} between Trucking One Stop Shop Corp and <span class="tk tk-merge" data-merge="company.name" contenteditable="false">Company: legal name</span>, MC <span class="tk tk-merge" data-merge="company.mc" contenteditable="false">Company: MC</span>, USDOT <span class="tk tk-merge" data-merge="company.dot" contenteditable="false">Company: USDOT</span>.</p><p>Write the document here. Use the toolbar for headings, lists, tables and images, and the panel on the right to insert values and signature fields.</p>`;
