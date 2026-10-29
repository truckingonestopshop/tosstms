"use client";

import { Suspense, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Download, Paperclip, Plus, Search, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, Empty, Page, PageHeader, Pill, neutralPill } from "@/components/ui/Bits";
import { Checkbox, Field, Input, Select } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { confirmDialog } from "@/components/ui/Confirm";
import { useAcc } from "@/components/accounting/AccountingProvider";
import { TxModal } from "@/components/accounting/TxModal";
import { Kpi } from "@/components/dashboard/Widgets";
import { errMsg, sb } from "@/lib/db";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { addDays, cn, fmtDay, money, today } from "@/lib/format";
import { downloadCsv } from "@/lib/csv";
import { ACC_BUCKET, missingFile, openAccFile, type AccTransaction, type TxKind } from "@/lib/accounting";

// The tracker: every expense, incoming and transfer, with filters, search, bulk re-categorize,
// CSV export (for the accountant) and CSV import (bank statements).

type Range = "month" | "last_month" | "30d" | "90d" | "year" | "all" | "custom";

function rangeOf(r: Range, from: string, to: string): { from: string; to: string } {
  const t = today();
  const d = new Date(`${t}T12:00:00`);
  const ymd = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  if (r === "month") return { from: t.slice(0, 8) + "01", to: t };
  if (r === "last_month") return { from: ymd(new Date(d.getFullYear(), d.getMonth() - 1, 1)), to: ymd(new Date(d.getFullYear(), d.getMonth(), 0)) };
  if (r === "30d") return { from: addDays(t, -29), to: t };
  if (r === "90d") return { from: addDays(t, -89), to: t };
  if (r === "year") return { from: `${d.getFullYear()}-01-01`, to: t };
  if (r === "custom") return { from: from || "2000-01-01", to: to || "2999-12-31" };
  return { from: "2000-01-01", to: "2999-12-31" };
}

export default function TransactionsPage() {
  return (
    <Suspense>
      <Transactions />
    </Suspense>
  );
}

