"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type {
  Company,
  DocType,
  DocumentItem,
  Driver,
  Invoice,
  InvoiceLine,
  InvoiceStatus,
  Load,
  LoadStatus,
  Member,
  Role,
  Settings,
  Truck,
} from "./types";
import {
  BUCKET,
  clean,
  docPath,
  errMsg,
  normCompany,
  normInvoice,
  normLine,
  normLoad,
  normTruck,
  sb,
} from "./db";
import { addDays, cut, fmtDay, lane, today } from "./format";
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
  members: Member[];
  companies: Company[];
  drivers: Driver[];
  trucks: Truck[];
  loads: Load[];
  documents: DocumentItem[];
  invoices: Invoice[];
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
  memberName: (id: string | null | undefined) => string;
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

  createLoad: (l: NewLoad) => Promise<Load | null>;
  updateLoad: (id: string, patch: Partial<Load>) => Promise<boolean>;
  setLoadStatus: (ids: string[], status: LoadStatus) => Promise<boolean>;
  deleteLoads: (ids: string[]) => Promise<boolean>;
  duplicateLoad: (id: string) => Promise<Load | null>;

  uploadDocument: (
    file: File,
    meta: { company_id: string; doc_type: string; load_id?: string | null; driver_id?: string | null; truck_id?: string | null; expires_on?: string | null; notes?: string | null },
  ) => Promise<DocumentItem | null>;
  updateDocument: (id: string, patch: Partial<DocumentItem>) => Promise<boolean>;
  replaceDocumentFile: (id: string, file: File) => Promise<boolean>;
  deleteDocument: (id: string) => Promise<boolean>;
  addDocType: (name: string, scope: DocType["scope"]) => Promise<DocType | null>;
  renameDocType: (key: string, name: string) => Promise<boolean>;
  deleteDocType: (key: string) => Promise<boolean>;

  createInvoiceFromLoads: (
    companyId: string,
    loadIds: string[],
    opts: { issue_date?: string; due_date?: string; period_start?: string; period_end?: string; notes?: string; amounts?: Record<string, number>; titles?: Record<string, string> },
  ) => Promise<Invoice | null>;
  createCustomInvoice: (draft: InvoiceDraftInput) => Promise<Invoice | null>;
  saveInvoice: (id: string, draft: InvoiceDraftInput) => Promise<boolean>;
  setInvoiceStatus: (id: string, status: InvoiceStatus) => Promise<boolean>;
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

