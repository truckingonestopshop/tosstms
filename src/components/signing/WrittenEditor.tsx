"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Eraser,
  Eye,
  ImagePlus,
  Indent,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Outdent,
  Plus,
  Redo2,
  Search,
  SeparatorHorizontal,
  Strikethrough,
  Table,
  Trash2,
  Underline,
  Undo2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, Input, Segmented, Select } from "@/components/ui/Field";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/format";
import { AUTO, FIELD_TYPES, TOSS, autoValue, type AutoKey, type FieldType, type SignField, type SignRole } from "@/lib/signing";
import { Modal } from "@/components/ui/Modal";
import { roleColor } from "./FieldBuilder";
import { FieldSettings } from "./FieldSettings";
import { FIELD_ICON as ICON } from "./icons";
import { PdfPages } from "./PdfPages";
import { LETTERHEAD, ORANGE, PAGE, WDOC_CSS, autoLabel, extraOf, fieldToken, fieldTokenLabel, fieldsFromBody, mergeToken, newWrittenField, renderWritten } from "./written";


const GROUPS: { label: string; prefix: string }[] = [
  { label: "Company", prefix: "company." },
  { label: "Signer", prefix: "recipient." },
  { label: "Driver", prefix: "driver." },
  { label: "Date", prefix: "today" },
];
const SAMPLE = {
  company: { name: "SAMPLE TRANSPORT LLC", dba_name: "Sample Trucking", dot_number: "1234567", mc_number: "987654", ein: "12-3456789", address: "100 Main St, Miami, FL 33101", contact_phone: "(305) 555-0100", contact_email: "owner@sample.com", contact_first_name: "Maria", contact_last_name: "Lopez" },
  driver: { name: "John Driver", cdl_number: "D1234567", cdl_state: "FL", dob: "1985-04-12" },
  recipient: { name: "Maria Lopez", email: "owner@sample.com", phone: "(305) 555-0100" },
};

