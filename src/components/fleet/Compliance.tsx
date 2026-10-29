"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, FileText, RefreshCw, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, Empty } from "@/components/ui/Bits";
import { Checkbox, Field, Input, Select } from "@/components/ui/Field";
import { DocumentsPanel, ExpiryBadge } from "@/components/docs/DocumentsPanel";
import { SafetyEvents } from "./SafetyEvents";
import { isTerminated } from "./Drivers";
import { truckLabel } from "@/lib/pitch";
import { useStore } from "@/lib/store";
import { openDocument, errMsg } from "@/lib/db";
import { toast } from "@/lib/toast";
import { cn, daysUntil, fmtDay, today } from "@/lib/format";
import { checklist, type CheckItem, type DocState } from "@/lib/docs";
import type { Company, Compliance, FmcsaSafety, ServiceInfo, ServiceKey } from "@/lib/types";

// The DOT Compliance and MCPT tabs of a carrier (shown when it's active in that service).

const ACCEPT = "application/pdf,image/*,.heic,.heif,.doc,.docx";

/** A service's people / options, edited in place and saved to the carrier. */
function ServiceCard({ company, service, title, children }: { company: Company; service: ServiceKey; title: string; children: (v: ServiceInfo, set: (p: ServiceInfo) => void) => React.ReactNode }) {
  const { updateCompany } = useStore();
  const saved = company.services?.[service] ?? {};
  const [v, setV] = useState<ServiceInfo>(saved);
  const dirty = JSON.stringify(v) !== JSON.stringify(saved);
  return (
    <Card className="self-start">
      <CardHeader
        title={title}
        actions={
          dirty && (
            <>
              <Button variant="ghost" size="sm" onClick={() => setV(saved)}>
                Discard
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={async () => {
                  if (await updateCompany(company.id, { services: { ...company.services, [service]: { ...v, on: true } } })) toast.success("Saved");
                }}
              >
                Save
              </Button>
            </>
          )
        }
      />
      <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 sm:p-5">{children(v, (p) => setV((x) => ({ ...x, ...p })))}</div>
    </Card>
  );
}

const TeamList = () => {
  const { members } = useStore();
  return (
    <datalist id="toss-team-c">
      {members.map((m) => (
        <option key={m.user_id} value={m.full_name} />
      ))}
    </datalist>
  );
};

// ---------------------------------------------------------------------------
// To-dos: missing required paperwork, and anything expired or expiring within a month
// ---------------------------------------------------------------------------
type Todo = { key: string; who: string; href: string; item: CheckItem };
const RANK: Record<DocState, number> = { expired: 0, missing: 1, soon: 2, no_date: 3, ok: 4 };

function useTodos(company: Company) {
  const { docTypes, documents, drivers, trucks } = useStore();
  return useMemo(() => {
    const out: Todo[] = [];
    const add = (who: string, href: string, items: CheckItem[]) => {
      for (const i of items) {
        const need = (i.required && i.state === "missing") || i.state === "expired" || i.state === "soon";
        if (need) out.push({ key: `${href}:${i.type.key}`, who, href, item: i });
      }
    };
    add("Carrier", `/fleet?company=${company.id}&tab=docs`, checklist(docTypes, documents, { scope: "company", companyId: company.id }));
    for (const d of drivers.filter((x) => x.company_id === company.id && !isTerminated(x)))
      add(`Driver ${d.name}`, `/fleet?company=${company.id}&tab=drivers&driver=${d.id}`, checklist(docTypes, documents, { scope: "driver", id: d.id, companyId: company.id, licenseExpiry: d.cdl_expiry, waived: d.waived_docs }));
    for (const t of trucks.filter((x) => x.company_id === company.id && x.status !== "inactive"))
      add(truckLabel(t), `/fleet?company=${company.id}&tab=trucks&truck=${t.id}`, checklist(docTypes, documents, { scope: "truck", id: t.id, companyId: company.id }));
    return out.sort((a, b) => RANK[a.item.state] - RANK[b.item.state] || (a.item.doc?.expires_on || "").localeCompare(b.item.doc?.expires_on || ""));
  }, [company.id, docTypes, documents, drivers, trucks]);
}