export function StoreProvider({ me, preview = false, children }: { me: Me; preview?: boolean; children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [loads, setLoads] = useState<Load[]>([]);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [docTypes, setDocTypes] = useState<DocType[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [scope, setScopeState] = useState<Scope>("all");

  // Latest state for async callbacks without re-creating them.
  const ref = useRef({ companies, drivers, trucks, loads, documents, invoices });
  ref.current = { companies, drivers, trucks, loads, documents, invoices };

  const refresh = useCallback(async () => {
    if (preview && process.env.NODE_ENV !== "production") {
      const { demoData } = await import("./demo");
      const d = demoData();
      setMembers(d.members);
      setCompanies(d.companies);
      setDrivers(d.drivers);
      setTrucks(d.trucks);
      setLoads(d.loads);
      setDocuments(d.documents);
      setInvoices(d.invoices);
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
    const [m, co, dr, tr, lo, docs, inv, lines, dt, st] = await Promise.all([
      c.from("tms_members").select("*").order("full_name"),
      all<Company>("tms_companies"),
      all<Driver>("tms_drivers"),
      all<Truck>("tms_trucks"),
      all<Load>("tms_loads"),
      all<DocumentItem>("tms_documents"),
      all<Invoice>("tms_invoices"),
      all<InvoiceLine>("tms_invoice_lines"),
      c.from("tms_doc_types").select("*").order("name"),
      c.from("tms_settings").select("*").eq("id", 1).maybeSingle(),
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
    if (m.data) setMembers(m.data as Member[]);
    if (co.data) setCompanies((co.data as Company[]).map(normCompany));
    if (dr.data) setDrivers(dr.data as Driver[]);
    if (tr.data) setTrucks((tr.data as Truck[]).map(normTruck));
    if (lo.data) setLoads((lo.data as Load[]).map(normLoad));
    if (docs.data) setDocuments(docs.data as DocumentItem[]);
    if (inv.data) {
      const byInvoice = new Map<string, InvoiceLine[]>();
      for (const l of (lines.data || []) as InvoiceLine[]) byInvoice.set(l.invoice_id, [...(byInvoice.get(l.invoice_id) || []), l]);
      setInvoices((inv.data as Invoice[]).map((i) => normInvoice({ ...i, lines: byInvoice.get(i.id) || [] })));
    }
    if (dt.data) setDocTypes(dt.data as DocType[]);
    if (st.data) setSettings(st.data as Settings);
    setReady(true);
  }, []);

  useEffect(() => {
    try {
      const s = localStorage.getItem(SCOPE_KEY);
      if (s) setScopeState(s);
    } catch {}
    refresh();
  }, [refresh]);

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
      .on("postgres_changes", { event: "*", schema: "public", table: "tms_trucks" }, apply("tms_trucks", setTrucks, normTruck))
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
  const deleteDriver = useCallback(async (id: string) => {
    const { error } = await sb().from("tms_drivers").delete().eq("id", id);
    if (error) return fail(error, "Couldn't delete the driver"), false;
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
    const { error } = await sb().from("tms_trucks").delete().eq("id", id);
    if (error) return fail(error, "Couldn't delete the truck"), false;
    setTrucks((l) => l.filter((x) => x.id !== id));
    setLoads((l) => l.map((t) => (t.truck_id === id ? { ...t, truck_id: null } : t)));
    setDocuments((l) => l.filter((x) => x.truck_id !== id));
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
  const uploadDocument = useCallback<Store["uploadDocument"]>(async (file, meta) => {
    const folder = meta.load_id ? `loads/${meta.load_id}` : meta.driver_id ? `drivers/${meta.driver_id}` : meta.truck_id ? `trucks/${meta.truck_id}` : "company";
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
    if (meta.load_id) {
      sb().from("tms_load_events").insert({ load_id: meta.load_id, kind: "document", message: `Uploaded ${file.name}` }).then(() => {});
    }
    return data as DocumentItem;
  }, []);

  const updateDocument = useCallback(async (id: string, patch: Partial<DocumentItem>) => {
    const { data, error } = await sb().from("tms_documents").update(clean(patch)).eq("id", id).select().single();
    if (error) return fail(error, "Couldn't save the document"), false;
    setDocuments((l) => upsert(l, data as DocumentItem));
    return true;
  }, []);

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
    setDocTypes((l) => [...l.filter((d) => d.key !== key), data as DocType].sort(byName));
    return data as DocType;
  }, []);
  const renameDocType = useCallback(async (key: string, name: string) => {
    const { error } = await sb().from("tms_doc_types").update({ name: name.trim() }).eq("key", key);
    if (error) return fail(error, "Couldn't rename"), false;
    setDocTypes((l) => l.map((d) => (d.key === key ? { ...d, name: name.trim() } : d)));
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
        const amount = opts.amounts?.[l.id] ?? cut(l.gross_amount, l.commission_percent || company.commission_percent);
        const driver = ref.current.drivers.find((d) => d.id === l.driver_id);
        return {
          load_id: l.id,
          description: opts.titles?.[l.id] || `${lane(l)}${l.load_number ? ` · Load #${l.load_number}` : ""}`,
          line_date: l.delivery_date || l.pickup_date,
          quantity: 1,
          unit_price: amount,
          gross_amount: l.gross_amount,
          amount,
          load_number: l.load_number,
          rate_con_number: l.rate_con_number,
          broker_name: l.broker_name,
          driver_name: driver?.name || null,
          origin: `${l.origin_city}, ${l.origin_state}`,
          destination: `${l.destination_city}, ${l.destination_state}`,
          pickup_date: l.pickup_date,
          delivery_date: l.delivery_date,
        } satisfies Partial<InvoiceLine>;
      });
      const totalGross = chosen.reduce((s, l) => s + l.gross_amount, 0);
      const totalDue = Math.round(lines.reduce((s, l) => s + l.amount, 0) * 100) / 100;
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
        bill_to_name: company.name,
        bill_to_details: billTo,
        doc_overrides: {
          terms_title: "Dispatch agreement",
          terms_text: `${company.commission_percent}% of gross carrier revenue · ${company.billing_cadence === "weekly" ? "weekly" : "monthly"} settlement · net ${company.payment_terms_days} days`,
          remittance_text: st?.remittance_text || "",
          footer_text: st?.footer_text || "",
        },
      };
      const { data, error } = await sb().from("tms_invoices").insert(clean(inv)).select().single();
      if (error) return fail(error, "Couldn't create the invoice"), null;
      const ins = await insertLines(data.id, lines);
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

  const setInvoiceStatus = useCallback(async (id: string, status: InvoiceStatus) => {
    const inv = ref.current.invoices.find((i) => i.id === id);
    if (!inv) return false;
    const patch: Partial<Invoice> = { status };
    if (status === "paid") {
      patch.paid_at = new Date().toISOString();
      patch.amount_paid = inv.total_due;
    } else {
      patch.paid_at = null;
      patch.amount_paid = 0;
    }
    if (status === "sent" && !inv.sent_at) patch.sent_at = new Date().toISOString();
    setInvoices((l) => upsert(l, { ...inv, ...patch }));
    const { error } = await sb().from("tms_invoices").update(patch).eq("id", id);
    if (error) {
      setInvoices((l) => upsert(l, inv));
      return fail(error, "Couldn't change the invoice status"), false;
    }
    // Loads follow their invoice: paid → paid; void → back to delivered (can be re-invoiced).
    const loadIds = inv.lines.map((l) => l.load_id).filter((x): x is string => !!x);
    if (status === "paid") await releaseLoads(loadIds, "paid", ["invoiced", "delivered"]);
    else if (status === "void") await releaseLoads(loadIds, "delivered", ["invoiced", "paid"]);
    else await releaseLoads(loadIds, "invoiced", ["paid", "delivered"]);
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
    members,
    companies,
    drivers,
    trucks,
    loads,
    documents,
    invoices,
    docTypes,
    settings,
    scope,
    setScope,
    scopedCompany,
    inScope,
    companyById,
    driverById,
    truckById,
    memberName,
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
    deleteDocType,
    createInvoiceFromLoads,
    createCustomInvoice,
    saveInvoice,
    setInvoiceStatus,
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
