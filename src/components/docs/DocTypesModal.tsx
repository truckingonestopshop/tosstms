"use client";

import { useState } from "react";
import { Check, Lock, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Checkbox, Input, Select } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { confirmDialog } from "@/components/ui/Confirm";
import { useStore } from "@/lib/store";
import { byTypeOrder } from "@/lib/docs";
import { cn } from "@/lib/format";
import type { DocRequired, DocScope, DocType } from "@/lib/types";

const SCOPES: { v: DocScope; label: string; title: string }[] = [
  { v: "load", label: "Load", title: "Load paperwork" },
  { v: "company", label: "Carrier", title: "Carrier files" },
  { v: "driver", label: "Driver", title: "Driver files" },
  { v: "truck", label: "Truck", title: "Truck files" },
  { v: "trailer", label: "Trailer", title: "Trailer files" },
  { v: "any", label: "Any", title: "Anything" },
];

const LOAD_REQ: { v: DocRequired | ""; label: string }[] = [
  { v: "", label: "Optional" },
  { v: "booked", label: "Required when booked" },
  { v: "in_transit", label: "Required after pickup" },
  { v: "delivered", label: "Required after delivery" },
];
const OTHER_REQ: { v: DocRequired | ""; label: string }[] = [
  { v: "", label: "Optional" },
  { v: "always", label: "Required" },
];

/** Document types and their rules: required (and from which load stage), expiring, in the billing packet. */
export function DocTypesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { docTypes, addDocType, renameDocType, deleteDocType, updateDocType, documents } = useStore();
  const [name, setName] = useState("");
  const [scope, setScope] = useState<DocScope>("load");
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const row = (t: DocType) => {
    const used = documents.filter((d) => d.doc_type === t.key).length;
    const req = t.scope === "load" ? LOAD_REQ : OTHER_REQ;
    return (
      <li key={t.key} className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {editing === t.key ? (
            <>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-8 flex-1" autoFocus />
              <button
                className="rounded-md p-1.5 text-fg-2 hover:bg-surface-2"
                aria-label="Save name"
                onClick={async () => {
                  if (editName.trim() && (await renameDocType(t.key, editName))) setEditing(null);
                }}
              >
                <Check className="h-4 w-4" />
              </button>
              <button className="rounded-md p-1.5 text-fg-3 hover:bg-surface-2" aria-label="Cancel" onClick={() => setEditing(null)}>
                <X className="h-4 w-4" />
              </button>
            </>
          ) : (
            <>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium text-fg">{t.name}</div>
                <div className="text-xs text-fg-4">
                  {used} file{used === 1 ? "" : "s"}
                </div>
              </div>
              {t.is_default ? (
                <Lock className="h-3.5 w-3.5 shrink-0 text-fg-4" aria-label="Built-in name" />
              ) : (
                <>
                  <button
                    className="rounded-md p-1.5 text-fg-3 hover:bg-surface-2 hover:text-fg"
                    aria-label="Rename"
                    onClick={() => {
                      setEditing(t.key);
                      setEditName(t.name);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    className="rounded-md p-1.5 text-fg-3 hover:bg-red-500/10 hover:text-red-500"
                    aria-label="Delete type"
                    onClick={async () => {
                      if (
                        await confirmDialog({
                          title: `Delete "${t.name}"?`,
                          body: used ? `${used} file(s) keep this label but you won't be able to pick it again.` : undefined,
                          confirmLabel: "Delete",
                          danger: true,
                        })
                      )
                        deleteDocType(t.key);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </>
          )}
        </div>
        {t.key !== "other" && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 sm:shrink-0">
            <Select
              value={t.required_from || ""}
              onChange={(e) => updateDocType(t.key, { required_from: (e.target.value || null) as DocRequired | null })}
              className={cn("h-8 w-[204px] text-[13px]", t.required_from && "font-medium")}
              aria-label={`When ${t.name} is required`}
            >
              {req.map((r) => (
                <option key={r.v} value={r.v}>
                  {r.label}
                </option>
              ))}
            </Select>
            <Checkbox checked={t.has_expiry} onChange={(v) => updateDocType(t.key, { has_expiry: v })} label={<span className="text-xs">Expires</span>} />
            {t.scope === "load" && <Checkbox checked={t.in_packet} onChange={(v) => updateDocType(t.key, { in_packet: v })} label={<span className="text-xs">Packet</span>} />}
          </div>
        )}
      </li>
    );
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Document types"
      subtitle="Choose what's required, what expires (30-day reminders) and what goes in the load's billing packet. Add your own types for anything else."
    >
      <form
        className="mb-4 flex flex-col gap-2 sm:flex-row"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return;
          if (await addDocType(name, scope)) setName("");
        }}
      >
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New type, e.g. Hazmat Endorsement, Trailer Interchange" className="flex-1" />
        <Select value={scope} onChange={(e) => setScope(e.target.value as DocScope)} className="sm:w-32" aria-label="Belongs to">
          {SCOPES.map((s) => (
            <option key={s.v} value={s.v}>
              {s.label}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="secondary">
          <Plus className="h-4 w-4" />
          Add
        </Button>
      </form>
      <div className="space-y-4">
        {SCOPES.map((s) => {
          const list = docTypes.filter((t) => t.scope === s.v).sort(byTypeOrder);
          if (!list.length) return null;
          return (
            <section key={s.v}>
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-fg-3">{s.title}</div>
              <ul className="divide-y divide-line rounded-xl border border-line">{list.map(row)}</ul>
            </section>
          );
        })}
      </div>
    </Modal>
  );
}
