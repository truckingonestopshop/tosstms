"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type {
  Company,
  DocType,
  DocumentItem,
  Driver,
  Invoice,
  InvoiceLine,
  InvoicePayment,
  InvoiceStatus,
  Load,
  LoadStatus,
  Member,
  MemberProfile,
  Role,
  Settings,
  Truck,
  Trailer,
} from "./types";
import {
  BUCKET,
  AVATARS,
  clean,
  docPath,
  errMsg,
  normCompany,
  normInvoice,
  normLine,
  normLoad,
  normTruck,
  normTrailer,
  sb,
} from "./db";
import { byTypeOrder, withRules } from "./docs";
import { totals, type InvoiceDraft } from "./invoice";
import { addDays, cut, fmtDay, today } from "./format";
import { toast } from "./toast";

export interface Me {
  id: string;
  email: string;
  fullName: string;
  role: Role;
}

type Scope = "all" | string;

type NewLoad = Omit<Load, "id" | "created_at" | "updated_at" | "dispatcher_cut" | "created_by" | "dispatcher_id"> & {
  dispatcher_id?: string | null;
};

export interface InvoiceDraftInput {
  invoice: Partial<Omit<Invoice, "lines">>;
  lines: (Partial<InvoiceLine> & { id?: string })[];
}

interface Store {
  ready: boolean;
  me: Me;
  isOwner: boolean;
  /** Can open the admin panel (people & access for TMS and Leads). */
  isSuperAdmin: boolean;
  /** Has TOSS Lead Hunter access (for the app switcher). */
  hasLeads: boolean;
  members: Member[];
  companies: Company[];
  drivers: Driver[];
  trucks: Truck[];
  trailers: Trailer[];
  loads: Load[];
  documents: DocumentItem[];
  invoices: Invoice[];
  /** every payment on every invoice, oldest first */
  payments: InvoicePayment[];
  docTypes: DocType[];
  settings: Settings | null;

  scope: Scope;
  setScope: (s: Scope) => void;
  /** Company selected in the header, or null for "All companies". */
  scopedCompany: Company | null;
  inScope: (companyId: string | null | undefined) => boolean;

  companyById: (id: string | null | undefined) => Company | undefined;
  driverById: (id: string | null | undefined) => Driver | undefined;
  truckById: (id: string | null | undefined) => Truck | undefined;
  trailerById: (id: string | null | undefined) => Trailer | undefined;
  memberName: (id: string | null | undefined) => string;
  memberById: (id: string | null | undefined) => Member | undefined;
  /** Save profile fields (your own, or anyone's if you're an owner). */
  updateProfile: (userId: string, patch: Partial<MemberProfile>) => Promise<boolean>;
  /** Upload a new profile photo (already cropped); null removes it. */
  setAvatar: (userId: string, file: Blob | null) => Promise<boolean>;
  docTypeName: (key: string) => string;

  refresh: () => Promise<void>;

  createCompany: (c: Partial<Company>) => Promise<Company | null>;
  updateCompany: (id: string, patch: Partial<Company>) => Promise<boolean>;
  deleteCompany: (id: string) => Promise<boolean>;

  createDriver: (d: Partial<Driver>) => Promise<Driver | null>;
  updateDriver: (id: string, patch: Partial<Driver>) => Promise<boolean>;
  deleteDriver: (id: string) => Promise<boolean>;

  createTruck: (t: Partial<Truck>) => Promise<Truck | null>;
  updateTruck: (id: string, patch: Partial<Truck>) => Promise<boolean>;
  deleteTruck: (id: string) => Promise<boolean>;
  createTrailer: (t: Partial<Trailer>) => Promise<Trailer | null>;
  updateTrailer: (id: string, patch: Partial<Trailer>) => Promise<boolean>;
  deleteTrailer: (id: string) => Promise<boolean>;
  /** Hook a trailer to a truck (null = drop it, power only). Unhooks it from any other truck. */
  hookTrailer: (truckId: string, trailerId: string | null) => Promise<boolean>;
  /** Put a driver on a truck (null = no driver). A driver drives one truck: they leave any other. */
  assignDriver: (truckId: string, driverId: string | null) => Promise<boolean>;

  createLoad: (l: NewLoad) => Promise<Load | null>;
  updateLoad: (id: string, patch: Partial<Load>) => Promise<boolean>;
  setLoadStatus: (ids: string[], status: LoadStatus) => Promise<boolean>;
  deleteLoads: (ids: string[]) => Promise<boolean>;
  duplicateLoad: (id: string) => Promise<Load | null>;

  uploadDocument: (
    file: File,
    meta: { company_id: string; doc_type: string; load_id?: string | null; driver_id?: string | null; truck_id?: string | null; trailer_id?: string | null; expires_on?: string | null; notes?: string | null },
  ) => Promise<DocumentItem | null>;
  updateDocument: (id: string, patch: Partial<DocumentItem>) => Promise<boolean>;
  replaceDocumentFile: (id: string, file: File) => Promise<boolean>;
  deleteDocument: (id: string) => Promise<boolean>;
  addDocType: (name: string, scope: DocType["scope"]) => Promise<DocType | null>;
  renameDocType: (key: string, name: string) => Promise<boolean>;
  /** Required stage, expiry, packet and order of a type (built-in ones too). */
  updateDocType: (key: string, patch: Partial<Pick<DocType, "required_from" | "has_expiry" | "in_packet" | "sort">>) => Promise<boolean>;
  deleteDocType: (key: string) => Promise<boolean>;

  createInvoiceFromLoads: (
    companyId: string,
    loadIds: string[],
    opts: {
      issue_date?: string;
      due_date?: string;
      period_start?: string;
      period_end?: string;
      notes?: string;
      amounts?: Record<string, number>;
      titles?: Record<string, string>;
      /** billing adjustments: additional charges (+) and credits (−) */
      adjustments?: { kind: "charge" | "credit"; description: string; amount: number }[];
    },
  ) => Promise<Invoice | null>;
  createCustomInvoice: (draft: InvoiceDraftInput) => Promise<Invoice | null>;
  saveInvoice: (id: string, draft: InvoiceDraftInput) => Promise<boolean>;
  /** Draft / sent / void. "Paid" comes from recording payments. */
  setInvoiceStatus: (id: string, status: InvoiceStatus) => Promise<boolean>;
  recordPayment: (invoiceId: string, p: Pick<InvoicePayment, "amount" | "paid_on" | "method" | "reference" | "notes">) => Promise<boolean>;
  deletePayment: (id: string) => Promise<boolean>;
  deleteInvoice: (id: string) => Promise<boolean>;

  updateSettings: (patch: Partial<Settings>) => Promise<boolean>;
  addMember: (email: string, role: Role) => Promise<boolean>;
  setMemberRole: (userId: string, role: Role) => Promise<boolean>;
  removeMember: (userId: string) => Promise<boolean>;
}