/** The TOSS letterhead at the top of the page while writing (the PDF draws it on every page). */
function LetterheadStrip({ title }: { title: string }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 select-none" style={{ height: LETTERHEAD.top }} aria-hidden>
      <div className="absolute left-0 top-0 h-[62px] w-[62px]" style={{ background: ORANGE, clipPath: "polygon(0 0, 100% 0, 0 100%)" }} />
      <div className="absolute right-0 top-0 h-[62px] w-[62px]" style={{ background: ORANGE, clipPath: "polygon(0 0, 100% 0, 100% 100%)" }} />
      <div className="absolute flex items-center gap-3" style={{ left: PAGE.m, top: 42 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/toss-logo.svg" alt="" style={{ height: 40 }} />
        <div className="text-[15px] font-bold leading-[19px] text-[#111]" style={{ fontFamily: "Arial, Helvetica, sans-serif" }}>
          TRUCKING ONE
          <br />
          STOP SHOP
        </div>
      </div>
      <div className="absolute text-right text-[12.5px] font-bold leading-[18px] text-[#111]" style={{ right: PAGE.m, top: 45, fontFamily: "Arial, Helvetica, sans-serif", maxWidth: 330 }}>
        TRUCKING ONE STOP SHOP CORP
        <div className="truncate uppercase">{title}</div>
      </div>
      <div className="absolute" style={{ left: PAGE.m, right: PAGE.m, top: 100, height: 2.5, background: ORANGE }} />
    </div>
  );
}

/** A toolbar button (keeps the cursor in the text). */
function T({ icon: I, label, on }: { icon: typeof Bold; label: string; on: () => void }) {
  return (
    <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={on} title={label} aria-label={label} className="flex h-8 w-8 items-center justify-center rounded-md text-fg-2 hover:bg-surface-2 hover:text-fg">
      <I className="h-4 w-4" />
    </button>
  );
}
const Sep = () => <span className="mx-1 h-5 w-px bg-line" />;

/**
 * The written-document editor (GHL / PandaDoc style): a letter page you type on, with headings,
 * lists, tables, images, page breaks, values that fill themselves (company, signer, driver, date)
 * and fields for TOSS or each signer. Click a value or field in the text to change or remove it.
 */
export function WrittenEditor({
  body,
  roles,
  onBody,
  onRoles,
  letterhead,
}: {
  body: string;
  roles: SignRole[];
  onBody: (html: string) => void;
  onRoles: (r: SignRole[]) => void;
  /** the TOSS letterhead on every page, with this title */
  letterhead?: { title: string } | null;
}) {
  const ed = useRef<HTMLDivElement>(null);
  const range = useRef<Range | null>(null);
  const img = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<"fields" | "values">("fields");
  const [role, setRole] = useState(roles[0]?.key || TOSS);
  const [q, setQ] = useState("");
  // The value / field chip clicked in the text: a DOM node the editor owns, so it's kept in a ref
  // (changing it is changing the document).
  const selRef = useRef<HTMLElement | null>(null);
  /** what the side panel shows of it (a copy of its data-* attributes) */
  const [sel, setSelInfo] = useState<{ merge?: string; field?: string; type?: string; role?: string; label?: string; required?: string; auto?: string } | null>(null);
  const [selEl, setSelEl] = useState<HTMLElement | null>(null);
  const setSel = (el: HTMLElement | null) => {
    selRef.current = el;
    setSelEl(el);
    setSelInfo(el ? { ...el.dataset } : null);
  };
  const [height, setHeight] = useState(PAGE.h);
  const [previewing, setPreviewing] = useState(false);
  const [shown, setShown] = useState<Awaited<ReturnType<typeof renderWritten>> | null>(null);
  const who = [{ key: TOSS, label: "TOSS (before sending)" }, ...roles];
  const roleLabel = (k: string) => who.find((r) => r.key === k)?.label || k;

  const measure = () => ed.current && setHeight(Math.max(PAGE.h, Math.ceil((ed.current.scrollHeight + PAGE.m * 2) / PAGE.h) * PAGE.h));
  // The text is set once; after that the editor owns it and reports every change.
  const first = useRef(body);
  useEffect(() => {
    if (!ed.current) return;
    ed.current.innerHTML = first.current || "<p><br></p>";
    const h = Math.max(PAGE.h, Math.ceil((ed.current.scrollHeight + PAGE.m * 2) / PAGE.h) * PAGE.h);
    requestAnimationFrame(() => setHeight(h));
  }, []);
  const changed = () => {
    if (!ed.current) return;
    onBody(ed.current.innerHTML);
    measure();
  };
  // Remember where the cursor is, so buttons in the side panel insert there.
  useEffect(() => {
    const keep = () => {
      const s = window.getSelection();
      if (s && s.rangeCount && ed.current?.contains(s.anchorNode)) range.current = s.getRangeAt(0).cloneRange();
    };
    document.addEventListener("selectionchange", keep);
    return () => document.removeEventListener("selectionchange", keep);
  }, []);

  const restore = () => {
    ed.current?.focus();
    const s = window.getSelection();
    let r = range.current;
    // A cursor on the page's own edge (between lines) goes to the end of the line before it,
    // so inserted values and fields land inside that line, not on a line of their own.
    if (r && ed.current && r.collapsed && r.startContainer === ed.current) {
      const prev = ed.current.childNodes[r.startOffset - 1] || ed.current.lastChild;
      if (prev && prev.nodeType === 1 && /^(P|H1|H2|H3|BLOCKQUOTE|DIV)$/.test((prev as Element).tagName)) {
        r = document.createRange();
        r.selectNodeContents(prev);
        r.collapse(false);
      }
    }
    if (s && r) {
      s.removeAllRanges();
      s.addRange(r);
    } else if (s && ed.current) {
      const r = document.createRange();
      r.selectNodeContents(ed.current);
      r.collapse(false);
      s.removeAllRanges();
      s.addRange(r);
    }
  };
  const cmd = (name: string, value?: string) => {
    restore();
    document.execCommand(name, false, value);
    changed();
  };
  /** Puts HTML exactly at the cursor (the browser's own insert pushes value / field chips out of the line). */
  const insert = (html: string) => {
    restore();
    const s = window.getSelection();
    if (!s || !s.rangeCount || !ed.current) return;
    const r = s.getRangeAt(0);
    r.deleteContents();
    const frag = r.createContextualFragment(html);
    const last = frag.lastChild;
    r.insertNode(frag);
    if (last) {
      const after = document.createRange();
      after.setStartAfter(last);
      after.collapse(true);
      s.removeAllRanges();
      s.addRange(after);
      range.current = after.cloneRange();
    }
    changed();
  };

  /** Tables, lines and page breaks go after the line the cursor is on. */
  const insertBlock = (html: string) => {
    restore();
    const s = window.getSelection();
    const root = ed.current;
    if (!root) return;
    let node: Node | null = s && s.rangeCount ? s.getRangeAt(0).startContainer : null;
    while (node && node.parentNode !== root) node = node.parentNode;
    if (node && node.nodeType === 1) (node as Element).insertAdjacentHTML("afterend", html);
    else root.insertAdjacentHTML("beforeend", html);
    changed();
  };
  const addField = (type: FieldType) => {
    const f = newWrittenField(type, role);
    insert(fieldToken(f, roleLabel(role)));
  };
  const addTable = () => {
    const rows = 3,
      cols = 3;
    const cell = (h: boolean) => (h ? "<th>Heading</th>" : "<td><br></td>");
    insertBlock(`<table><tbody>${Array.from({ length: rows }, (_, r) => `<tr>${Array.from({ length: cols }, () => cell(r === 0)).join("")}</tr>`).join("")}</tbody></table><p><br></p>`);
  };
  const addImage = (file: File) => {
    if (!file.type.startsWith("image/")) return toast.error("Pick an image");
    if (file.size > 1.5 * 1024 * 1024) return toast.error("Images up to 1.5 MB");
    const r = new FileReader();
    r.onload = () => insert(`<img src="${r.result}" alt="" style="max-width:240px">`);
    r.readAsDataURL(file);
  };
  const addLink = () => {
    const url = window.prompt("Link address (https://…)");
    if (url && /^https?:\/\//i.test(url)) cmd("createLink", url);
  };

  // Clicking a value / field selects it (to change or remove it).
  const onClick = (e: React.MouseEvent) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>(".tk");
    ed.current?.querySelectorAll(".tk-sel").forEach((x) => x.classList.remove("tk-sel"));
    if (t) t.classList.add("tk-sel");
    setSel(t);
  };
  /** The selected field chip as a field. */
  const chipField = (el: HTMLElement): SignField => ({
    id: el.dataset.field || "",
    type: (el.dataset.type || "text") as FieldType,
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
  /** Changes the selected field chip (its data attributes and its label). */
  const patchField = (p: Partial<SignField>) => {
    const el = selRef.current;
    if (!el) return;
    if (p.label !== undefined) el.dataset.label = p.label;
    if (p.role !== undefined) el.dataset.role = p.role;
    if (p.required !== undefined) el.dataset.required = p.required ? "1" : "";
    if (p.auto !== undefined) el.dataset.auto = p.auto || "";
    const extra = { ...extraOf(el) };
    for (const k of ["value", "options", "validation", "readOnly", "showIf", "formula"] as const) if (k in p) (extra as Record<string, unknown>)[k] = p[k];
    el.dataset.extra = JSON.stringify(extra);
    el.textContent = fieldTokenLabel({ label: el.dataset.label || "", type: el.dataset.type as FieldType }, roleLabel(el.dataset.role || TOSS));
    changed();
    setSel(el);
  };
  const removeSel = () => {
    selRef.current?.remove();
    setSel(null);
    changed();
  };
  const addRole = () => {
    const r = { key: `role${Date.now().toString(36)}`, label: `Signer ${roles.length + 1}` };
    onRoles([...roles, r]);
    setRole(r.key);
  };
  const renameRole = (key: string, label: string) => {
    onRoles(roles.map((x) => (x.key === key ? { ...x, label } : x)));
    ed.current?.querySelectorAll<HTMLElement>(`[data-field][data-role="${key}"]`).forEach((el) => (el.textContent = fieldTokenLabel({ label: el.dataset.label || "", type: el.dataset.type as FieldType }, label)));
    changed();
  };
  const removeRole = (key: string) => {
    if (roles.length <= 1) return;
    ed.current?.querySelectorAll(`[data-field][data-role="${key}"]`).forEach((el) => el.remove());
    onRoles(roles.filter((r) => r.key !== key));
    if (role === key) setRole(roles.find((r) => r.key !== key)!.key);
    changed();
  };
  /** The PDF exactly as it will be sent, with sample company / signer / driver values. */
  const preview = async () => {
    if (!ed.current) return;
    setPreviewing(true);
    try {
      setShown(await renderWritten(ed.current.innerHTML, { merge: (k) => autoValue(k, SAMPLE), toss: {}, letterhead: letterhead ? { title: letterhead.title } : null }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Preview failed");
    }
    setPreviewing(false);
  };

  const fields = useMemo(() => fieldsFromBody(body), [body]);
  const values = AUTO.filter((a) => !q || a.label.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
      <style>{WDOC_CSS}</style>
      <div className="min-w-0">
        <div className="sticky top-0 z-10 mb-3 flex flex-wrap items-center gap-0.5 rounded-xl border border-line bg-surface/95 p-1.5 backdrop-blur">
          <T icon={Undo2} label="Undo" on={() => cmd("undo")} />
          <T icon={Redo2} label="Redo" on={() => cmd("redo")} />
          <Sep />
          <select onMouseDown={() => restore()} onChange={(e) => cmd("formatBlock", e.target.value)} value="" className="h-8 rounded-md border border-line bg-surface px-2 text-xs text-fg-2" aria-label="Text style">
            <option value="" disabled>
              Text style
            </option>
            <option value="P">Normal text</option>
            <option value="H1">Title</option>
            <option value="H2">Heading</option>
            <option value="H3">Subheading</option>
            <option value="BLOCKQUOTE">Quote</option>
          </select>
          <Sep />
          <T icon={Bold} label="Bold" on={() => cmd("bold")} />
          <T icon={Italic} label="Italic" on={() => cmd("italic")} />
          <T icon={Underline} label="Underline" on={() => cmd("underline")} />
          <T icon={Strikethrough} label="Strikethrough" on={() => cmd("strikeThrough")} />
          <label className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md hover:bg-surface-2" title="Text color" onMouseDown={() => restore()}>
            <span className="h-4 w-4 rounded-sm border border-line" style={{ background: "linear-gradient(135deg,#111 50%,#f28c38 50%)" }} />
            <input type="color" className="sr-only" onChange={(e) => cmd("foreColor", e.target.value)} />
          </label>
          <Sep />
          <T icon={AlignLeft} label="Align left" on={() => cmd("justifyLeft")} />
          <T icon={AlignCenter} label="Center" on={() => cmd("justifyCenter")} />
          <T icon={AlignRight} label="Align right" on={() => cmd("justifyRight")} />
          <T icon={AlignJustify} label="Justify" on={() => cmd("justifyFull")} />
          <Sep />
          <T icon={List} label="Bullets" on={() => cmd("insertUnorderedList")} />
          <T icon={ListOrdered} label="Numbers" on={() => cmd("insertOrderedList")} />
          <T icon={Outdent} label="Less indent" on={() => cmd("outdent")} />
          <T icon={Indent} label="More indent" on={() => cmd("indent")} />
          <Sep />
          <T icon={Link2} label="Link" on={addLink} />
          <T icon={ImagePlus} label="Image or logo" on={() => img.current?.click()} />
          <T icon={Table} label="Table" on={addTable} />
          <T icon={Minus} label="Line" on={() => insertBlock("<hr><p><br></p>")} />
          <T icon={SeparatorHorizontal} label="Page break" on={() => insertBlock('<hr class="page-break"><p><br></p>')} />
          <T icon={Eraser} label="Clear formatting" on={() => cmd("removeFormat")} />
          <div className="flex-1" />
          <Button size="sm" variant="outline" onClick={preview} disabled={previewing}>
            <Eye className="h-4 w-4" /> {previewing ? "Making PDF…" : "Preview PDF"}
          </Button>
          <input ref={img} type="file" accept="image/*" className="hidden" onChange={(e) => (e.target.files?.[0] && addImage(e.target.files[0]), (e.target.value = ""))} />
        </div>

        <div className="scrollbar-bold max-h-[calc(100dvh-11rem)] overflow-y-auto overflow-x-auto rounded-xl bg-surface-2/60 p-3 sm:p-6">
          <div
            className="relative mx-auto bg-white shadow-sm ring-1 ring-line"
            style={{
              width: PAGE.w,
              minHeight: height,
              // A dashed line where each page ends (approximately: the PDF never splits a line).
              backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${PAGE.h - 1}px, #f28c3866 ${PAGE.h - 1}px, #f28c3866 ${PAGE.h}px)`,
            }}
          >
            {letterhead && <LetterheadStrip title={letterhead.title} />}
            <div
              ref={ed}
              className="wdoc min-h-full outline-none"
              style={{ padding: PAGE.m, paddingTop: letterhead ? LETTERHEAD.top : PAGE.m, paddingBottom: letterhead ? LETTERHEAD.bottom : PAGE.m, minHeight: height }}
              contentEditable
              suppressContentEditableWarning
              spellCheck
              onInput={changed}
              onClick={onClick}
              onBlur={changed}
            />
          </div>
        </div>
      </div>

      <aside className="scrollbar-bold space-y-4 xl:sticky xl:top-4 xl:max-h-[calc(100dvh-7rem)] xl:self-start xl:overflow-y-auto xl:overflow-x-auto xl:pr-1">
        <div className="rounded-xl border border-line p-3">
          <div className="mb-2 text-xs font-semibold text-fg-2">Who signs</div>
          <ul className="space-y-1.5">
            {roles.map((r) => (
              <li key={r.key} className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: roleColor(roles, r.key) }} />
                <Input value={r.label} onChange={(e) => renameRole(r.key, e.target.value)} className="h-8" aria-label="Signer name" />
                {roles.length > 1 && (
                  <button onClick={() => removeRole(r.key)} className="text-fg-4 hover:text-fg" aria-label={`Remove ${r.label}`}>
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
          <Button size="xs" variant="ghost" onClick={addRole} className="mt-1">
            <Plus className="h-3.5 w-3.5" /> Add signer
          </Button>
        </div>

        <div className="rounded-xl border border-line p-3">
          <Segmented<"fields" | "values">
            size="sm"
            value={tab}
            onChange={setTab}
            options={[
              { value: "fields", label: "Fields" },
              { value: "values", label: "Values" },
            ]}
          />
          {tab === "fields" ? (
            <div className="mt-3">
              <Select value={role} onChange={(e) => setRole(e.target.value)} className="mb-2" aria-label="Filled by">
                {who.map((r) => (
                  <option key={r.key} value={r.key}>
                    Filled by: {r.label}
                  </option>
                ))}
              </Select>
              <div className="scrollbar-bold grid max-h-64 grid-cols-2 gap-1.5 overflow-y-auto pr-1">
                {FIELD_TYPES.map((t) => {
                  const I = ICON[t.v];
                  return (
                    <button key={t.v} onMouseDown={(e) => e.preventDefault()} onClick={() => addField(t.v)} className="flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-2 text-[13px] text-fg-2 hover:border-brand hover:bg-brand/5 hover:text-fg">
                      <I className="h-4 w-4" /> {t.label}
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-fg-3">Goes where the cursor is in the text. TOSS fields are typed in when sending; signer fields become boxes they fill.</p>
            </div>
          ) : (
            <div className="mt-3">
              <div className="relative mb-2">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-4" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a value" className="h-8 pl-8" />
              </div>
              <div className="scrollbar-bold max-h-80 space-y-3 overflow-y-auto pr-1">
                {GROUPS.map((g) => {
                  const list = values.filter((a) => a.v.startsWith(g.prefix));
                  if (!list.length) return null;
                  return (
                    <div key={g.label}>
                      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-fg-4">{g.label}</div>
                      <div className="flex flex-wrap gap-1">
                        {list.map((a) => (
                          <button key={a.v} onMouseDown={(e) => e.preventDefault()} onClick={() => insert(mergeToken(a.v))} className="rounded-md border border-violet-300 bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-800 hover:bg-violet-100 dark:border-violet-500/40 dark:bg-violet-500/10 dark:text-violet-200">
                            {a.label.replace(/^[^:]+:\s*/, "")}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-fg-3">Filled in from the company, the signer or the driver when you send it.</p>
            </div>
          )}
        </div>

        {sel && (
          <div className="rounded-xl border border-brand/50 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-fg-2">{sel.field ? "Selected field" : "Selected value"}</span>
              <button onClick={removeSel} className="text-fg-4 hover:text-red-600" aria-label="Remove">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            {sel.merge ? (
              <Field label="Value">
                <Select
                  value={sel.merge}
                  onChange={(e) => {
                    const el = selRef.current;
                    if (!el) return;
                    el.dataset.merge = e.target.value;
                    el.textContent = autoLabel(e.target.value);
                    changed();
                    setSel(el);
                  }}
                >
                  {AUTO.map((a) => (
                    <option key={a.v} value={a.v}>
                      {a.label}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : (
              selEl && <FieldSettings field={chipField(selEl)} fields={fields} who={who} onChange={patchField} />
            )}
          </div>
        )}

        <div className="rounded-xl border border-line p-3 text-xs text-fg-3">
          <div className="mb-1 font-semibold text-fg-2">In this document</div>
          {fields.length === 0 ? (
            "No fields yet. Add at least one signature for a signer."
          ) : (
            <ul className="space-y-0.5">
              {who.map((r) => {
                const n = fields.filter((f) => f.role === r.key);
                if (!n.length) return null;
                return (
                  <li key={r.key} className={cn("flex items-center gap-1.5")}>
                    <span className="h-2 w-2 rounded-full" style={{ background: roleColor(roles, r.key) }} />
                    {r.label}: {n.map((f) => f.label).join(", ")}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>

      <Modal
        open={!!shown}
        onClose={() => setShown(null)}
        size="lg"
        title="Preview"
        subtitle={shown ? `${shown.pages.length} page${shown.pages.length === 1 ? "" : "s"} · sample values (Sample Transport LLC)` : undefined}
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => {
                if (!shown) return;
                const a = document.createElement("a");
                a.href = URL.createObjectURL(new Blob([shown.bytes.slice().buffer], { type: "application/pdf" }));
                a.download = "preview.pdf";
                a.click();
              }}
            >
              Download
            </Button>
            <Button variant="primary" onClick={() => setShown(null)}>
              Close
            </Button>
          </>
        }
      >
        {shown && (
          <PdfPages
            src={shown.bytes}
            pages={shown.pages}
            overlay={(page) => (
              <div className="pointer-events-none absolute inset-0">
                {shown.fields
                  .filter((f) => f.page === page)
                  .map((f) => (
                    <div
                      key={f.id}
                      className="absolute flex items-center justify-center rounded-[3px] border text-[10px] font-semibold"
                      style={{ left: `${f.x * 100}%`, top: `${f.y * 100}%`, width: `${f.w * 100}%`, height: `${f.h * 100}%`, borderColor: roleColor(roles, f.role), background: `${roleColor(roles, f.role)}1f`, color: roleColor(roles, f.role) }}
                    >
                      {f.type === "checkbox" ? "" : `${f.label} · ${roleLabel(f.role)}`}
                    </div>
                  ))}
              </div>
            )}
          />
        )}
      </Modal>
    </div>
  );
}