function Todos({ company }: { company: Company }) {
  const list = useTodos(company);
  const agreement = useStore().documents.some((d) => d.company_id === company.id && d.doc_type === "dot_compliance_agreement");
  return (
    <Card>
      <CardHeader title="To do" subtitle="Missing paperwork, and anything expired or expiring within 30 days" />
      {list.length === 0 && agreement ? (
        <div className="flex items-center gap-2 px-4 py-6 text-[13px] text-fg-3 sm:px-5">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /> Nothing to do. Every required document is on file and current.
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {!agreement && (
            <li className="flex items-center gap-3 px-4 py-2.5 text-[13px] sm:px-5">
              <span className="w-40 shrink-0 truncate text-fg-3">Carrier</span>
              <span className="min-w-0 flex-1 truncate text-fg">DOT compliance agreement</span>
              <span className="text-xs font-medium text-red-700 dark:text-red-300">Missing</span>
            </li>
          )}
          {list.map((t) => (
            <li key={t.key}>
              <Link href={t.href} className="flex items-center gap-3 px-4 py-2.5 text-[13px] hover:bg-surface-2/50 sm:px-5">
                <span className="w-40 shrink-0 truncate text-fg-3">{t.who}</span>
                <span className="min-w-0 flex-1 truncate text-fg">{t.item.type.name}</span>
                {t.item.state === "missing" ? <span className="text-xs font-medium text-red-700 dark:text-red-300">Missing</span> : <ExpiryBadge date={t.item.doc?.expires_on ?? null} />}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Views over every driver / truck at once, next to picking one. */
const VIEWS = [
  { id: "__pending", label: "Pending (missing)", empty: "Nothing missing." },
  { id: "__expired", label: "Expired", empty: "Nothing expired." },
  { id: "__todo", label: "To do (expired + next 30 days)", empty: "Nothing expired or expiring in the next 30 days." },
] as const;

/** Documents of one driver or truck picked from a list, or what's pending / expired / to do across all of them. */
function PickedDocs({ company, scope }: { company: Company; scope: "driver" | "truck" }) {
  const { drivers, trucks, docTypes, documents } = useStore();
  const people = drivers.filter((d) => d.company_id === company.id);
  const units = trucks.filter((t) => t.company_id === company.id);
  const options =
    scope === "driver"
      ? people.map((d) => ({ id: d.id, label: `${d.name}${isTerminated(d) ? " (terminated)" : ""}`, extra: d.cdl_expiry, waived: d.waived_docs }))
      : units.map((t) => ({ id: t.id, label: truckLabel(t), extra: null as string | null, waived: undefined as string[] | undefined }));
  const [id, setId] = useState(options[0]?.id ?? "");
  const view = VIEWS.find((v) => v.id === id);
  const pick = view ? null : (options.find((o) => o.id === id) ?? options[0]);
  // Across all active drivers / trucks: which documents are missing, expired or expiring.
  const rows = (() => {
    if (!view) return [];
    const targets =
      scope === "driver"
        ? people.filter((d) => !isTerminated(d)).map((d) => ({ id: d.id, who: d.name, items: checklist(docTypes, documents, { scope: "driver", id: d.id, companyId: company.id, licenseExpiry: d.cdl_expiry, waived: d.waived_docs }) }))
        : units.filter((t) => t.status !== "inactive").map((t) => ({ id: t.id, who: truckLabel(t), items: checklist(docTypes, documents, { scope: "truck", id: t.id, companyId: company.id }) }));
    return targets
      .flatMap((t) =>
        t.items
          .filter((i) => (view.id === "__pending" ? i.required && i.state === "missing" : view.id === "__expired" ? !!i.doc && i.state === "expired" : !!i.doc && (i.state === "expired" || i.state === "soon")))
          .map((i) => ({ ...t, item: i })),
      )
      .sort((a, b) => (a.item.doc?.expires_on || "").localeCompare(b.item.doc?.expires_on || "") || a.who.localeCompare(b.who));
  })();
  return (
    <Card>
      <CardHeader
        title={scope === "driver" ? "Driver documents" : "Truck documents"}
        actions={
          options.length > 0 && (
            <Select value={view ? view.id : pick?.id} onChange={(e) => setId(e.target.value)} className="h-8 w-60 text-[13px]">
              <optgroup label={scope === "driver" ? "All drivers" : "All trucks"}>
                {VIEWS.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label={scope === "driver" ? "One driver" : "One truck"}>
                {options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </optgroup>
            </Select>
          )
        }
      />
      {view ? (
        rows.length === 0 ? (
          <div className="flex items-center gap-2 px-4 py-6 text-[13px] text-fg-3 sm:px-5">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /> {view.empty}
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((r) => (
              <li key={`${r.id}:${r.item.type.key}`}>
                <button type="button" onClick={() => setId(r.id)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[13px] hover:bg-surface-2/50 sm:px-5">
                  <span className="w-48 shrink-0 truncate text-fg-3">{r.who}</span>
                  <span className="min-w-0 flex-1 truncate text-fg">{r.item.type.name}</span>
                  {r.item.state === "missing" ? <span className="text-xs font-medium text-red-700 dark:text-red-300">Missing</span> : <ExpiryBadge date={r.item.doc?.expires_on ?? null} />}
                </button>
              </li>
            ))}
          </ul>
        )
      ) : (
        <div className="p-4 sm:p-5">
          {!pick ? (
            <Empty icon={FileText} title={scope === "driver" ? "No drivers yet" : "No trucks yet"} className="py-4" />
          ) : (
            <DocumentsPanel
              key={pick.id}
              target={scope === "driver" ? { scope: "driver", id: pick.id, companyId: company.id, licenseExpiry: pick.extra, waived: pick.waived } : { scope: "truck", id: pick.id, companyId: company.id }}
              compact
            />
          )}
        </div>
      )}
    </Card>
  );
}

function CompanyDocs({ company }: { company: Company }) {
  return (
    <Card>
      <CardHeader title="Company documents" />
      <div className="p-4 sm:p-5">
        <DocumentsPanel target={{ scope: "company", companyId: company.id }} compact />
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Safety: BASIC percentiles against their intervention thresholds, ISS score and rating
// ---------------------------------------------------------------------------
const BASICS: { key: string; label: string; threshold: number }[] = [
  { key: "unsafe_driving", label: "Unsafe Driving", threshold: 65 },
  { key: "crash", label: "Crash Indicator", threshold: 65 },
  { key: "hos", label: "HOS Compliance", threshold: 65 },
  { key: "vehicle_maintenance", label: "Vehicle Maintenance", threshold: 80 },
  { key: "drugs_alcohol", label: "Controlled Substances / Alcohol", threshold: 80 },
  { key: "hazmat", label: "Hazmat Compliance", threshold: 80 },
  { key: "driver_fitness", label: "Driver Fitness", threshold: 80 },
];
const RATINGS = ["Satisfactory", "Conditional", "Unsatisfactory", "Not rated"];

const numOrNull = (s: string) => (s.trim() === "" || Number.isNaN(Number(s)) ? null : Number(s));

function Safety({ company }: { company: Company }) {
  const { updateCompany } = useStore();
  const saved: Compliance = company.compliance ?? {};
  const [c, setC] = useState<Compliance>(saved);
  const [pulling, setPulling] = useState(false);
  const [pullError, setPullError] = useState<string | null>(null);
  const dirty = JSON.stringify(c) !== JSON.stringify(saved);
  const f = c.fmcsa ?? null;
  const basic = (k: string) => c.basics?.[k] ?? {};
  const setBasic = (k: string, p: { score?: number | null; threshold?: number | null }) => setC((x) => ({ ...x, basics: { ...x.basics, [k]: { ...x.basics?.[k], ...p } } }));
  const alerts = BASICS.filter((b) => {
    const s = basic(b.key).score;
    return (s != null && s >= (basic(b.key).threshold ?? b.threshold)) || !!f?.basics[b.key]?.alert;
  });

  /** FMCSA numbers through Lead Hunter; saved right away (typed scores stay as they are). */
  const pull = async (quiet = false) => {
    if (!company.dot_number) return quiet ? undefined : toast.error("Add the USDOT number first");
    setPulling(true);
    setPullError(null);
    try {
      const res = await fetch(`/api/hunter/safety?dot=${encodeURIComponent(company.dot_number)}`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `Error ${res.status}`);
      const fm = body as FmcsaSafety;
      const next: Compliance = { ...(company.compliance ?? {}), fmcsa: fm, safety_rating: company.compliance?.safety_rating || fm.rating || null };
      if (await updateCompany(company.id, { compliance: next })) {
        setC((x) => ({ ...x, fmcsa: fm, safety_rating: x.safety_rating || fm.rating || null }));
        if (!quiet) toast.success("Safety data updated from Lead Hunter");
      }
    } catch (e) {
      setPullError((e as Error).message);
      if (!quiet) toast.error((e as Error).message);
    }
    setPulling(false);
  };

  // Fresh data when the tab opens: pulled if never pulled or older than a week.
  const autoRef = useRef(false);
  useEffect(() => {
    const stale = !saved.fmcsa || Date.now() - Date.parse(saved.fmcsa.pulled_at) > 7 * 86400000;
    if (autoRef.current || !stale || !company.dot_number) return;
    autoRef.current = true;
    pull(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company.id]);

  const pctTile = (label: string, rate: number | null | undefined, nat: number | null | undefined, inspections: number | null | undefined) => (
    <Tile
      label={label}
      value={rate == null ? "—" : `${rate}%`}
      tone={rate != null && nat != null && rate > nat ? "bad" : rate != null ? "good" : undefined}
      sub={rate == null ? "No inspections" : `${inspections ?? 0} inspections${nat != null ? ` · national ${nat}%` : ""}`}
    />
  );

  return (
    <Card>
      <CardHeader
        title="Safety scores"
        subtitle={
          f
            ? `From Lead Hunter · updated ${fmtDay(f.pulled_at.slice(0, 10))}`
            : saved.updated_on
              ? `Updated ${fmtDay(saved.updated_on, true)}`
              : company.dot_number
                ? "Pulled from Lead Hunter"
                : "Add the USDOT number to pull it from Lead Hunter"
        }
        actions={
          <>
            {dirty && (
              <>
                <Button variant="ghost" size="sm" onClick={() => setC(saved)}>
                  Discard
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={async () => {
                    const next = { ...c, updated_on: today() };
                    if (await updateCompany(company.id, { compliance: next })) {
                      setC(next);
                      toast.success("Safety scores saved");
                    }
                  }}
                >
                  Save
                </Button>
              </>
            )}
            <Button variant="outline" size="sm" onClick={() => pull()} loading={pulling} disabled={!company.dot_number}>
              {!pulling && <RefreshCw className="h-3.5 w-3.5" />} {f ? "Refresh" : "Pull from Lead Hunter"}
            </Button>
          </>
        }
      />
      {pullError && !f && <div className="mx-4 mt-3 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300 sm:mx-5">Couldn&apos;t pull safety data: {pullError}</div>}

      {f && (
        <div className="grid grid-cols-2 gap-px border-b border-line bg-line sm:grid-cols-5">
          <Tile label="Safety rating" value={f.rating || "Not rated"} sub={f.rating_date ? `since ${fmtDay(f.rating_date)}` : "FMCSA"} tone={f.rating === "Satisfactory" ? "good" : f.rating === "Conditional" || f.rating === "Unsatisfactory" ? "bad" : undefined} />
          <Tile label="Inspections · 24 mo" value={f.inspections_24m == null ? "—" : String(f.inspections_24m)} sub={f.last_inspection ? `last ${fmtDay(f.last_inspection)}` : "None on record"} />
          {pctTile("Driver out-of-service", f.driver_oos_rate, f.driver_oos_national, f.driver_inspections)}
          {pctTile("Vehicle out-of-service", f.vehicle_oos_rate, f.vehicle_oos_national, f.vehicle_inspections)}
          <Tile
            label="Crashes · 24 mo"
            value={f.crashes_24m == null ? "—" : String(f.crashes_24m)}
            tone={f.crashes_24m ? "bad" : f.crashes_24m === 0 ? "good" : undefined}
            sub={f.crashes_24m ? [f.crashes_fatal && `${f.crashes_fatal} fatal`, f.crashes_injury && `${f.crashes_injury} injury`, f.crashes_tow && `${f.crashes_tow} tow-away`].filter(Boolean).join(" · ") || "Reported" : "None reported"}
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-3 sm:p-5">
        <Field label="Safety rating">
          <Select value={c.safety_rating || ""} onChange={(e) => setC((x) => ({ ...x, safety_rating: e.target.value || null }))}>
            <option value="">—</option>
            {RATINGS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="ISS score" hint="1–100 (higher means more likely to be inspected) · not published, type it in">
          <Input type="number" min={1} max={100} value={c.iss_score ?? ""} onChange={(e) => setC((x) => ({ ...x, iss_score: numOrNull(e.target.value) }))} />
        </Field>
        <div className="flex items-end pb-1">
          {alerts.length > 0 ? (
            <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-amber-700 dark:text-amber-300">
              <AlertTriangle className="h-4 w-4" /> {alerts.length} BASIC{alerts.length > 1 ? "s" : ""} in alert
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-[13px] text-fg-3">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /> No alerts
            </span>
          )}
        </div>
      </div>
      <div className="overflow-x-auto border-t border-line">
        <table className="w-full min-w-[640px] text-left text-[13px]">
          <thead className="text-[11px] uppercase tracking-wider text-fg-4">
            <tr>
              <th className="px-4 py-2 font-medium sm:px-5">BASIC</th>
              <th className="w-32 px-2 py-2 font-medium">Measure</th>
              <th className="w-28 px-2 py-2 font-medium">Score %</th>
              <th className="w-28 px-2 py-2 font-medium">Threshold %</th>
              <th className="w-24 px-4 py-2 font-medium sm:px-5">Alert</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {BASICS.map((b) => {
              const v = basic(b.key);
              const fm = f?.basics[b.key];
              const limit = v.threshold ?? b.threshold;
              const alert = (v.score != null && v.score >= limit) || !!fm?.alert;
              return (
                <tr key={b.key}>
                  <td className="px-4 py-1.5 text-fg sm:px-5">{b.label}</td>
                  <td className="tnum px-2 py-1.5 text-fg-2" title={fm?.inspections_with_violation != null ? `${fm.inspections_with_violation} inspections with a violation` : undefined}>
                    {fm?.measure != null ? fm.measure.toFixed(2) : <span className="text-fg-4">{f ? (b.key === "crash" || b.key === "hazmat" ? "Not public" : "—") : "—"}</span>}
                  </td>
                  <td className="px-2 py-1.5">
                    <Input className="h-8" type="number" min={0} max={100} value={v.score ?? ""} onChange={(e) => setBasic(b.key, { score: numOrNull(e.target.value) })} />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input className="h-8" type="number" min={0} max={100} value={v.threshold ?? ""} placeholder={String(b.threshold)} onChange={(e) => setBasic(b.key, { threshold: numOrNull(e.target.value) })} />
                  </td>
                  <td className="px-4 py-1.5 sm:px-5">
                    {alert ? <span className="text-xs font-semibold text-red-700 dark:text-red-300">Alert</span> : <span className="text-xs text-fg-4">{v.score == null && !fm ? "—" : "OK"}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/** One number in the FMCSA strip. */
function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "bad" }) {
  return (
    <div className="bg-surface px-4 py-3 sm:px-5">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-fg-4">{label}</div>
      <div className={cn("tnum mt-1 text-lg font-bold", tone === "bad" ? "text-red-600 dark:text-red-400" : tone === "good" ? "text-emerald-600 dark:text-emerald-400" : "text-fg")}>{value}</div>
      {sub && <div className="mt-0.5 truncate text-[11px] text-fg-3">{sub}</div>}
    </div>
  );
}

export function DotComplianceTab({ company }: { company: Company }) {
  return (
    <div className="space-y-4">
      <TeamList />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[360px_1fr]">
        <ServiceCard company={company} service="dot_compliance" title="Safety account manager">
          {(v, set) => (
            <>
              <Field label="SAM" className="sm:col-span-2">
                <Input value={v.sam || ""} onChange={(e) => set({ sam: e.target.value })} list="toss-team-c" />
              </Field>
              <Field label="Set up date" className="sm:col-span-2">
                <Input type="date" value={v.activation_date || ""} onChange={(e) => set({ activation_date: e.target.value || null })} />
              </Field>
            </>
          )}
        </ServiceCard>
        <Todos company={company} />
      </div>
      <Safety company={company} />
      <SafetyEvents company={company} kind="inspection" />
      <SafetyEvents company={company} kind="accident" />
      <CompanyDocs company={company} />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <PickedDocs company={company} scope="driver" />
        <PickedDocs company={company} scope="truck" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MCPT: agent, documents, and the permits list (with expiry, optionally for one truck)
// ---------------------------------------------------------------------------
const PERMITS = ["ny_hut_permit", "nm_state_permit", "ky_state_permit", "or_state_permit", "ct_state_permit", "road_taxes_2290_permit", "ifta", "ucr"];

function Permits({ company }: { company: Company }) {
  const { documents, docTypes, trucks, uploadDocument, addDocType, docTypeName } = useStore();
  const known = PERMITS.filter((k) => docTypes.some((t) => t.key === k));
  const custom = docTypes.filter((t) => !known.includes(t.key) && /permit/i.test(t.name)).map((t) => t.key);
  const types = [...known, ...custom];
  const [type, setType] = useState(types[0] ?? "");
  const [other, setOther] = useState("");
  const [truck, setTruck] = useState("");
  const [expires, setExpires] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const permitKeys = new Set(types);
  const list = documents
    .filter((d) => d.company_id === company.id && permitKeys.has(d.doc_type))
    .sort((a, b) => (a.expires_on || "9999").localeCompare(b.expires_on || "9999"));

  const ready = () => {
    if (type === "__other" && !other.trim()) return toast.error("Type the permit name first."), false;
    return true;
  };
  const add = async (files: FileList | null) => {
    if (!files?.length || !ready()) return;
    setBusy(true);
    let key = type;
    if (type === "__other") {
      const name = /permit/i.test(other) ? other.trim() : `${other.trim()} permit`;
      const t = docTypes.find((x) => x.name.toLowerCase() === name.toLowerCase()) ?? (await addDocType(name, "truck"));
      if (!t) return setBusy(false);
      key = t.key;
      setType(t.key);
      setOther("");
    }
    let n = 0;
    for (const f of Array.from(files)) if (await uploadDocument(f, { company_id: company.id, doc_type: key, truck_id: truck || null, expires_on: expires || null })) n++;
    setBusy(false);
    if (n) {
      toast.success(`${docTypeName(key)} added`);
      setExpires("");
    }
  };

  return (
    <Card>
      <CardHeader title="Permits" subtitle="Pending list: expired and expiring permits come first" />
      <div className="m-4 grid grid-cols-1 gap-2.5 rounded-xl border border-dashed border-line-strong bg-surface-2/40 p-3 sm:m-5 sm:grid-cols-4 sm:items-end">
        <Field label="Permit">
          <Select value={type} onChange={(e) => setType(e.target.value)}>
            {types.map((k) => (
              <option key={k} value={k}>
                {docTypeName(k)}
              </option>
            ))}
            <option value="__other">Other (type the name)…</option>
          </Select>
        </Field>
        {type === "__other" && (
          <Field label="Permit name">
            <Input value={other} onChange={(e) => setOther(e.target.value)} placeholder="e.g. NJ permit" autoFocus />
          </Field>
        )}
        <Field label="Expires (optional)">
          <Input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
        </Field>
        <Field label="Truck (optional)">
          <Select value={truck} onChange={(e) => setTruck(e.target.value)}>
            <option value="">Whole fleet</option>
            {trucks
              .filter((t) => t.company_id === company.id)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {truckLabel(t)}
                </option>
              ))}
          </Select>
        </Field>
        <Button variant="secondary" onClick={() => ready() && input.current?.click()} loading={busy}>
          {!busy && <UploadCloud className="h-4 w-4" />} Add permit
        </Button>
        <input
          ref={input}
          type="file"
          multiple
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            add(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      {list.length === 0 ? (
        <p className="px-4 pb-5 text-[13px] text-fg-4 sm:px-5">No permits on file yet.</p>
      ) : (
        <ul className="divide-y divide-line border-t border-line">
          {list.map((d) => {
            const left = daysUntil(d.expires_on);
            return (
              <li key={d.id} className={cn("flex items-center gap-3 px-4 py-2.5 text-[13px] sm:px-5", left != null && left > 30 && "opacity-80")}>
                <span className="w-40 shrink-0 truncate font-medium text-fg">{docTypeName(d.doc_type)}</span>
                <span className="w-20 shrink-0 text-xs text-fg-3">{d.truck_id ? `Unit ${trucks.find((t) => t.id === d.truck_id)?.unit_number ?? ""}` : "Fleet"}</span>
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate text-left text-fg-3 hover:text-fg hover:underline"
                  onClick={() => openDocument(d.file_path, d.file_name).catch((e) => toast.error(`Couldn't open the file: ${errMsg(e)}`))}
                >
                  {d.file_name}
                </button>
                <ExpiryBadge date={d.expires_on} />
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

export function McptTab({ company }: { company: Company }) {
  return (
    <div className="space-y-4">
      <TeamList />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[360px_1fr]">
        <ServiceCard company={company} service="mcpt" title="MCPT">
          {(v, set) => (
            <>
              <Field label="MCPT agent" className="sm:col-span-2">
                <Input value={v.agent || ""} onChange={(e) => set({ agent: e.target.value })} list="toss-team-c" />
              </Field>
              <Field label="Set up date">
                <Input type="date" value={v.activation_date || ""} onChange={(e) => set({ activation_date: e.target.value || null })} />
              </Field>
              <div className="flex items-end pb-2">
                <Checkbox checked={!!v.fuel_taxes} onChange={(x) => set({ fuel_taxes: x })} label="Fuel taxes" />
              </div>
            </>
          )}
        </ServiceCard>
        <Permits company={company} />
      </div>
      <CompanyDocs company={company} />
      <PickedDocs company={company} scope="truck" />
    </div>
  );
}