const Ctx = createContext<Store | null>(null);

const SCOPE_KEY = "toss-tms-scope";

function upsert<T extends { id: string }>(list: T[], row: T, prepend = false): T[] {
  const i = list.findIndex((x) => x.id === row.id);
  if (i === -1) return prepend ? [row, ...list] : [...list, row];
  const next = list.slice();
  next[i] = { ...list[i], ...row };
  return next;
}

function fail(e: unknown, what: string) {
  console.error(what, e);
  toast.error(`${what}: ${errMsg(e)}`);
}

const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name);
const normMember = (r: Member): Member => ({ ...r, languages: Array.isArray(r.languages) ? r.languages : [] });
const byPaidOn = (a: InvoicePayment, b: InvoicePayment) => a.paid_on.localeCompare(b.paid_on) || a.created_at.localeCompare(b.created_at);
const normPayment = (r: InvoicePayment): InvoicePayment => ({ ...r, amount: Number(r.amount) || 0 });

export function StoreProvider({ me, preview = false, children }: { me: Me; preview?: boolean; children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [isSuperAdmin, setSuperAdmin] = useState(false);
  const [hasLeads, setHasLeads] = useState(false);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [trailers, setTrailers] = useState<Trailer[]>([]);
  const [loads, setLoads] = useState<Load[]>([]);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<InvoicePayment[]>([]);
  const [docTypes, setDocTypes] = useState<DocType[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [scope, setScopeState] = useState<Scope>("all");

  // Latest state for async callbacks without re-creating them.
  const ref = useRef({ companies, drivers, trucks, trailers, loads, documents, invoices, docTypes, payments, members });
  ref.current = { companies, drivers, trucks, trailers, loads, documents, invoices, docTypes, payments, members };

  const refresh = useCallback(async () => {
    if (preview && process.env.NODE_ENV !== "production") {
      const { demoData } = await import("./demo");
      const d = demoData();
      setMembers(d.members);
      setSuperAdmin(true);
      setHasLeads(true);
      setCompanies(d.companies);
      setDrivers(d.drivers);
      setTrucks(d.trucks);
      setTrailers(d.trailers);
      setLoads(d.loads);
      setDocuments(d.documents);
      setInvoices(d.invoices);
      setPayments(d.payments);
      setDocTypes(d.docTypes);
      setSettings(d.settings);
      setReady(true);
      return;
    }
    const c = sb();
    // The API caps every response at 1,000 rows, so large tables are read page by page
    // (ordered by id as a tie-breaker so no row is skipped or repeated between pages).
    const all = async <T,>(table: string): Promise<{ data: T[] | null; error: unknown }> => {
      const out: T[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await c.from(table).select("*").order("id").range(from, from + 999);
        if (error) return { data: out.length ? out : null, error };
        out.push(...((data || []) as T[]));
        if (!data || data.length < 1000) return { data: out, error: null };
      }
    };
    const [m, co, dr, tr, trl, lo, docs, inv, lines, dt, st, pay] = await Promise.all([
      c.from("tms_members").select("*").order("full_name"),
      all<Company>("tms_companies"),
      all<Driver>("tms_drivers"),
      all<Truck>("tms_trucks"),
      all<Trailer>("tms_trailers"),
      all<Load>("tms_loads"),
      all<DocumentItem>("tms_documents"),
      all<Invoice>("tms_invoices"),
      all<InvoiceLine>("tms_invoice_lines"),
      c.from("tms_doc_types").select("*").order("name"),
      c.from("tms_settings").select("*").eq("id", 1).maybeSingle(),
      all<InvoicePayment>("tms_invoice_payments"),
    ]);
    // Display order (the pages above are read in id order).
    co.data?.sort(byName);
    dr.data?.sort(byName);
    tr.data?.sort((a, b) => a.unit_number.localeCompare(b.unit_number, undefined, { numeric: true }));
    lo.data?.sort((a, b) => (b.pickup_date || "9").localeCompare(a.pickup_date || "9") || b.created_at.localeCompare(a.created_at));
    docs.data?.sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at));
    inv.data?.sort((a, b) => b.created_at.localeCompare(a.created_at));
    const firstErr = [m, co, dr, tr, lo, docs, inv, lines, dt].find((r) => r.error)?.error;
    if (firstErr) fail(firstErr, "Couldn't load data");
    if (m.data) setMembers((m.data as Member[]).map(normMember));
    if (co.data) setCompanies((co.data as Company[]).map(normCompany));
    if (dr.data) setDrivers(dr.data as Driver[]);
    if (tr.data) setTrucks((tr.data as Truck[]).map(normTruck));
    if (trl.data) setTrailers((trl.data as Trailer[]).map(normTrailer).sort((a, b) => a.unit_number.localeCompare(b.unit_number, undefined, { numeric: true })));
    if (lo.data) setLoads((lo.data as Load[]).map(normLoad));
    if (docs.data) setDocuments(docs.data as DocumentItem[]);
    if (inv.data) {
      const byInvoice = new Map<string, InvoiceLine[]>();
      for (const l of (lines.data || []) as InvoiceLine[]) byInvoice.set(l.invoice_id, [...(byInvoice.get(l.invoice_id) || []), l]);
      setInvoices((inv.data as Invoice[]).map((i) => normInvoice({ ...i, lines: byInvoice.get(i.id) || [] })));
    }
    if (dt.data) setDocTypes((dt.data as DocType[]).map(withRules).sort(byTypeOrder));
    if (st.data) setSettings(st.data as Settings);
    if (pay.data) setPayments((pay.data as InvoicePayment[]).map(normPayment).sort(byPaidOn));
    // Admin panel and app switcher (both are fine to fail quietly).
    c.rpc("toss_is_super_admin").then(({ data }) => setSuperAdmin(data === true));
    c.from("workspace_members").select("user_id").eq("user_id", me.id).limit(1).then(({ data }) => setHasLeads(!!data?.length));
    setReady(true);
  }, []);

  useEffect(() => {
    try {
      const s = localStorage.getItem(SCOPE_KEY);
      if (s) setScopeState(s);
    } catch {}
    refresh();
  }, [refresh]);

  // Access can change while the app is open (an admin grants or removes super admin /
  // Leads access): check again whenever the tab comes back into view.
  useEffect(() => {
    if (preview) return;
    const recheck = () => {
      if (document.visibilityState !== "visible") return;
      const c = sb();
      c.rpc("toss_is_super_admin").then(({ data, error }) => !error && setSuperAdmin(data === true));
      c.from("workspace_members").select("user_id").eq("user_id", me.id).limit(1).then(({ data, error }) => !error && setHasLeads(!!data?.length));
    };
    document.addEventListener("visibilitychange", recheck);
    window.addEventListener("focus", recheck);
    return () => {
      document.removeEventListener("visibilitychange", recheck);
      window.removeEventListener("focus", recheck);
    };
  }, [preview, me.id]);

  // A deleted company can't stay selected.
  useEffect(() => {
    if (ready && scope !== "all" && !companies.some((c) => c.id === scope)) setScopeState("all");
  }, [ready, scope, companies]);

  // Realtime: other dispatchers' changes appear without a reload.
  useEffect(() => {
    const c = sb();
    type Payload = { eventType: "INSERT" | "UPDATE" | "DELETE"; new: Record<string, unknown>; old: Record<string, unknown> };
    // Change messages can arrive with columns missing (large rows, unchanged values),
    // and merging those would blank fields like status, gross or stops. So a change
    // only says "row X changed": the complete row is read back from the database.
    const apply = <T extends { id: string }>(table: string, set: React.Dispatch<React.SetStateAction<T[]>>, norm: (r: T) => T = (r) => r) =>
      async (p: Payload) => {
        const id = ((p.new && p.new.id) || (p.old && p.old.id)) as string | undefined;
        if (!id) return;
        if (p.eventType === "DELETE") {
          set((l) => l.filter((x) => x.id !== id));
          return;
        }
        const { data, error } = await c.from(table).select("*").eq("id", id).maybeSingle();
        if (error) return;
        if (!data) set((l) => l.filter((x) => x.id !== id));
        else set((l) => upsert(l, norm(data as T)));
      };
    const ch = c
      .channel("tms-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "tms_companies" }, apply("tms_companies", setCompanies, normCompany))
      .on("postgres_changes", { event: "*", schema: "public", table: "tms_drivers" }, apply("tms_drivers", setDrivers))
      .on("postgres_changes", { event: "*", schema: "public", table: "tms_members" }, async (p: Payload) => {
        const uid = ((p.new && p.new.user_id) || (p.old && p.old.user_id)) as string | undefined;
        if (!uid) return;
        if (p.eventType === "DELETE") return setMembers((l) => l.filter((m) => m.user_id !== uid));
        const { data } = await c.from("tms_members").select("*").eq("user_id", uid).maybeSingle();
        if (!data) return setMembers((l) => l.filter((m) => m.user_id !== uid));
        const row = normMember(data as Member);
        setMembers((l) => (l.some((m) => m.user_id === uid) ? l.map((m) => (m.user_id === uid ? row : m)) : [...l, row]));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "tms_trucks" }, apply("tms_trucks", setTrucks, normTruck))
      .on("postgres_changes", { event: "*", schema: "public", table: "tms_trailers" }, apply("tms_trailers", setTrailers, normTrailer))
      .on("postgres_changes", { event: "*", schema: "public", table: "tms_loads" }, apply("tms_loads", setLoads, normLoad))
      .on("postgres_changes", { event: "*", schema: "public", table: "tms_documents" }, apply("tms_documents", setDocuments))
      .on("postgres_changes", { event: "*", schema: "public", table: "tms_invoices" }, async (p: Payload) => {
        const id = ((p.new && p.new.id) || (p.old && p.old.id)) as string | undefined;
        if (!id) return;
        if (p.eventType === "DELETE") return setInvoices((l) => l.filter((x) => x.id !== id));
        const { data } = await c.from("tms_invoices").select("*").eq("id", id).maybeSingle();
        if (!data) return setInvoices((l) => l.filter((x) => x.id !== id));
        setInvoices((l) => {
          const prev = l.find((x) => x.id === id);
          return upsert(l, normInvoice({ ...(data as Invoice), lines: prev?.lines || [] }), true);
        });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "tms_invoice_payments" }, apply("tms_invoice_payments", setPayments, normPayment))
      .on("postgres_changes", { event: "*", schema: "public", table: "tms_invoice_lines" }, async (p: Payload) => {
        const id = ((p.new && p.new.id) || (p.old && p.old.id)) as string | undefined;
        if (!id) return;
        if (p.eventType === "DELETE") {
          return setInvoices((l) => l.map((i) => ({ ...i, lines: i.lines.filter((x) => x.id !== id) })));
        }
        const { data } = await c.from("tms_invoice_lines").select("*").eq("id", id).maybeSingle();
        if (!data) return;
        const line = normLine(data as InvoiceLine);
        setInvoices((l) =>
          l.map((i) => (i.id === line.invoice_id ? { ...i, lines: upsert(i.lines, line).sort((a, b) => a.position - b.position) } : i)),
        );
      })
      .subscribe();
    return () => {
      c.removeChannel(ch);
    };
  }, []);

  const setScope = useCallback((s: Scope) => {
    setScopeState(s);
    try {
      localStorage.setItem(SCOPE_KEY, s);
    } catch {}
  }, []);

  const scopedCompany = useMemo(() => (scope === "all" ? null : companies.find((c) => c.id === scope) || null), [scope, companies]);
  const inScope = useCallback((id: string | null | undefined) => scope === "all" || id === scope, [scope]);

  const companyById = useCallback((id: string | null | undefined) => (id ? companies.find((c) => c.id === id) : undefined), [companies]);
  const driverById = useCallback((id: string | null | undefined) => (id ? drivers.find((c) => c.id === id) : undefined), [drivers]);
  const truckById = useCallback((id: string | null | undefined) => (id ? trucks.find((c) => c.id === id) : undefined), [trucks]);
  const trailerById = useCallback((id: string | null | undefined) => (id ? trailers.find((c) => c.id === id) : undefined), [trailers]);
  const memberById = useCallback((id: string | null | undefined) => (id ? members.find((m) => m.user_id === id) : undefined), [members]);
  const memberName = useCallback(
    (id: string | null | undefined) => {
      const m = id ? members.find((x) => x.user_id === id) : undefined;
      return m ? m.full_name || m.email : "—";
    },
    [members],
  );
  const docTypeName = useCallback(
    (key: string) => docTypes.find((d) => d.key === key)?.name || key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    [docTypes],
  );

  // ---------------------------------------------------------------- companies
  const createCompany = useCallback(async (c: Partial<Company>) => {
    const { data, error } = await sb().from("tms_companies").insert(clean(c)).select().single();
    if (error) return fail(error, "Couldn't add the company"), null;
    const row = normCompany(data as Company);
    setCompanies((l) => upsert(l, row).sort(byName));
    return row;
  }, []);

  const updateCompany = useCallback(async (id: string, patch: Partial<Company>) => {
    const { data, error } = await sb().from("tms_companies").update(clean(patch)).eq("id", id).select().single();
    if (error) return fail(error, "Couldn't save the company"), false;
    setCompanies((l) => upsert(l, normCompany(data as Company)).sort(byName));
    return true;
  }, []);

  const deleteCompany = useCallback(async (id: string) => {
    const paths = ref.current.documents.filter((d) => d.company_id === id).map((d) => d.file_path);
    const { error } = await sb().from("tms_companies").delete().eq("id", id);
    if (error) return fail(error, "Couldn't delete the company"), false;
    if (paths.length) await sb().storage.from(BUCKET).remove(paths);
    setCompanies((l) => l.filter((x) => x.id !== id));
    setDrivers((l) => l.filter((x) => x.company_id !== id));
    setTrucks((l) => l.filter((x) => x.company_id !== id));
    setTrailers((l) => l.filter((x) => x.company_id !== id));
    setLoads((l) => l.filter((x) => x.company_id !== id));
    setDocuments((l) => l.filter((x) => x.company_id !== id));
    setInvoices((l) => l.map((x) => (x.company_id === id ? { ...x, company_id: null } : x)));
    return true;
  }, []);

  // ------------------------------------------------------------------ drivers
  const createDriver = useCallback(async (d: Partial<Driver>) => {
    const { data, error } = await sb().from("tms_drivers").insert(clean(d)).select().single();
    if (error) return fail(error, "Couldn't add the driver"), null;
    setDrivers((l) => upsert(l, data as Driver).sort(byName));
    return data as Driver;
  }, []);
  const updateDriver = useCallback(async (id: string, patch: Partial<Driver>) => {
    const { data, error } = await sb().from("tms_drivers").update(clean(patch)).eq("id", id).select().single();
    if (error) return fail(error, "Couldn't save the driver"), false;
    setDrivers((l) => upsert(l, data as Driver));
    return true;
  }, []);
  /** Storage files of documents that the database deleted along with their owner. */
  const removeFiles = async (paths: string[]) => {
    if (paths.length) await sb().storage.from(BUCKET).remove(paths);
  };

  const deleteDriver = useCallback(async (id: string) => {
    const paths = ref.current.documents.filter((d) => d.driver_id === id).map((d) => d.file_path);
    const { error } = await sb().from("tms_drivers").delete().eq("id", id);
    if (error) return fail(error, "Couldn't delete the driver"), false;
    await removeFiles(paths);
    setDrivers((l) => l.filter((x) => x.id !== id));
    setTrucks((l) => l.map((t) => (t.assigned_driver_id === id ? { ...t, assigned_driver_id: null } : t)));
    setLoads((l) => l.map((t) => (t.driver_id === id ? { ...t, driver_id: null } : t)));
    setDocuments((l) => l.filter((x) => x.driver_id !== id));
    return true;
  }, []);

  // ------------------------------------------------------------------- trucks
  const createTruck = useCallback(async (t: Partial<Truck>) => {
    const { data, error } = await sb().from("tms_trucks").insert(clean(t)).select().single();
    if (error) return fail(error, "Couldn't add the truck"), null;
    const row = normTruck(data as Truck);
    setTrucks((l) => upsert(l, row));
    return row;
  }, []);
  const updateTruck = useCallback(async (id: string, patch: Partial<Truck>) => {
    const prev = ref.current.trucks.find((t) => t.id === id);
    if (prev) setTrucks((l) => upsert(l, { ...prev, ...patch }));
    const { data, error } = await sb().from("tms_trucks").update(clean(patch)).eq("id", id).select().single();
    if (error) {
      if (prev) setTrucks((l) => upsert(l, prev));
      return fail(error, "Couldn't save the truck"), false;
    }
    setTrucks((l) => upsert(l, normTruck(data as Truck)));
    return true;
  }, []);
  const deleteTruck = useCallback(async (id: string) => {
    const paths = ref.current.documents.filter((d) => d.truck_id === id).map((d) => d.file_path);
    const { error } = await sb().from("tms_trucks").delete().eq("id", id);
    if (error) return fail(error, "Couldn't delete the truck"), false;
    await removeFiles(paths);
    setTrucks((l) => l.filter((x) => x.id !== id));
    setLoads((l) => l.map((t) => (t.truck_id === id ? { ...t, truck_id: null } : t)));
    setDocuments((l) => l.filter((x) => x.truck_id !== id));
    return true;
  }, []);

  // ----------------------------------------------------------------- trailers
  // Trucks copy their hooked trailer's specs in the database, so trucks are re-read after changes.
  const reloadTrucks = async (ids: string[]) => {
    if (!ids.length) return;
    const { data } = await sb().from("tms_trucks").select("*").in("id", ids);
    if (data) setTrucks((l) => (data as Truck[]).reduce((acc, row) => upsert(acc, normTruck(row)), l));
  };
  const createTrailer = useCallback(async (t: Partial<Trailer>) => {
    const { data, error } = await sb().from("tms_trailers").insert(clean(t)).select().single();
    if (error) return fail(error, "Couldn't add the trailer"), null;
    const row = normTrailer(data as Trailer);
    setTrailers((l) => upsert(l, row));
    return row;
  }, []);
  const updateTrailer = useCallback(async (id: string, patch: Partial<Trailer>) => {
    const prev = ref.current.trailers.find((t) => t.id === id);
    if (prev) setTrailers((l) => upsert(l, { ...prev, ...patch }));
    const { data, error } = await sb().from("tms_trailers").update(clean(patch)).eq("id", id).select().single();
    if (error) {
      if (prev) setTrailers((l) => upsert(l, prev));
      return fail(error, "Couldn't save the trailer"), false;
    }
    setTrailers((l) => upsert(l, normTrailer(data as Trailer)));
    await reloadTrucks(ref.current.trucks.filter((t) => t.trailer_id === id).map((t) => t.id));
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const deleteTrailer = useCallback(async (id: string) => {
    const holders = ref.current.trucks.filter((t) => t.trailer_id === id).map((t) => t.id);
    const paths = ref.current.documents.filter((d) => d.trailer_id === id).map((d) => d.file_path);
    const { error } = await sb().from("tms_trailers").delete().eq("id", id);
    if (error) return fail(error, "Couldn't delete the trailer"), false;
    await removeFiles(paths);
    setTrailers((l) => l.filter((x) => x.id !== id));
    setDocuments((l) => l.filter((x) => x.trailer_id !== id));
    // Loads keep their history without the trailer (the database clears the link too).
    setLoads((l) => l.map((x) => (x.trailer_id === id ? { ...x, trailer_id: null } : x)));
    await reloadTrucks(holders);
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const hookTrailer = useCallback(async (truckId: string, trailerId: string | null) => {
    const others = trailerId ? ref.current.trucks.filter((t) => t.trailer_id === trailerId && t.id !== truckId).map((t) => t.id) : [];
    const { error } = await sb().from("tms_trucks").update({ trailer_id: trailerId }).eq("id", truckId);
    if (error) return fail(error, "Couldn't change the trailer"), false;
    await reloadTrucks([truckId, ...others]);
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const assignDriver = useCallback(async (truckId: string, driverId: string | null) => {
    const before = ref.current.trucks;
    const others = driverId ? before.filter((t) => t.assigned_driver_id === driverId && t.id !== truckId).map((t) => t.id) : [];
    setTrucks((l) => l.map((t) => (t.id === truckId ? { ...t, assigned_driver_id: driverId } : others.includes(t.id) ? { ...t, assigned_driver_id: null } : t)));
    if (others.length) {
      const res = await sb().from("tms_trucks").update({ assigned_driver_id: null }).in("id", others);
      if (res.error) {
        setTrucks(before);
        return fail(res.error, "Couldn't move the driver"), false;
      }
    }
    const { error } = await sb().from("tms_trucks").update({ assigned_driver_id: driverId }).eq("id", truckId);
    if (error) {
      setTrucks(before);
      return fail(error, "Couldn't assign the driver"), false;
    }
    return true;
  }, []);

  // -------------------------------------------------------------------- loads
  const createLoad = useCallback(
    async (l: NewLoad) => {
      const row = { ...l, dispatcher_cut: cut(l.gross_amount, l.commission_percent), dispatcher_id: l.dispatcher_id ?? me.id };
      const { data, error } = await sb().from("tms_loads").insert(clean(row)).select().single();
      if (error) return fail(error, "Couldn't save the load"), null;
      const saved = normLoad(data as Load);
      setLoads((x) => upsert(x, saved, true));
      return saved;
    },
    [me.id],
  );

  const updateLoad = useCallback(async (id: string, patch: Partial<Load>) => {
    const prev = ref.current.loads.find((x) => x.id === id);
    if (!prev) return false;
    const merged = { ...prev, ...patch };
    const full = { ...patch, dispatcher_cut: cut(merged.gross_amount, merged.commission_percent) };
    setLoads((x) => upsert(x, { ...merged, dispatcher_cut: full.dispatcher_cut }));
    const { data, error } = await sb().from("tms_loads").update(clean(full)).eq("id", id).select().single();
    if (error) {
      setLoads((x) => upsert(x, prev));
      return fail(error, "Couldn't save the load"), false;
    }
    setLoads((x) => upsert(x, normLoad(data as Load)));
    return true;
  }, []);

  const setLoadStatus = useCallback(async (ids: string[], status: LoadStatus) => {
    if (!ids.length) return true;
    const prev = ref.current.loads.filter((l) => ids.includes(l.id));
    setLoads((x) => x.map((l) => (ids.includes(l.id) ? { ...l, status } : l)));
    const { error } = await sb().from("tms_loads").update({ status }).in("id", ids);
    if (error) {
      setLoads((x) => x.map((l) => prev.find((p) => p.id === l.id) || l));
      return fail(error, "Couldn't change the status"), false;
    }
    return true;
  }, []);

  const deleteLoads = useCallback(async (ids: string[]) => {
    const paths = ref.current.documents.filter((d) => d.load_id && ids.includes(d.load_id)).map((d) => d.file_path);
    const { error } = await sb().from("tms_loads").delete().in("id", ids);
    if (error) return fail(error, "Couldn't delete"), false;
    if (paths.length) await sb().storage.from(BUCKET).remove(paths);
    setLoads((x) => x.filter((l) => !ids.includes(l.id)));
    setDocuments((x) => x.filter((d) => !d.load_id || !ids.includes(d.load_id)));
    return true;
  }, []);

  const duplicateLoad = useCallback(
    async (id: string) => {
      const src = ref.current.loads.find((l) => l.id === id);
      if (!src) return null;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id: _i, created_at: _c, updated_at: _u, dispatcher_cut: _d, created_by: _b, ...rest } = src;
      return createLoad({
        ...rest,
        status: "booked",
        load_number: src.load_number ? `${src.load_number}-copy` : null,
        stops: src.stops.map((s) => ({ ...s, id: crypto.randomUUID(), status: "pending" })),
        dispatcher_id: me.id,
      });
    },
    [createLoad, me.id],
  );

  // ---------------------------------------------------------------- documents
  // A newer CDL / medical card file with an expiry date updates the driver's dates,
  // so the driver record and the file on record can't disagree.
  const syncDriverExpiry = useCallback(async (doc: DocumentItem) => {
    if (!doc.driver_id || !doc.expires_on) return;
    const field = doc.doc_type === "cdl" ? "cdl_expiry" : doc.doc_type === "medical_card" ? "medical_card_expiry" : null;
    if (!field) return;
    const newest = ref.current.documents
      .filter((d) => d.driver_id === doc.driver_id && d.doc_type === doc.doc_type && d.id !== doc.id)
      .every((d) => d.uploaded_at <= doc.uploaded_at);
    const drv = ref.current.drivers.find((d) => d.id === doc.driver_id);
    if (!newest || !drv || drv[field] === doc.expires_on) return;
    const { error } = await sb().from("tms_drivers").update({ [field]: doc.expires_on }).eq("id", drv.id);
    if (!error) setDrivers((l) => l.map((d) => (d.id === drv.id ? { ...d, [field]: doc.expires_on } : d)));
  }, []);

  const uploadDocument = useCallback<Store["uploadDocument"]>(async (file, meta) => {
    const folder = meta.load_id
      ? `loads/${meta.load_id}`
      : meta.driver_id
        ? `drivers/${meta.driver_id}`
        : meta.truck_id
          ? `trucks/${meta.truck_id}`
          : meta.trailer_id
            ? `trailers/${meta.trailer_id}`
            : "company";
    const path = docPath(meta.company_id, folder, file.name);
    const up = await sb().storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined, upsert: false });
    if (up.error) return fail(up.error, "Upload failed"), null;
    const { data, error } = await sb()
      .from("tms_documents")
      .insert(clean({ ...meta, file_path: path, file_name: file.name, file_size: file.size, mime_type: file.type || null }))
      .select()
      .single();
    if (error) {
      await sb().storage.from(BUCKET).remove([path]);
      return fail(error, "Upload failed"), null;
    }
    setDocuments((l) => upsert(l, data as DocumentItem, true));
    syncDriverExpiry(data as DocumentItem);
    if (meta.load_id) {
      sb().from("tms_load_events").insert({ load_id: meta.load_id, kind: "document", message: `Uploaded ${file.name}` }).then(() => {});
    }
    return data as DocumentItem;
  }, [syncDriverExpiry]);

  const updateDocument = useCallback(async (id: string, patch: Partial<DocumentItem>) => {
    const { data, error } = await sb().from("tms_documents").update(clean(patch)).eq("id", id).select().single();
    if (error) return fail(error, "Couldn't save the document"), false;
    setDocuments((l) => upsert(l, data as DocumentItem));
    syncDriverExpiry(data as DocumentItem);
    return true;
  }, [syncDriverExpiry]);

  const replaceDocumentFile = useCallback(async (id: string, file: File) => {
    const doc = ref.current.documents.find((d) => d.id === id);
    if (!doc) return false;
    const folder = doc.file_path.split("/").slice(1, -1).join("/") || "company";
    const path = docPath(doc.company_id, folder, file.name);
    const up = await sb().storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined });
    if (up.error) return fail(up.error, "Upload failed"), false;
    const { data, error } = await sb()
      .from("tms_documents")
      .update({ file_path: path, file_name: file.name, file_size: file.size, mime_type: file.type || null })
      .eq("id", id)
      .select()
      .single();
    if (error) return fail(error, "Couldn't replace the file"), false;
    await sb().storage.from(BUCKET).remove([doc.file_path]);
    setDocuments((l) => upsert(l, data as DocumentItem));
    return true;
  }, []);

  const deleteDocument = useCallback(async (id: string) => {
    const doc = ref.current.documents.find((d) => d.id === id);
    const { error } = await sb().from("tms_documents").delete().eq("id", id);
    if (error) return fail(error, "Couldn't delete the document"), false;
    if (doc) await sb().storage.from(BUCKET).remove([doc.file_path]);
    setDocuments((l) => l.filter((d) => d.id !== id));
    return true;
  }, []);

  const addDocType = useCallback(async (name: string, scope: DocType["scope"]) => {
    const key =
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_|_$/g, "")
        .slice(0, 40) || `type_${Date.now()}`;
    const { data, error } = await sb().from("tms_doc_types").insert({ key, name: name.trim(), scope }).select().single();
    if (error) return fail(error, "Couldn't add the document type"), null;
    setDocTypes((l) => [...l.filter((d) => d.key !== key), withRules(data as DocType)].sort(byTypeOrder));
    return data as DocType;
  }, []);
  const renameDocType = useCallback(async (key: string, name: string) => {
    const { error } = await sb().from("tms_doc_types").update({ name: name.trim() }).eq("key", key);
    if (error) return fail(error, "Couldn't rename"), false;
    setDocTypes((l) => l.map((d) => (d.key === key ? { ...d, name: name.trim() } : d)));
    return true;
  }, []);
  const updateDocType = useCallback<Store["updateDocType"]>(async (key, patch) => {
    const prev = ref.current.docTypes.find((d) => d.key === key);
    setDocTypes((l) => l.map((d) => (d.key === key ? { ...d, ...patch } : d)).sort(byTypeOrder));
    const { error } = await sb().from("tms_doc_types").update(patch).eq("key", key);
    if (error) {
      if (prev) setDocTypes((l) => l.map((d) => (d.key === key ? prev : d)).sort(byTypeOrder));
      return fail(error, "Couldn't save the document rule"), false;
    }
    return true;
  }, []);
  const deleteDocType = useCallback(async (key: string) => {
    const { error } = await sb().from("tms_doc_types").delete().eq("key", key);
    if (error) return fail(error, "Couldn't delete"), false;
    setDocTypes((l) => l.filter((d) => d.key !== key));
    return true;
  }, []);

  // ----------------------------------------------------------------- invoices
  const insertLines = async (invoiceId: string, lines: InvoiceDraftInput["lines"]) => {
    if (!lines.length) return { data: [] as InvoiceLine[], error: null };
    const rows = lines.map((l, i) =>
      clean({
        ...l,
        id: l.id || crypto.randomUUID(),
        invoice_id: invoiceId,
        position: i,
      }),
    );
    const res = await sb().from("tms_invoice_lines").upsert(rows).select();
    return { data: ((res.data || []) as InvoiceLine[]).map(normLine), error: res.error };
  };

  const releaseLoads = (loadIds: string[], to: LoadStatus, onlyFrom: LoadStatus[]) => {
    const ids = ref.current.loads.filter((l) => loadIds.includes(l.id) && onlyFrom.includes(l.status)).map((l) => l.id);
    if (ids.length) return setLoadStatusRef.current(ids, to);
    return Promise.resolve(true);
  };
  const setLoadStatusRef = useRef(setLoadStatus);
  setLoadStatusRef.current = setLoadStatus;

  const createInvoiceFromLoads = useCallback<Store["createInvoiceFromLoads"]>(
    async (companyId, loadIds, opts) => {
      const company = ref.current.companies.find((c) => c.id === companyId);
      const chosen = ref.current.loads.filter((l) => loadIds.includes(l.id) && l.company_id === companyId);
      if (!company || !chosen.length) return null;
      const num = await sb().rpc("tms_next_invoice_number");
      if (num.error) return fail(num.error, "Couldn't number the invoice"), null;
      const days = chosen.map((l) => l.delivery_date || l.pickup_date || today()).sort();
      const issue = opts.issue_date || today();
      const lines = chosen.map((l) => {
        // The load's own fee (a 0% load bills 0, not the company default).
        const amount = opts.amounts?.[l.id] ?? cut(l.gross_amount, l.commission_percent);
        const driver = ref.current.drivers.find((d) => d.id === l.driver_id);
        return {
          load_id: l.id,
          description: opts.titles?.[l.id] || `${l.origin_city}, ${l.origin_state} — ${l.destination_city}, ${l.destination_state}${l.load_number ? ` · Load #${l.load_number}` : ""}`,
          line_date: l.delivery_date || l.pickup_date,
          quantity: 1,
          unit_price: amount,
          gross_amount: l.gross_amount,
          amount,
          load_number: l.load_number,
          rate_con_number: l.rate_con_number,
          broker_name: l.broker_name,
          driver_name: driver?.name || null,
          truck_number: ref.current.trucks.find((t) => t.id === l.truck_id)?.unit_number || null,
          loaded_miles: l.loaded_miles || null,
          kind: "item" as const,
          origin: `${l.origin_city}, ${l.origin_state}`,
          destination: `${l.destination_city}, ${l.destination_state}`,
          pickup_date: l.pickup_date,
          delivery_date: l.delivery_date,
        } satisfies Partial<InvoiceLine>;
      });
      // Billing adjustments go after the load lines.
      const adjustments = (opts.adjustments || [])
        .filter((a) => a.description.trim() && Number(a.amount) > 0)
        .map((a) => ({
          load_id: null,
          kind: a.kind,
          description: a.description.trim(),
          line_date: issue,
          quantity: 1,
          unit_price: Math.round(Number(a.amount) * 100) / 100,
          gross_amount: 0,
          amount: Math.round(Number(a.amount) * 100) / 100,
        }));
      const t = totals({ invoice_type: "load", lines: [...lines, ...adjustments] as InvoiceDraft["lines"] });
      const totalGross = t.gross;
      const totalDue = t.due;
      const st = settings;
      const billTo = [
        [company.mc_number && `MC ${company.mc_number}`, company.dot_number && `DOT ${company.dot_number}`].filter(Boolean).join(" · "),
        company.address,
        [company.contact_name, company.contact_email, company.contact_phone].filter(Boolean).join(" · "),
      ]
        .filter(Boolean)
        .join("\n");
      const inv = {
        company_id: companyId,
        invoice_number: num.data as string,
        invoice_type: "load" as const,
        status: "draft" as const,
        currency: "USD" as const,
        issue_date: issue,
        due_date: opts.due_date || addDays(issue, company.payment_terms_days),
        period_start: opts.period_start || days[0],
        period_end: opts.period_end || days[days.length - 1],
        total_gross: totalGross,
        total_due: totalDue,
        notes: opts.notes ?? `${company.billing_cadence === "weekly" ? "Weekly" : "Monthly"} dispatch service fee, ${company.commission_percent}% of gross. Loads delivered ${fmtDay(days[0], true)} – ${fmtDay(days[days.length - 1], true)}.`,
        issuer_name: st?.issuer_name || "Trucking One Stop Shop LLC",
        issuer_address: st?.issuer_address || "",
        issuer_email: st?.issuer_email || "",
        issuer_phone: st?.issuer_phone || "",
        issuer_website: st?.issuer_website || "",
        bill_to_name: company.name,
        bill_to_details: billTo,
        doc_overrides: {
          terms_title: "Dispatch agreement",
          terms_text: `${company.commission_percent}% of gross carrier revenue · ${company.billing_cadence === "weekly" ? "weekly" : "monthly"} settlement · net ${company.payment_terms_days} days`,
          remittance_title: "Payment notice",
          remittance_text: st?.remittance_text || "",
          footer_text: st?.footer_text || "Thank you for your business.",
          tagline: st?.issuer_tagline || "All your trucking needs in one place",
        },
      };
      const { data, error } = await sb().from("tms_invoices").insert(clean(inv)).select().single();
      if (error) return fail(error, "Couldn't create the invoice"), null;
      const ins = await insertLines(data.id, [...lines, ...adjustments] as InvoiceDraftInput["lines"]);
      if (ins.error) {
        await sb().from("tms_invoices").delete().eq("id", data.id);
        return fail(ins.error, "Couldn't create the invoice"), null;
      }
      const full = normInvoice({ ...(data as Invoice), lines: ins.data });
      setInvoices((l) => upsert(l, full, true));
      await setLoadStatusRef.current(chosen.map((l) => l.id), "invoiced");
      return full;
    },
    [settings],
  );

  const createCustomInvoice = useCallback<Store["createCustomInvoice"]>(async (draft) => {
    const num = draft.invoice.invoice_number || (await sb().rpc("tms_next_invoice_number")).data;
    const { data, error } = await sb()
      .from("tms_invoices")
      .insert(clean({ ...draft.invoice, invoice_number: num, invoice_type: draft.invoice.invoice_type || "custom" }))
      .select()
      .single();
    if (error) return fail(error, "Couldn't create the invoice"), null;
    const ins = await insertLines(data.id, draft.lines);
    if (ins.error) {
      await sb().from("tms_invoices").delete().eq("id", data.id);
      return fail(ins.error, "Couldn't create the invoice"), null;
    }
    const full = normInvoice({ ...(data as Invoice), lines: ins.data });
    setInvoices((l) => upsert(l, full, true));
    const loadIds = draft.lines.map((l) => l.load_id).filter((x): x is string => !!x);
    if (loadIds.length) await releaseLoads(loadIds, "invoiced", ["delivered", "booked", "in_transit", "new"]);
    return full;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveInvoice = useCallback<Store["saveInvoice"]>(async (id, draft) => {
    const prev = ref.current.invoices.find((i) => i.id === id);
    if (!prev) return false;
    const keep = new Set(draft.lines.filter((l) => l.id).map((l) => l.id));
    const removed = prev.lines.filter((l) => !keep.has(l.id));
    const { data, error } = await sb().from("tms_invoices").update(clean(draft.invoice)).eq("id", id).select().single();
    if (error) return fail(error, "Couldn't save the invoice"), false;
    if (removed.length) {
      const del = await sb().from("tms_invoice_lines").delete().in("id", removed.map((l) => l.id));
      if (del.error) return fail(del.error, "Couldn't save the invoice"), false;
    }
    const ins = await insertLines(id, draft.lines);
    if (ins.error) return fail(ins.error, "Couldn't save the invoice lines"), false;
    setInvoices((l) => upsert(l, normInvoice({ ...(data as Invoice), lines: ins.data })));
    // Loads removed from the invoice can be invoiced again; added loads are now invoiced.
    const keptLoads = new Set(ins.data.map((l) => l.load_id).filter(Boolean));
    const released = removed.map((l) => l.load_id).filter((x): x is string => !!x && !keptLoads.has(x));
    if (released.length) await releaseLoads(released, "delivered", ["invoiced", "paid"]);
    const added = ins.data.map((l) => l.load_id).filter((x): x is string => !!x && !prev.lines.some((p) => p.load_id === x));
    if (added.length) await releaseLoads(added, data.status === "paid" ? "paid" : "invoiced", ["new", "booked", "in_transit", "delivered"]);
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-reads an invoice and its loads after the database applied payments to them.
  const reloadInvoice = async (id: string) => {
    const { data } = await sb().from("tms_invoices").select("*").eq("id", id).maybeSingle();
    if (!data) return;
    const prev = ref.current.invoices.find((i) => i.id === id);
    setInvoices((l) => upsert(l, normInvoice({ ...(data as Invoice), lines: prev?.lines || [] })));
    const loadIds = (prev?.lines || []).map((l) => l.load_id).filter((x): x is string => !!x);
    if (loadIds.length) {
      const res = await sb().from("tms_loads").select("*").in("id", loadIds);
      if (res.data) setLoads((l) => (res.data as Load[]).reduce((acc, row) => upsert(acc, normLoad(row)), l));
    }
  };

  const setInvoiceStatus = useCallback(async (id: string, status: InvoiceStatus) => {
    const inv = ref.current.invoices.find((i) => i.id === id);
    if (!inv) return false;
    // Fully paid stays paid: payments decide that, not the status buttons.
    const next: InvoiceStatus = status === "sent" && inv.amount_paid > 0 && inv.amount_paid >= inv.total_due ? "paid" : status;
    const patch: Partial<Invoice> = { status: next };
    if (next !== "paid") patch.paid_at = null;
    if ((next === "sent" || next === "paid") && !inv.sent_at) patch.sent_at = new Date().toISOString();
    setInvoices((l) => upsert(l, { ...inv, ...patch }));
    const { error } = await sb().from("tms_invoices").update(patch).eq("id", id);
    if (error) {
      setInvoices((l) => upsert(l, inv));
      return fail(error, "Couldn't change the invoice status"), false;
    }
    // Loads follow their invoice: void → back to delivered (can be billed again); otherwise invoiced / paid.
    const loadIds = inv.lines.map((l) => l.load_id).filter((x): x is string => !!x);
    if (next === "void") await releaseLoads(loadIds, "delivered", ["invoiced", "paid"]);
    else if (next === "paid") await releaseLoads(loadIds, "paid", ["invoiced", "delivered"]);
    else await releaseLoads(loadIds, "invoiced", ["paid", "delivered"]);
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const recordPayment = useCallback<Store["recordPayment"]>(async (invoiceId, p) => {
    const { data, error } = await sb()
      .from("tms_invoice_payments")
      .insert(clean({ invoice_id: invoiceId, ...p, amount: Math.round(Number(p.amount) * 100) / 100 }))
      .select()
      .single();
    if (error) return fail(error, "Couldn't record the payment"), false;
    setPayments((l) => upsert(l, normPayment(data as InvoicePayment)).sort(byPaidOn));
    await reloadInvoice(invoiceId);
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const deletePayment = useCallback(async (id: string) => {
    const pay = ref.current.payments.find((x) => x.id === id);
    const { error } = await sb().from("tms_invoice_payments").delete().eq("id", id);
    if (error) return fail(error, "Couldn't remove the payment"), false;
    setPayments((l) => l.filter((x) => x.id !== id));
    if (pay) await reloadInvoice(pay.invoice_id);
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const deleteInvoice = useCallback(async (id: string) => {
    const inv = ref.current.invoices.find((i) => i.id === id);
    const { error } = await sb().from("tms_invoices").delete().eq("id", id);
    if (error) return fail(error, "Couldn't delete the invoice"), false;
    setInvoices((l) => l.filter((i) => i.id !== id));
    const loadIds = (inv?.lines || []).map((l) => l.load_id).filter((x): x is string => !!x);
    if (loadIds.length) await releaseLoads(loadIds, "delivered", ["invoiced", "paid"]);
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ------------------------------------------------------------- settings/team
  const updateSettings = useCallback(async (patch: Partial<Settings>) => {
    const { data, error } = await sb().from("tms_settings").update(clean(patch)).eq("id", 1).select().single();
    if (error) return fail(error, "Couldn't save settings"), false;
    setSettings(data as Settings);
    return true;
  }, []);

  const addMember = useCallback(async (email: string, role: Role) => {
    const { data, error } = await sb().rpc("tms_add_member", { p_email: email, p_role: role });
    if (error) return fail(error, "Couldn't add"), false;
    setMembers((l) => [...l.filter((m) => m.user_id !== (data as Member).user_id), data as Member]);
    return true;
  }, []);
  const updateProfile = useCallback(async (userId: string, patch: Partial<MemberProfile>) => {
    const prev = ref.current.members.find((m) => m.user_id === userId);
    if (prev) setMembers((l) => l.map((m) => (m.user_id === userId ? { ...m, ...patch } : m)));
    const { data, error } = await sb().from("tms_members").update(clean(patch as Record<string, unknown>)).eq("user_id", userId).select().single();
    if (error) {
      if (prev) setMembers((l) => l.map((m) => (m.user_id === userId ? prev : m)));
      return fail(error, "Couldn't save the profile"), false;
    }
    setMembers((l) => l.map((m) => (m.user_id === userId ? normMember(data as Member) : m)));
    return true;
  }, []);

  const setAvatar = useCallback(async (userId: string, file: Blob | null) => {
    const prev = ref.current.members.find((m) => m.user_id === userId);
    let path: string | null = null;
    if (file) {
      // New name each time so browsers and the CDN never show the old photo.
      path = `${userId}/${Date.now()}.jpg`;
      const up = await sb().storage.from(AVATARS).upload(path, file, { contentType: "image/jpeg", upsert: false, cacheControl: "31536000" });
      if (up.error) return fail(up.error, "Couldn't upload the photo"), false;
    }
    const { error } = await sb().from("tms_members").update({ avatar_path: path }).eq("user_id", userId);
    if (error) {
      if (path) await sb().storage.from(AVATARS).remove([path]);
      return fail(error, "Couldn't save the photo"), false;
    }
    if (prev?.avatar_path) await sb().storage.from(AVATARS).remove([prev.avatar_path]);
    setMembers((l) => l.map((m) => (m.user_id === userId ? { ...m, avatar_path: path } : m)));
    return true;
  }, []);

  const setMemberRole = useCallback(async (userId: string, role: Role) => {
    const { error } = await sb().from("tms_members").update({ role }).eq("user_id", userId);
    if (error) return fail(error, "Couldn't change the role"), false;
    setMembers((l) => l.map((m) => (m.user_id === userId ? { ...m, role } : m)));
    return true;
  }, []);
  const removeMember = useCallback(async (userId: string) => {
    const { error } = await sb().from("tms_members").delete().eq("user_id", userId);
    if (error) return fail(error, "Couldn't remove"), false;
    setMembers((l) => l.filter((m) => m.user_id !== userId));
    return true;
  }, []);

  const value: Store = {
    ready,
    me,
    isOwner: me.role === "owner",
    isSuperAdmin,
    hasLeads,
    members,
    companies,
    drivers,
    trucks,
    trailers,
    loads,
    documents,
    invoices,
    payments,
    docTypes,
    settings,
    scope,
    setScope,
    scopedCompany,
    inScope,
    companyById,
    driverById,
    truckById,
    trailerById,
    memberName,
    memberById,
    updateProfile,
    setAvatar,
    docTypeName,
    refresh,
    createCompany,
    updateCompany,
    deleteCompany,
    createDriver,
    updateDriver,
    deleteDriver,
    createTruck,
    updateTruck,
    deleteTruck,
    createTrailer,
    updateTrailer,
    deleteTrailer,
    hookTrailer,
    assignDriver,
    createLoad,
    updateLoad,
    setLoadStatus,
    deleteLoads,
    duplicateLoad,
    uploadDocument,
    updateDocument,
    replaceDocumentFile,
    deleteDocument,
    addDocType,
    renameDocType,
    updateDocType,
    deleteDocType,
    createInvoiceFromLoads,
    createCustomInvoice,
    saveInvoice,
    setInvoiceStatus,
    recordPayment,
    deletePayment,
    deleteInvoice,
    updateSettings,
    addMember,
    setMemberRole,
    removeMember,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useStore must be used inside StoreProvider");
  return v;
}
