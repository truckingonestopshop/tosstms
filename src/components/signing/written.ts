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
/** Room the TOSS letterhead takes at the top and bottom of each page (px). */
export const LETTERHEAD = { top: 138, bottom: 70 };
export const ORANGE = "#F28C38";

let logoP: Promise<HTMLImageElement | null> | null = null;
/** The TOSS logo (same site, so it can be drawn on a canvas). */
function loadLogo() {
  logoP ??= new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = "/brand/toss-logo.svg";
  });
  return logoP;
}

/** The TOSS letterhead on one page: orange corners, logo, company and title, rule, footer. */
function drawLetterhead(g: CanvasRenderingContext2D, s: number, page: number, pages: number, title: string, logo: HTMLImageElement | null) {
  const W = PAGE.w * s;
  const H = PAGE.h * s;
  const m = PAGE.m * s;
  g.save();
  g.fillStyle = ORANGE;
  const c = 62 * s;
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(c, 0);
  g.lineTo(0, c);
  g.closePath();
  g.fill();
  g.beginPath();
  g.moveTo(W, 0);
  g.lineTo(W - c, 0);
  g.lineTo(W, c);
  g.closePath();
  g.fill();
  // Logo and "TRUCKING ONE / STOP SHOP"
  const lh = 40 * s;
  const lw = logo ? (logo.naturalWidth / logo.naturalHeight) * lh || 90 * s : 0;
  if (logo) g.drawImage(logo, m, 42 * s, lw, lh);
  g.fillStyle = "#111111";
  g.textBaseline = "alphabetic";
  g.font = `700 ${15 * s}px Arial, Helvetica, sans-serif`;
  g.fillText("TRUCKING ONE", m + lw + 12 * s, 60 * s);
  g.fillText("STOP SHOP", m + lw + 12 * s, 79 * s);
  // Company and document title, right
  g.textAlign = "right";
  g.font = `700 ${12.5 * s}px Arial, Helvetica, sans-serif`;
  g.fillText("TRUCKING ONE STOP SHOP CORP", W - m, 58 * s);
  let t = title.toUpperCase();
  const max = 330 * s;
  while (t.length > 4 && g.measureText(t).width > max) t = `${t.slice(0, -2).trimEnd()}…`;
  g.fillText(t, W - m, 76 * s);
  // Rule under the header
  g.fillStyle = ORANGE;
  g.fillRect(m, 100 * s, W - 2 * m, 2.5 * s);
  // Footer
  g.fillRect(m, H - 46 * s, W - 2 * m, 1 * s);
  g.fillStyle = "#6b7280";
  g.font = `400 ${9.5 * s}px Arial, Helvetica, sans-serif`;
  g.textAlign = "left";
  g.fillText("Trucking One Stop Shop Corp · TossSign", m, H - 28 * s);
  g.textAlign = "right";
  g.fillText(`Page ${page} of ${pages}`, W - m, H - 28 * s);
  g.restore();
}