function Transactions() {
  const params = useSearchParams();
  const { memberName, members, companies, companyById } = useStore();
  const { txs, categories, merchants, methods, accounts, fields, settings } = useAcc();
  const [range, setRange] = useState<Range>((params.get("range") as Range) || "month");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [kind, setKind] = useState<TxKind | "all">((params.get("kind") as TxKind) || "all");
  const [cat, setCat] = useState(params.get("category") || "all");
  const [merchant, setMerchant] = useState(params.get("merchant") || "all");
  const [account, setAccount] = useState(params.get("account") || "all");
  const [person, setPerson] = useState("all");
  const [company, setCompany] = useState("all");
  const [tag, setTag] = useState("");
  const [noFile, setNoFile] = useState(params.get("missing") === "1");
  const [uncat, setUncat] = useState(params.get("uncategorized") === "1");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState<TxKind | null>(null);
  const [editing, setEditing] = useState<AccTransaction | null>(null);
  const [bulkCat, setBulkCat] = useState("");
  const [importing, setImporting] = useState(false);

  const catName = (id: string | null) => categories.rows.find((c) => c.id === id)?.name || "";
  const merchName = (id: string | null) => merchants.rows.find((m) => m.id === id)?.name || "";
  const accName = (id: string | null) => accounts.rows.find((a) => a.id === id)?.name || "";
  const methodOf = (id: string | null) => methods.rows.find((m) => m.id === id);
  const who = (t: AccTransaction) => (t.kind === "expense" ? merchName(t.merchant_id) || t.counterparty || "—" : t.kind === "income" ? t.counterparty || "—" : `${accName(t.account_id)} → ${accName(t.to_account_id)}`);
  const accountOf = (t: AccTransaction) => t.account_id || methodOf(t.payment_method_id)?.account_id || null;

  const r = rangeOf(range, from, to);
  const list = useMemo(
    () =>
      txs.rows
        .filter((t) => t.date >= r.from && t.date <= r.to)
        .filter((t) => kind === "all" || t.kind === kind)
        .filter((t) => cat === "all" || t.category_id === cat)
        .filter((t) => merchant === "all" || t.merchant_id === merchant)
        .filter((t) => account === "all" || accountOf(t) === account || t.to_account_id === account || t.payment_method_id === account)
        .filter((t) => person === "all" || t.processed_by === person)
        .filter((t) => company === "all" || t.company_id === company)
        .filter((t) => !tag || t.tags.some((x) => x.toLowerCase() === tag.toLowerCase()))
        .filter((t) => !noFile || missingFile(t, settings))
        .filter((t) => !uncat || (t.kind !== "transfer" && !t.category_id))
        .filter((t) => {
          if (!q) return true;
          const hay = `${who(t)} ${catName(t.category_id)} ${t.notes || ""} ${t.tags.join(" ")} ${t.amount} ${companyById(t.company_id)?.name || ""} ${Object.values(t.custom || {}).join(" ")}`;
          return hay.toLowerCase().includes(q.toLowerCase());
        })
        .sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [txs.rows, r.from, r.to, kind, cat, merchant, account, person, company, tag, noFile, uncat, q, settings, categories.rows, merchants.rows, accounts.rows, methods.rows],
  );
  const tIn = list.filter((t) => t.kind === "income").reduce((s, t) => s + Number(t.amount), 0);
  const tOut = list.filter((t) => t.kind === "expense").reduce((s, t) => s + Number(t.amount), 0);
  const tags = [...new Set(txs.rows.flatMap((t) => t.tags))].sort();
  const filtered = kind !== "all" || cat !== "all" || merchant !== "all" || account !== "all" || person !== "all" || company !== "all" || tag || noFile || uncat || q;

  const clearFilters = () => {
    setKind("all");
    setCat("all");
    setMerchant("all");
    setAccount("all");
    setPerson("all");
    setCompany("all");
    setTag("");
    setNoFile(false);
    setUncat(false);
    setQ("");
  };

  const exportCsv = () =>
    downloadCsv(`toss-accounting-${r.from}-${r.to}.csv`, [
      ["Date", "Type", "Merchant / from", "Category", "Amount", "Account", "Payment method", "Processed by", "Company", "Status", "Tags", "Notes", "Receipt", ...fields.rows.filter((f) => f.active).map((f) => f.label)],
      ...list.map((t) => [
        t.date,
        t.kind === "income" ? "Incoming" : t.kind === "expense" ? "Expense" : "Transfer",
        who(t),
        catName(t.category_id),
        t.kind === "expense" ? -Number(t.amount) : Number(t.amount),
        accName(accountOf(t)),
        methodOf(t.payment_method_id)?.name || "",
        t.processed_by ? memberName(t.processed_by) : "",
        companyById(t.company_id)?.name || "",
        t.status,
        t.tags.join(", "),
        t.notes || "",
        t.files.length ? "Yes" : "No",
        ...fields.rows.filter((f) => f.active).map((f) => (t.custom?.[f.id] == null ? "" : String(t.custom[f.id]))),
      ]),
    ]);

  const recategorize = async () => {
    if (!bulkCat || !sel.size) return;
    const ids = [...sel];
    const { error } = await sb().from("acc_transactions").update({ category_id: bulkCat }).in("id", ids);
    if (error) return toast.error(errMsg(error));
    for (const t of txs.rows.filter((x) => sel.has(x.id))) txs.put({ ...t, category_id: bulkCat });
    toast.success(`${ids.length} re-categorized`);
    setSel(new Set());
    setBulkCat("");
  };
  const removeSelected = async () => {
    const ids = [...sel];
    if (!ids.length || !(await confirmDialog({ title: `Delete ${ids.length} transaction${ids.length > 1 ? "s" : ""}?`, body: "Their receipts / proofs are deleted too.", confirmLabel: "Delete", danger: true }))) return;
    const paths = txs.rows.filter((t) => sel.has(t.id)).flatMap((t) => t.files.map((x) => x.path));
    const { error } = await sb().from("acc_transactions").delete().in("id", ids);
    if (error) return toast.error(errMsg(error));
    if (paths.length) await sb().storage.from(ACC_BUCKET).remove(paths);
    for (const id of ids) txs.drop(id);
    setSel(new Set());
  };

  const allSel = list.length > 0 && list.every((t) => sel.has(t.id));

  return (
    <Page>
      <PageHeader
        eyebrow="TOSS Accounting"
        title="Transactions"
        actions={
          <>
            <Button variant="outline" onClick={() => setImporting(true)}>
              <Upload className="h-4 w-4" /> Import CSV
            </Button>
            <Button variant="outline" onClick={exportCsv} disabled={!list.length}>
              <Download className="h-4 w-4" /> Export
            </Button>
            <Button variant="outline" onClick={() => setAdding("transfer")}>
              <ArrowLeftRight className="h-4 w-4" /> Transfer
            </Button>
            <Button variant="secondary" onClick={() => setAdding("income")}>
              <ArrowDownLeft className="h-4 w-4" /> Add incoming
            </Button>
            <Button variant="primary" onClick={() => setAdding("expense")}>
              <Plus className="h-4 w-4" /> Add expense
            </Button>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Money in" value={money(tIn)} sub={`${list.filter((t) => t.kind === "income").length} incoming`} />
        <Kpi label="Money out" value={money(tOut)} sub={`${list.filter((t) => t.kind === "expense").length} expenses`} />
        <Kpi label="Net" value={money(tIn - tOut)} sub={tIn - tOut >= 0 ? "In the green" : "Spent more than came in"} />
        <Kpi label="Missing receipts" value={String(list.filter((t) => missingFile(t, settings)).length)} sub="In this list" />
      </div>

      {/* Filters */}
      <Card className="mb-3 p-3">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-4" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Merchant, from, category, notes, tag, amount…" className="pl-9" />
          </div>
          <Select value={range} onChange={(e) => setRange(e.target.value as Range)} className="lg:w-40" aria-label="Dates">
            <option value="month">This month</option>
            <option value="last_month">Last month</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="year">This year</option>
            <option value="all">All time</option>
            <option value="custom">Custom…</option>
          </Select>
          {range === "custom" && (
            <div className="flex gap-2">
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" />
            </div>
          )}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Select value={kind} onChange={(e) => setKind(e.target.value as TxKind | "all")} className="w-auto" aria-label="Type">
            <option value="all">All types</option>
            <option value="expense">Expenses</option>
            <option value="income">Incoming</option>
            <option value="transfer">Transfers</option>
          </Select>
          <Select value={cat} onChange={(e) => setCat(e.target.value)} className="w-auto" aria-label="Category">
            <option value="all">All categories</option>
            {categories.rows.map((c) => (
              <option key={c.id} value={c.id}>
                {c.kind === "income" ? "↓ " : ""}
                {c.name}
              </option>
            ))}
          </Select>
          <Select value={merchant} onChange={(e) => setMerchant(e.target.value)} className="w-auto" aria-label="Merchant">
            <option value="all">All merchants</option>
            {merchants.rows.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
          <Select value={account} onChange={(e) => setAccount(e.target.value)} className="w-auto" aria-label="Account or method">
            <option value="all">All accounts & methods</option>
            {accounts.rows.map((a) => (
              <option key={a.id} value={a.id}>
                Account · {a.name}
              </option>
            ))}
            {methods.rows.map((m) => (
              <option key={m.id} value={m.id}>
                Method · {m.name}
              </option>
            ))}
          </Select>
          <Select value={person} onChange={(e) => setPerson(e.target.value)} className="w-auto" aria-label="Processed by">
            <option value="all">Anyone</option>
            {members.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.full_name || m.email}
              </option>
            ))}
          </Select>
          <Select value={company} onChange={(e) => setCompany(e.target.value)} className="w-auto" aria-label="Company">
            <option value="all">Any company</option>
            {[...companies]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </Select>
          {tags.length > 0 && (
            <Select value={tag} onChange={(e) => setTag(e.target.value)} className="w-auto" aria-label="Tag">
              <option value="">Any tag</option>
              {tags.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </Select>
          )}
          <Checkbox checked={noFile} onChange={setNoFile} label="Missing receipt" />
          <Checkbox checked={uncat} onChange={setUncat} label="Uncategorized" />
          {filtered && (
            <Button size="sm" variant="ghost" onClick={clearFilters}>
              <X className="h-3.5 w-3.5" /> Clear
            </Button>
          )}
        </div>
      </Card>

      {sel.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface-2/60 px-3 py-2 text-[13px]">
          <b className="text-fg">{sel.size} selected</b>
          <Select value={bulkCat} onChange={(e) => setBulkCat(e.target.value)} className="w-auto">
            <option value="">Change category to…</option>
            {categories.rows.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Button size="sm" variant="secondary" onClick={recategorize} disabled={!bulkCat}>
            Apply
          </Button>
          <Button size="sm" variant="danger-ghost" onClick={removeSelected}>
            Delete
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSel(new Set())} className="ml-auto">
            Clear selection
          </Button>
        </div>
      )}

      {list.length === 0 ? (
        <Card>
          <Empty icon={ArrowLeftRight} title={txs.rows.length ? "No transactions match" : "No transactions yet"} body={txs.rows.length ? "Try another date range or clear the filters." : "Add your first expense or incoming money, or import a bank CSV."} />
        </Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-[13px]">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-fg-4">
                <th className="w-10 px-3 py-2">
                  <input type="checkbox" checked={allSel} onChange={() => setSel(allSel ? new Set() : new Set(list.map((t) => t.id)))} aria-label="Select all" className="accent-[var(--brand)]" />
                </th>
                <th className="px-2 py-2 font-semibold">Date</th>
                <th className="px-3 py-2 font-semibold">Merchant / from</th>
                <th className="px-3 py-2 font-semibold">Category</th>
                <th className="px-3 py-2 font-semibold">Account · method</th>
                <th className="px-3 py-2 font-semibold">Processed by</th>
                <th className="px-3 py-2 font-semibold">Receipt</th>
                <th className="px-4 py-2 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {list.map((t) => {
                const c = categories.rows.find((x) => x.id === t.category_id);
                const m = methodOf(t.payment_method_id);
                const miss = missingFile(t, settings);
                return (
                  <tr key={t.id} onClick={() => setEditing(t)} className={cn("cursor-pointer border-b border-line last:border-b-0 hover:bg-surface-2/50", sel.has(t.id) && "bg-brand/5")}>
                    <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={sel.has(t.id)}
                        onChange={() =>
                          setSel((s) => {
                            const n = new Set(s);
                            if (n.has(t.id)) n.delete(t.id);
                            else n.add(t.id);
                            return n;
                          })
                        }
                        aria-label="Select"
                        className="accent-[var(--brand)]"
                      />
                    </td>
                    <td className="whitespace-nowrap px-2 py-2.5 text-fg-2">{fmtDay(t.date)}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        {t.kind === "income" ? <ArrowDownLeft className="h-3.5 w-3.5 text-emerald-500" /> : t.kind === "expense" ? <ArrowUpRight className="h-3.5 w-3.5 text-fg-4" /> : <ArrowLeftRight className="h-3.5 w-3.5 text-sky-500" />}
                        <span className="font-medium text-fg">{who(t)}</span>
                        {t.status === "pending" && <Pill className={neutralPill}>Pending</Pill>}
                      </div>
                      <div className="truncate text-[11px] text-fg-4">{[companyById(t.company_id)?.name, t.tags.join(", "), t.notes].filter(Boolean).join(" · ")}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      {c ? (
                        <span className="inline-flex items-center gap-1.5 text-fg-2">
                          <span className="h-2 w-2 rounded-full" style={{ background: c.color || "#9ca3af" }} />
                          {c.name}
                        </span>
                      ) : t.kind === "transfer" ? (
                        <span className="text-fg-4">Transfer</span>
                      ) : (
                        <span className="text-amber-600 dark:text-amber-400">Uncategorized</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-fg-2">{[accName(accountOf(t)), m?.name].filter(Boolean).join(" · ") || "—"}</td>
                    <td className="px-3 py-2.5 text-fg-2">{t.processed_by ? memberName(t.processed_by) : "—"}</td>
                    <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                      {t.files.length ? (
                        <button type="button" onClick={() => openAccFile(t.files[0]).catch((e) => toast.error(errMsg(e)))} className="inline-flex items-center gap-1 text-fg-2 hover:text-fg" title={t.files.map((f) => f.name).join(", ")}>
                          <Paperclip className="h-3.5 w-3.5" /> {t.files.length}
                        </button>
                      ) : miss ? (
                        <span className="text-xs text-amber-600 dark:text-amber-400">Missing</span>
                      ) : (
                        <span className="text-fg-4">—</span>
                      )}
                    </td>
                    <td className={cn("tnum whitespace-nowrap px-4 py-2.5 text-right font-semibold", t.kind === "income" ? "text-emerald-600 dark:text-emerald-400" : t.kind === "transfer" ? "text-fg-2" : "text-fg")}>
                      {t.kind === "expense" ? "−" : t.kind === "income" ? "+" : ""}
                      {money(Number(t.amount))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      <TxModal open={!!adding} kind={adding || "expense"} onClose={() => setAdding(null)} />
      <TxModal open={!!editing} kind={editing?.kind || "expense"} tx={editing} onClose={() => setEditing(null)} />
      <ImportCsv open={importing} onClose={() => setImporting(false)} />
    </Page>
  );
}

/** Split a CSV line, quotes aware. */
function csvRow(line: string) {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (q && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else q = !q;
    } else if (ch === "," && !q) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/** "03/15/2026", "2026-03-15", "3/15/26" → "2026-03-15". */
function toDay(s: string) {
  const t = s.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const m = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (!m) return "";
  const y = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${y}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

/**
 * Bank statement import: pick the date / description / amount columns (one signed amount, or
 * separate debit and credit), the account, and preview. Known merchants get their category; the
 * rest come in uncategorized, ready to tag in bulk. Receipts are added afterwards.
 */
function ImportCsv({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { me } = useStore();
  const { accounts, merchants, txs } = useAcc();
  const [rows, setRows] = useState<string[][]>([]);
  const [head, setHead] = useState<string[]>([]);
  const [map, setMap] = useState({ date: "", desc: "", amount: "", debit: "", credit: "" });
  const [account, setAccount] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const close = () => {
    setRows([]);
    setHead([]);
    onClose();
  };
  const load = async (f: File | undefined) => {
    if (!f) return;
    const lines = (await f.text()).split(/\r?\n/).filter((l) => l.trim());
    const all = lines.map(csvRow);
    const h = all[0] || [];
    setHead(h);
    setRows(all.slice(1));
    const find = (re: RegExp) => String(h.findIndex((x) => re.test(x.toLowerCase())));
    const idx = (re: RegExp) => (find(re) === "-1" ? "" : find(re));
    setMap({ date: idx(/date|posted/), desc: idx(/desc|merchant|payee|name|memo/), amount: idx(/^amount$|amount/), debit: idx(/debit|withdrawal/), credit: idx(/credit|deposit/) });
  };
  const parsed = rows
    .map((r) => {
      const n = (i: string) => (i === "" ? 0 : Number((r[Number(i)] || "").replace(/[$,\s]/g, "").replace(/^\((.*)\)$/, "-$1")) || 0);
      const amount = map.amount !== "" ? n(map.amount) : n(map.credit) - Math.abs(n(map.debit));
      return { date: toDay(r[Number(map.date)] || ""), desc: (r[Number(map.desc)] || "").trim(), amount };
    })
    .filter((x) => x.date && x.amount);
  const doImport = async () => {
    if (!account) return toast.error("Pick the account this statement is from");
    setBusy(true);
    const rowsOut = parsed.map((p) => {
      const m = merchants.rows.find((x) => p.desc.toLowerCase().includes(x.name.toLowerCase()));
      return {
        kind: p.amount < 0 ? "expense" : "income",
        date: p.date,
        amount: Math.abs(p.amount),
        account_id: account,
        merchant_id: p.amount < 0 ? m?.id || null : null,
        counterparty: p.amount < 0 ? (m ? null : p.desc) : p.desc,
        category_id: p.amount < 0 ? m?.default_category_id || null : null,
        processed_by: me.id,
        notes: `Imported: ${p.desc}`,
        tags: ["imported"],
      };
    });
    const { data, error } = await sb().from("acc_transactions").insert(rowsOut).select();
    setBusy(false);
    if (error) return toast.error(errMsg(error));
    for (const t of (data || []) as AccTransaction[]) txs.put(t);
    toast.success(`${rowsOut.length} transactions imported (tag: imported)`);
    close();
  };
  const col = (k: keyof typeof map, label: string) => (
    <Field label={label}>
      <Select value={map[k]} onChange={(e) => setMap({ ...map, [k]: e.target.value })}>
        <option value="">—</option>
        {head.map((h, i) => (
          <option key={i} value={String(i)}>
            {h || `Column ${i + 1}`}
          </option>
        ))}
      </Select>
    </Field>
  );
  return (
    <Modal
      open={open}
      onClose={close}
      title="Import a bank statement (CSV)"
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" onClick={doImport} disabled={!parsed.length || busy} loading={busy}>
            Import {parsed.length || ""}
          </Button>
        </>
      }
    >
      {!head.length ? (
        <div className="flex flex-col items-center rounded-xl border border-dashed border-line-strong px-4 py-8 text-center">
          <Upload className="h-6 w-6 text-fg-3" />
          <div className="mt-2 text-[13px] font-semibold text-fg">Choose the CSV your bank exports</div>
          <div className="text-xs text-fg-3">Negative amounts (or the debit column) come in as expenses, positive (credit) as incoming.</div>
          <input ref={input} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => load(e.target.files?.[0])} />
          <Button size="sm" variant="outline" className="mt-3" onClick={() => input.current?.click()}>
            Choose file
          </Button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {col("date", "Date column")}
            {col("desc", "Description column")}
            {col("amount", "Amount (signed)")}
            {col("debit", "…or debit column")}
            {col("credit", "…and credit column")}
            <Field label="Account" required>
              <Select value={account} onChange={(e) => setAccount(e.target.value)}>
                <option value="">Select an account</option>
                {accounts.rows.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="mt-3 max-h-[300px] overflow-y-auto rounded-lg border border-line">
            <table className="w-full text-[12px]">
              <tbody>
                {parsed.slice(0, 50).map((p, i) => (
                  <tr key={i} className="border-b border-line last:border-b-0">
                    <td className="px-3 py-1.5 text-fg-3">{p.date}</td>
                    <td className="px-3 py-1.5 text-fg">{p.desc}</td>
                    <td className={cn("tnum px-3 py-1.5 text-right", p.amount < 0 ? "text-fg" : "text-emerald-600 dark:text-emerald-400")}>{money(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-fg-3">
            {parsed.length} rows ready{parsed.length > 50 ? " (showing 50)" : ""}. Known merchants get their category; the rest come in uncategorized, tagged &quot;imported&quot;.
          </p>
        </>
      )}
    </Modal>
  );
}
