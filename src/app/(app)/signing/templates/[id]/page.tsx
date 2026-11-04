"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Check } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, Page, PageHeader } from "@/components/ui/Bits";
import { Checkbox, Field, Input, Select } from "@/components/ui/Field";
import { errMsg, sb, signedUrl } from "@/lib/db";
import { toast } from "@/lib/toast";
import { CATEGORIES, type SignTemplate, type TemplateCategory } from "@/lib/signing";
import { FieldBuilder } from "@/components/signing/FieldBuilder";
import { useFileAs } from "@/components/signing/Templates";
import { WrittenEditor } from "@/components/signing/WrittenEditor";
import { fieldsFromBody } from "@/components/signing/written";

// One template: its PDF with the fields placed on it, who signs, and where it's sent from.

function toPayload(t: SignTemplate) {
  const fields = t.kind === "written" ? fieldsFromBody(t.body || "") : t.fields;
  return {
    name: t.name.trim() || "Untitled template",
    category: t.category,
    doc_type: t.doc_type,
    roles: t.roles,
    fields,
    body: t.body,
    letterhead: !!t.letterhead,
  };
}

export default function TemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [t, setT] = useState<SignTemplate | null>(null);
  const [saved, setSaved] = useState("");
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileAs = useFileAs(t?.category || "company");
  const latestRef = useRef<SignTemplate | null>(null);
  const savedRef = useRef("");

  useEffect(() => {
    sb()
      .from("tms_sign_templates")
      .select("*")
      .eq("id", id)
      .single()
      .then(async ({ data, error }) => {
        if (error) return toast.error(errMsg(error));
        const tpl = data as SignTemplate;
        const snap = JSON.stringify(toPayload(tpl));
        latestRef.current = tpl;
        savedRef.current = snap;
        setT(tpl);
        setSaved(snap);
        if (tpl.file_path) setUrl(await signedUrl(tpl.file_path));
      });
  }, [id]);

  const persist = useCallback(
    async (tpl: SignTemplate, manual = false) => {
      if (manual && !tpl.name.trim()) return toast.error("Name the template");
      const payload = toPayload(tpl);
      const snap = JSON.stringify(payload);
      setBusy(true);
      const { error } = await sb().from("tms_sign_templates").update(payload).eq("id", tpl.id);
      setBusy(false);
      if (error) {
        if (manual) toast.error(errMsg(error));
        return;
      }
      savedRef.current = snap;
      setSaved(snap);
      if (manual) {
        if (tpl.kind === "written" && !payload.fields.some((f) => f.role !== "toss")) {
          toast.info("Saved (add a signature field for a signer before sending)");
        } else {
          toast.success("Template saved");
        }
      }
    },
    [],
  );

  // Auto-save every change after a brief pause so placed fields, positions and texts are never lost.
  useEffect(() => {
    latestRef.current = t;
    if (!t) return;
    const snap = JSON.stringify(toPayload(t));
    if (snap === savedRef.current) return;
    const timer = setTimeout(() => {
      void persist(t, false);
    }, 600);
    return () => clearTimeout(timer);
  }, [t, persist]);

  // Flush any unsaved change if the user navigates back before the timer fires.
  useEffect(() => {
    return () => {
      const cur = latestRef.current;
      if (!cur) return;
      const payload = toPayload(cur);
      if (JSON.stringify(payload) !== savedRef.current) {
        void sb().from("tms_sign_templates").update(payload).eq("id", cur.id);
      }
    };
  }, []);

  if (!t) return <Page>{<div className="py-20 text-center text-sm text-fg-3">Loading…</div>}</Page>;
  const set = (p: Partial<SignTemplate>) => setT((x) => (x ? { ...x, ...p } : x));
  const dirty = JSON.stringify(toPayload(t)) !== saved;
  const save = () => persist(t, true);

  return (
    <Page>
      <PageHeader
        eyebrow={
          <Link href="/signing?tab=templates" className="inline-flex items-center gap-1 hover:text-fg">
            <ArrowLeft className="h-3 w-3" /> Templates
          </Link>
        }
        title={t.name || "Template"}
        actions={
          <div className="flex items-center gap-2">
            <span className="text-xs text-fg-3">
              {busy ? "Saving…" : dirty ? "Unsaved changes" : <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><Check className="h-3.5 w-3.5" /> All changes saved</span>}
            </span>
            <Button variant="primary" onClick={save} disabled={busy}>
              Save template
            </Button>
          </div>
        }
      />
      <Card className="mb-4 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Name">
            <Input value={t.name} onChange={(e) => set({ name: e.target.value })} />
          </Field>
          <Field label="Sent from">
            <Select value={t.category} onChange={(e) => set({ category: e.target.value as TemplateCategory })}>
              {CATEGORIES.map((c) => (
                <option key={c.v} value={c.v}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="File the signed copy as">
            <Select value={t.doc_type || ""} onChange={(e) => set({ doc_type: e.target.value || null })}>
              <option value="">Other</option>
              {fileAs.map((d) => (
                <option key={d.key} value={d.key}>
                  {d.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {t.kind === "written" && (
          <Checkbox className="mt-3" checked={!!t.letterhead} onChange={(v) => set({ letterhead: v })} label="TOSS letterhead on every page (logo, orange corners, title, page numbers)" />
        )}
      </Card>
      {t.kind === "written" ? (
        <WrittenEditor key={t.id} body={t.body || ""} roles={t.roles} onBody={(body) => set({ body })} onRoles={(roles) => set({ roles })} letterhead={t.letterhead ? { title: t.name } : null} />
      ) : (
        <FieldBuilder src={url} pages={t.pages} roles={t.roles} fields={t.fields} onRoles={(roles) => set({ roles })} onFields={(fields) => set({ fields })} />
      )}
    </Page>
  );
}