/** Size of a field box in the text (px). */
export const FIELD_BOX: Record<FieldType, { w: number; h: number }> = {
  signature: { w: 230, h: 50 },
  initials: { w: 70, h: 36 },
  date: { w: 120, h: 22 },
  fillable_date: { w: 120, h: 22 },
  text: { w: 220, h: 22 },
  name: { w: 220, h: 22 },
  first_name: { w: 150, h: 22 },
  middle_name: { w: 120, h: 22 },
  last_name: { w: 150, h: 22 },
  phone: { w: 150, h: 22 },
  cdl: { w: 160, h: 22 },
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
.wdoc .SpellE, .wdoc .GramE, .wdoc [data-gramm], .wdoc [data-lt-tmp-id], .wdoc [data-ms-editor] { border: 0 !important; background: transparent !important; text-decoration: none !important; box-shadow: none !important; }
`;

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
export const autoLabel = (k: string) => AUTO.find((a) => a.v === k)?.label || k;

export function mergeToken(key: AutoKey) {
  return `<span class="tk tk-merge" data-merge="${key}" contenteditable="false">${esc(autoLabel(key))}</span>&nbsp;`;
}

export function fieldTokenLabel(f: Pick<SignField, "label" | "type">, roleLabel: string) {
  return `${f.label || FIELD_TYPES.find((t) => t.v === f.type)?.label} · ${roleLabel}`;
}
/** A field's other settings (saved value, choices, format check, read-only, condition, formula) on its chip. */
export type FieldExtra = Pick<SignField, "value" | "options" | "validation" | "readOnly" | "showIf" | "formula">;
export const extraOf = (el: HTMLElement): FieldExtra => {
  try {
    return JSON.parse(el.dataset.extra || "{}") as FieldExtra;
  } catch {
    return {};
  }
};
export function fieldToken(f: Omit<SignField, "x" | "y" | "w" | "h" | "page">, roleLabel: string) {
  const box = FIELD_BOX[f.type];
  const extra: FieldExtra = { value: f.value, options: f.options, validation: f.validation, readOnly: f.readOnly, showIf: f.showIf, formula: f.formula };
  return `<span class="tk tk-field" data-field="${f.id}" data-type="${f.type}" data-role="${esc(f.role)}" data-label="${esc(f.label)}" data-required="${f.required ? "1" : ""}" data-auto="${f.auto || ""}" data-extra="${esc(JSON.stringify(extra))}" contenteditable="false" style="min-width:${Math.min(box.w, 160)}px">${esc(fieldTokenLabel(f, roleLabel))}</span>&nbsp;`;
}
export const newWrittenField = (type: FieldType, role: string): Omit<SignField, "x" | "y" | "w" | "h" | "page"> => {
  const t = FIELD_TYPES.find((x) => x.v === type)!;
  return {
    id: newFieldId(),
    type,
    role,
    label: t.label,
    required: type !== "checkbox" && type !== "middle_name",
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
 * Strips Word / Google Docs / Grammarly / browser spellcheck & grammar-checker markup,
 * inline underlines, borders, highlights and extension nodes while keeping document structure
 * and TossSign merge/field tokens intact.
 */
export function cleanWrittenHtml(html: string): string {
  if (typeof DOMParser === "undefined" || !html) return html;
  const doc = new DOMParser().parseFromString(`<div id="__wroot">${html}</div>`, "text/html");
  const container = doc.getElementById("__wroot");
  if (!container) return html;
  container
    .querySelectorAll(
      "style, script, meta, link, xml, grammarly-extension, grammarly-popups, pwa-container, lt-highlighter, lt-div, [data-gramm], [data-gramm_editor], [data-lt-tmp-id], [data-ms-editor]",
    )
    .forEach((el) => el.remove());

  const BLOCK_TAGS = new Set(["P", "DIV", "SECTION", "ARTICLE", "MAIN", "HEADER", "FOOTER", "H1", "H2", "H3", "H4", "H5", "H6", "UL", "OL", "LI", "TABLE", "THEAD", "TBODY", "TFOOT", "TR", "TD", "TH", "BLOCKQUOTE", "HR"]);
  // Unwrap nested layout <div>/<section>/<article> containers that wrap block elements so the document
  // never has a giant multi-paragraph wrapper block.
  let unwrapped = true;
  while (unwrapped) {
    unwrapped = false;
    for (const el of Array.from(container.querySelectorAll<HTMLElement>("div, section, article, main, header, footer"))) {
      if (el.hasAttribute("data-merge") || el.hasAttribute("data-field")) continue;
      const hasBlockChild = Array.from(el.children).some((c) => BLOCK_TAGS.has(c.tagName.toUpperCase()));
      if (hasBlockChild) {
        el.replaceWith(...Array.from(el.childNodes));
        unwrapped = true;
      } else {
        const p = doc.createElement("p");
        if (el.style?.textAlign) p.style.textAlign = el.style.textAlign;
        p.append(...Array.from(el.childNodes));
        el.replaceWith(p);
        unwrapped = true;
      }
    }
  }

  const unwrapTags = new Set(["MARK", "INS", "WBR"]);
  const all = Array.from(container.querySelectorAll<HTMLElement>("*"));
  for (const el of all) {
    if (el.hasAttribute("data-merge") || el.hasAttribute("data-field")) continue;
    const tag = el.tagName.toUpperCase();
    const cls = (el.getAttribute("class") || "").toLowerCase();
    const isExtensionOrWord =
      tag.includes("-") ||
      cls.includes("spelle") ||
      cls.includes("grame") ||
      cls.includes("gramm") ||
      cls.includes("spell") ||
      cls.includes("mso") ||
      cls.includes("pwa-") ||
      cls.includes("lt-");
    if (unwrapTags.has(tag) || isExtensionOrWord) {
      el.replaceWith(...Array.from(el.childNodes));
      continue;
    }
    if (tag === "SPAN" || tag === "FONT") {
      const color = el.style?.color || el.getAttribute("color") || "";
      const hasUnderlineOrBorder =
        (el.style?.textDecoration || "").includes("underline") ||
        (el.style?.textDecorationLine || "").includes("underline") ||
        !!el.style?.borderBottom ||
        !!el.style?.background ||
        !!el.style?.backgroundColor;
      if (color && !hasUnderlineOrBorder && color !== "rgb(17, 17, 17)" && color !== "#111" && color !== "#111111" && color !== "black" && color !== "windowtext") {
        const span = doc.createElement("span");
        span.style.color = color;
        span.append(...Array.from(el.childNodes));
        el.replaceWith(span);
      } else {
        el.replaceWith(...Array.from(el.childNodes));
      }
      continue;
    }
    if (tag === "U" && el.attributes.length > 0) {
      el.replaceWith(...Array.from(el.childNodes));
      continue;
    }
    const align = el.style?.textAlign;
    const href = tag === "A" ? el.getAttribute("href") : null;
    const isPageBreak = tag === "HR" && el.classList.contains("page-break");
    for (const attr of Array.from(el.attributes)) {
      if (attr.name === "src" || attr.name === "alt" || attr.name === "colspan" || attr.name === "rowspan") continue;
      el.removeAttribute(attr.name);
    }
    if (href && /^https?:\/\/|^mailto:|^tel:/i.test(href)) el.setAttribute("href", href);
    if (isPageBreak) el.className = "page-break";
    if (align && ["left", "center", "right", "justify"].includes(align)) {
      el.style.textAlign = align;
    }
  }
  return container.innerHTML;
}

/**
 * Normalizes the live `.wdoc` DOM tree before measuring & paginating so:
 * 1. Stray top-level inline nodes are wrapped in `<p>`.
 * 2. Any `<p>` or `<blockquote>` with internal `<br>` line breaks is split into individual `<p>` lines
 *    so a giant `<br>`-separated block is never pushed as a single unit to the next page.
 */
function normalizeWrittenDom(root: HTMLElement) {
  const BLOCK = new Set(["P", "H1", "H2", "H3", "H4", "H5", "H6", "UL", "OL", "TABLE", "BLOCKQUOTE", "HR"]);
  // 1. Wrap any bare top-level text/inline nodes into <p> elements.
  let run: Node[] = [];
  const flushRun = (before: Node | null) => {
    if (!run.length) return;
    const hasContent = run.some((n) => (n.nodeType === Node.TEXT_NODE ? !!(n.textContent || "").trim() : true));
    if (hasContent) {
      const p = document.createElement("p");
      p.append(...run);
      root.insertBefore(p, before);
    } else {
      run.forEach((n) => n.parentNode?.removeChild(n));
    }
    run = [];
  };
  for (const child of Array.from(root.childNodes)) {
    if (child.nodeType === Node.ELEMENT_NODE && BLOCK.has((child as Element).tagName.toUpperCase())) {
      flushRun(child);
    } else {
      run.push(child);
    }
  }
  flushRun(null);

  // 2. Preserve explicit <ol> item numbers so if a long <li> is split across pages, numbering never shifts.
  for (const ol of Array.from(root.querySelectorAll<HTMLOListElement>("ol"))) {
    Array.from(ol.children).forEach((li, i) => {
      if (li.tagName.toUpperCase() === "LI" && !li.hasAttribute("value")) {
        (li as HTMLLIElement).value = i + 1;
      }
    });
  }

  // 3. Split any <p> that has internal <br> breaks into separate <p> elements so each line paginates naturally.
  for (const p of Array.from(root.querySelectorAll<HTMLElement>("p"))) {
    if (p.closest("td, th, li")) continue;
    let br = p.querySelector("br");
    while (br) {
      // A trailing <br> at the very end of a paragraph is just a line filler; leave or remove it.
      let afterNode: Node | null = br.nextSibling;
      let hasAfter = false;
      let cur: Node | null = br;
      while (cur && cur !== p) {
        let sib = cur.nextSibling;
        while (sib) {
          if (sib.nodeType === Node.TEXT_NODE && (sib.textContent || "").trim()) hasAfter = true;
          else if (sib.nodeType === Node.ELEMENT_NODE && (sib as Element).tagName !== "BR") hasAfter = true;
          else if (sib.nodeType === Node.ELEMENT_NODE && (sib as Element).tagName === "BR" && sib !== afterNode) hasAfter = true;
          sib = sib.nextSibling;
        }
        cur = cur.parentNode;
      }
      if (!hasAfter) break;

      const r = document.createRange();
      r.setStart(p, 0);
      r.setEndBefore(br);
      const frag = r.extractContents();
      const beforeP = p.cloneNode(false) as HTMLElement;
      beforeP.appendChild(frag);
      // Check if this was a double <br><br> (paragraph gap) or single <br> (tight line break)
      afterNode = br.nextSibling;
      while (afterNode && afterNode.nodeType === Node.TEXT_NODE && !(afterNode.textContent || "").trim()) {
        const toRem = afterNode;
        afterNode = afterNode.nextSibling;
        toRem.parentNode?.removeChild(toRem);
      }
      if (afterNode && afterNode.nodeType === Node.ELEMENT_NODE && (afterNode as Element).tagName === "BR") {
        afterNode.parentNode?.removeChild(afterNode);
      } else {
        beforeP.style.marginBottom = "2px";
      }
      br.parentNode?.removeChild(br);
      if ((beforeP.textContent || "").trim() || beforeP.querySelector("img, [data-field]")) {
        p.parentNode?.insertBefore(beforeP, p);
      }
      br = p.querySelector("br");
    }
  }
}

/** Pushes a block element or table row down so its top lands at `targetTop`, accounting for CSS margin collapse. */
function pushElementTo(el: HTMLElement, targetTop: number, rootTop: number) {
  const curTop = el.getBoundingClientRect().top - rootTop;
  const by = targetTop - curTop;
  if (by <= 0) return;
  if (el.tagName.toUpperCase() === "TR") {
    el.querySelectorAll<HTMLElement>("td,th").forEach((c) => {
      c.style.paddingTop = `${parseFloat(getComputedStyle(c).paddingTop) + by}px`;
    });
    return;
  }
  el.style.marginTop = `${parseFloat(getComputedStyle(el).marginTop) + by}px`;
  const afterTop = el.getBoundingClientRect().top - rootTop;
  if (afterTop < targetTop - 0.5) {
    el.style.marginTop = `${parseFloat(el.style.marginTop) + (targetTop - afterTop)}px`;
  }
}

/**
 * When a multi-line `<p>`, `<li>` or `<blockquote>` crosses a page boundary `next`, splits it at the exact
 * word where the overflowing line begins so all lines that fit on the current page stay on the
 * current page and only the remaining lines move to the top of the next page.
 */
function splitBlockAtPageBreak(el: HTMLElement, next: number, rootTop: number): boolean {
  const tag = el.tagName.toUpperCase();
  if (tag !== "P" && tag !== "LI" && tag !== "BLOCKQUOTE") return false;
  // Don't split inside a block that has a tall signature/initials/radio box or nested list.
  if (el.querySelector("ul, ol, table")) return false;
  const hasTallBox = Array.from(el.querySelectorAll<HTMLElement>("[data-field]")).some((f) => f.getBoundingClientRect().height > 28);
  if (hasTallBox) return false;

  const walker = document.createTreeWalker(el, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (node.parentElement?.closest("[data-field]")) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  let splitNode: Node | null = null;
  let splitOffset = 0;
  const probe = document.createRange();

  let n = walker.nextNode();
  while (n) {
    if (n.nodeType === Node.ELEMENT_NODE) {
      const elem = n as HTMLElement;
      if (elem.hasAttribute("data-field") || elem.tagName === "IMG") {
        const rect = elem.getBoundingClientRect();
        if (rect.bottom - rootTop > next + 0.5) {
          const parent = elem.parentNode!;
          splitNode = parent;
          splitOffset = Array.from(parent.childNodes).indexOf(elem);
          break;
        }
      }
    } else if (n.nodeType === Node.TEXT_NODE) {
      const txt = n.textContent || "";
      if (txt.trim()) {
        probe.selectNodeContents(n);
        const fullRect = probe.getBoundingClientRect();
        if (fullRect.bottom - rootTop > next + 0.5) {
          const re = /\S+/g;
          let m: RegExpExecArray | null;
          while ((m = re.exec(txt)) !== null) {
            probe.setStart(n, m.index);
            probe.setEnd(n, m.index + m[0].length);
            const wRect = probe.getBoundingClientRect();
            if (wRect.bottom - rootTop > next + 0.5) {
              splitNode = n;
              splitOffset = m.index;
              break;
            }
          }
          if (splitNode) break;
        }
      }
    }
    n = walker.nextNode();
  }

  if (!splitNode) return false;

  const headRange = document.createRange();
  headRange.setStart(el, 0);
  headRange.setEnd(splitNode, splitOffset);
  const previewFrag = headRange.cloneContents();
  const hasVisibleHead = !!(previewFrag.textContent || "").trim() || !!previewFrag.querySelector("img, [data-field]");
  if (!hasVisibleHead) return false;

  const headFrag = headRange.extractContents();
  const headEl = el.cloneNode(false) as HTMLElement;
  headEl.style.marginBottom = "0px";
  headEl.appendChild(headFrag);

  if (tag === "LI") {
    el.style.listStyleType = "none";
    el.removeAttribute("value");
  }

  // Trim leading whitespace on the first text node of the remainder (`el`) so the new page starts flush left.
  const firstTxt = document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode();
  if (firstTxt && firstTxt.textContent) {
    firstTxt.textContent = firstTxt.textContent.replace(/^\s+/, "");
  }

  el.parentNode?.insertBefore(headEl, el);
  el.style.marginTop = "0px";
  pushElementTo(el, next, rootTop);
  return true;
}

/**
 * Lays out a written document on letter pages and makes the PDF. Merge values and TOSS's fields
 * are filled in as text; signer fields become empty boxes and come back with their place on the
 * page (shares of the page, like fields placed on an uploaded PDF).
 */
export async function renderWritten(
  body: string,
  opts: { merge: (key: AutoKey) => string; toss: Record<string, string>; letterhead?: { title: string } | null },
): Promise<{ bytes: Uint8Array; pages: PageSize[]; fields: SignField[] }> {
  // With the letterhead, the text sits between its header and footer.
  const TOP = opts.letterhead ? LETTERHEAD.top : PAGE.m;
  const CH = PAGE.h - TOP - (opts.letterhead ? LETTERHEAD.bottom : PAGE.m);
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas-pro"), import("jspdf")]);
  window.getSelection?.()?.removeAllRanges?.();
  const host = document.createElement("div");
  host.spellcheck = false;
  host.style.cssText = `position:fixed;left:-20000px;top:0;width:${CONTENT_W}px;background:#fff;user-select:none;`;
  host.innerHTML = `<style>${WDOC_CSS}</style><div class="wdoc" spellcheck="false" data-gramm="false" data-gramm_editor="false" data-enable-grammarly="false"></div>`;
  const root = host.querySelector<HTMLElement>(".wdoc")!;
  root.innerHTML = cleanWrittenHtml(body);
  document.body.appendChild(host);
  try {
    // Values in, fields as boxes.
    root.querySelectorAll<HTMLElement>("[data-merge]").forEach((el) => {
      const v = opts.merge(el.dataset.merge as AutoKey);
      el.replaceWith(document.createTextNode(v || "____________"));
    });
    root.querySelectorAll<HTMLElement>("[data-field]").forEach((el) => {
      const f = fieldOf(el);
      if (f.role === TOSS) {
        const v = opts.toss[f.id] ?? f.value ?? "";
        el.replaceWith(document.createTextNode(f.type === "checkbox" ? (v === "true" ? "☒" : "☐") : v || "____________"));
        return;
      }
      const box = FIELD_BOX[f.type];
      el.removeAttribute("class");
      el.removeAttribute("contenteditable");
      el.textContent = "";
      el.style.cssText = `display:inline-block;vertical-align:bottom;width:${box.w}px;height:${box.h}px;${f.type === "checkbox" ? "border:1px solid #555;" : "border-bottom:1px solid #333;"}`;
    });
    root.querySelectorAll(".tk").forEach((el) => el.classList.remove("tk", "tk-sel"));
    normalizeWrittenDom(root);
    // Images must be loaded before measuring.
    await Promise.all(Array.from(root.querySelectorAll("img")).map((img) => (img.complete ? null : new Promise((r) => ((img.onload = r), (img.onerror = r))))));

    // Pagination: flow lines naturally across pages without pushing whole multi-line blocks or cutting lines in half.
    const collectBlocks = (parent: Element): HTMLElement[] =>
      Array.from(parent.children).flatMap((el) => {
        const tag = el.tagName.toUpperCase();
        if (tag === "UL" || tag === "OL" || tag === "DIV" || tag === "SECTION" || tag === "ARTICLE") return collectBlocks(el);
        if (tag === "TABLE") return Array.from(el.querySelectorAll<HTMLElement>("tr"));
        return [el as HTMLElement];
      });

    const queue = collectBlocks(root);
    let idx = 0;
    let guard = 0;
    while (idx < queue.length && guard++ < 2000) {
      const el = queue[idx];
      const rootTop = root.getBoundingClientRect().top;
      const rect = el.getBoundingClientRect();
      const top = rect.top - rootTop;
      const h = rect.height;
      const next = (Math.floor(Math.max(0, top) / CH) + 1) * CH;
      const tag = el.tagName.toUpperCase();

      if (tag === "HR" && el.classList.contains("page-break")) {
        el.style.cssText = `border:0;margin:0;height:${Math.max(0, next - top)}px;`;
        idx++;
        continue;
      }

      // Keep headings with at least one line of the following paragraph on the same page.
      if ((tag === "H1" || tag === "H2" || tag === "H3") && top < next && next - (top + h) < 24) {
        pushElementTo(el, next, rootTop);
        idx++;
        continue;
      }

      if (top < next && top + h > next + 0.5) {
        if (splitBlockAtPageBreak(el, next, rootTop)) {
          // `el` now starts at `next` and holds the remaining lines; re-check `el` in case it spans another page.
          continue;
        }
        if (h <= CH) {
          pushElementTo(el, next, rootTop);
        }
      }
      idx++;
    }

    const total = Math.max(CH, root.scrollHeight);
    const count = Math.ceil(total / CH);
    const base = root.getBoundingClientRect();
    const signerFields = Array.from(root.querySelectorAll<HTMLElement>("[data-field]"));
    const fields: SignField[] = signerFields.map((el) => {
      const r = el.getBoundingClientRect();
      const top = r.top - base.top;
      const page = Math.min(count - 1, Math.floor(top / CH));
      return { ...fieldOf(el), page, x: (PAGE.m + r.left - base.left) / PAGE.w, y: (TOP + top - page * CH) / PAGE.h, w: r.width / PAGE.w, h: r.height / PAGE.h };
    });

    const scale = 2;
    root.style.height = `${count * CH}px`;
    const shot = await html2canvas(root, { scale, backgroundColor: "#ffffff", useCORS: true, width: CONTENT_W, height: count * CH, windowWidth: CONTENT_W });
    const logo = opts.letterhead ? await loadLogo() : null;
    const pdf = new jsPDF({ unit: "pt", format: "letter", orientation: "portrait" });
    for (let p = 0; p < count; p++) {
      const c = document.createElement("canvas");
      c.width = PAGE.w * scale;
      c.height = PAGE.h * scale;
      const g = c.getContext("2d")!;
      g.fillStyle = "#fff";
      g.fillRect(0, 0, c.width, c.height);
      g.drawImage(shot, 0, p * CH * scale, CONTENT_W * scale, CH * scale, PAGE.m * scale, TOP * scale, CONTENT_W * scale, CH * scale);
      if (opts.letterhead) drawLetterhead(g, scale, p + 1, count, opts.letterhead.title, logo);
      if (p > 0) pdf.addPage("letter", "portrait");
      pdf.addImage(c.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, 612, 792);
    }
    return { bytes: new Uint8Array(pdf.output("arraybuffer")), pages: Array.from({ length: count }, () => ({ w: 612, h: 792 })), fields };
  } finally {
    host.remove();
  }
}

export const STARTER = `<h1>Document title</h1><p>This agreement is made on ${"<span class=\"tk tk-merge\" data-merge=\"today\" contenteditable=\"false\">Today&#39;s date</span>"} between Trucking One Stop Shop Corp and <span class="tk tk-merge" data-merge="company.name" contenteditable="false">Company: legal name</span>, MC <span class="tk tk-merge" data-merge="company.mc" contenteditable="false">Company: MC</span>, USDOT <span class="tk tk-merge" data-merge="company.dot" contenteditable="false">Company: USDOT</span>.</p><p>Write the document here. Use the toolbar for headings, lists, tables and images, and the panel on the right to insert values and signature fields.</p>`;
