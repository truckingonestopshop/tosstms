"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
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

export default function TemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [t, setT] = useState<SignTemplate | null>(null);
  const [saved, setSaved] = useState("");
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileAs = useFileAs(t?.category || "company");

  useEffect(() => {
    sb()
      .from("tms_sign_templates")
      .select("*")
      .eq("id", id)
      .single()
      .then(async ({ data, error }) => {
        if (error) return toast.error(errMsg(error));
        const tpl = data as SignTemplate;
        setT(tpl);
        setSaved(JSON.stringify(tpl));
        if (tpl.file_path) setUrl(await signedUrl(tpl.file_path));
      });
  }, [id]);

  if (!t) return <Page>{<div className="py-20 text-center text-sm text-fg-3">Loading…</div>}</Page>;
  const set = (p: Partial<SignTemplate>) => setT((x) => (x ? { ...x, ...p } : x));
  const dirty = JSON.stringify(t) !== saved;
  const save = async () => {
    if (!t.name.trim()) return toast.error("Name the template");
    // Written: the fields are the ones in the text.
    const fields = t.kind === "written" ? fieldsFromBody(t.body || "") : t.fields;
    if (t.kind === "written" && !fields.some((f) => f.role !== "toss")) return toast.error("Add at least one field for a signer (Fields → Signature)");
    setBusy(true);
    const { data, error } = await sb()
      .from("tms_sign_templates")
      .update({ name: t.name.trim(), category: t.category, doc_type: t.doc_type, roles: t.roles, fields, body: t.body, letterhead: !!t.letterhead })
      .eq("id", t.id)
      .select()
      .single();
    setBusy(false);
    if (error) return toast.error(errMsg(error));
    setT(data as SignTemplate);
    setSaved(JSON.stringify(data));
    toast.success("Template saved");
  };

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
          <Button variant="primary" onClick={save} disabled={busy || !dirty}>
            {dirty ? "Save template" : "Saved"}
          </Button>
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
