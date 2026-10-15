"use client";

import { useState } from "react";
import { Check, Lock, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { confirmDialog } from "@/components/ui/Confirm";
import { useStore } from "@/lib/store";
import type { DocScope } from "@/lib/types";

const SCOPES: { v: DocScope; label: string }[] = [
  { v: "company", label: "Company" },
  { v: "load", label: "Load" },
  { v: "driver", label: "Driver" },
  { v: "truck", label: "Truck" },
  { v: "any", label: "Any" },
];

export function DocTypesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { docTypes, addDocType, renameDocType, deleteDocType, documents } = useStore();
  const [name, setName] = useState("");
  const [scope, setScope] = useState<DocScope>("company");
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  return (
    <Modal open={open} onClose={onClose} size="md" title="Document types" subtitle="Built-in types are locked. Add your own for anything else you keep on file.">
      <form
        className="mb-4 flex flex-col gap-2 sm:flex-row"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return;
          if (await addDocType(name, scope)) setName("");
        }}
      >
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. IFTA License, Lease Agreement" className="flex-1" />
        <Select value={scope} onChange={(e) => setScope(e.target.value as DocScope)} className="sm:w-32">
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
      <ul className="divide-y divide-line rounded-xl border border-line">
        {docTypes.map((t) => {
          const used = documents.filter((d) => d.doc_type === t.key).length;
          return (
            <li key={t.key} className="flex items-center gap-3 px-3 py-2">
              {editing === t.key ? (
                <>
                  <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-8 flex-1" autoFocus />
                  <button
                    className="rounded-md p-1.5 text-fg-2 hover:bg-surface-2"
                    onClick={async () => {
                      if (editName.trim() && (await renameDocType(t.key, editName))) setEditing(null);
                    }}
                  >
                    <Check className="h-4 w-4" />
                  </button>
                  <button className="rounded-md p-1.5 text-fg-3 hover:bg-surface-2" onClick={() => setEditing(null)}>
                    <X className="h-4 w-4" />
                  </button>
                </>
              ) : (
                <>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium text-fg">{t.name}</div>
                    <div className="text-xs text-fg-4">
                      {SCOPES.find((s) => s.v === t.scope)?.label} · {used} file{used === 1 ? "" : "s"}
                    </div>
                  </div>
                  {t.is_default ? (
                    <Lock className="h-3.5 w-3.5 text-fg-4" />
                  ) : (
                    <>
                      <button
                        className="rounded-md p-1.5 text-fg-3 hover:bg-surface-2 hover:text-fg"
                        onClick={() => {
                          setEditing(t.key);
                          setEditName(t.name);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        className="rounded-md p-1.5 text-fg-3 hover:bg-red-500/10 hover:text-red-500"
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
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}
