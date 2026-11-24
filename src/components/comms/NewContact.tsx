"use client";

import { useEffect, useState } from "react";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { useStore } from "@/lib/store";
import { errMsg, sb } from "@/lib/db";
import { toast } from "@/lib/toast";
import { e164, prettyPhone } from "@/lib/phone";
import type { Company } from "@/lib/types";

/**
 * Adds a contact from the Inbox: a new lead in Companies (the CRM), with the person as its main
 * contact. Conversations with that phone or email are linked to it.
 */
export function NewContact({ open, onClose, phone, email, name, onCreated }: { open: boolean; onClose: () => void; phone?: string | null; email?: string | null; name?: string | null; onCreated?: (c: Company) => void }) {
  const { createCompany } = useStore();
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [company, setCompany] = useState("");
  const [tel, setTel] = useState("");
  const [mail, setMail] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const [f, ...l] = (name || "").trim().split(/\s+/);
    setFirst(name && !/^\+?\d/.test(name) ? f || "" : "");
    setLast(name && !/^\+?\d/.test(name) ? l.join(" ") : "");
    setCompany("");
    setTel(phone ? prettyPhone(phone) : "");
    setMail(email || "");
  }, [open, phone, email, name]);

  const person = `${first} ${last}`.trim();
  const ready = (!!company.trim() || !!person) && (!!e164(tel) || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail.trim()));

  const save = async () => {
    setBusy(true);
    const c = await createCompany({
      name: (company.trim() || person).toUpperCase(),
      contact_first_name: first.trim() || null,
      contact_last_name: last.trim() || null,
      contact_phone: e164(tel) ? prettyPhone(tel) : null,
      contact_email: mail.trim().toLowerCase() || null,
      stage: "lead",
      notes: "Added from the Inbox.",
    } as Partial<Company>);
    if (c) {
      // link the conversations with this number / email
      const keys = [e164(tel), mail.trim().toLowerCase() || null].filter(Boolean) as string[];
      if (keys.length) {
        const [a, b] = await Promise.all([
          sb().from("tms_comms").update({ company_id: c.id, contact_name: person || null }).in("contact", keys).is("company_id", null),
          sb().from("tms_conversations").update({ company_id: c.id }).in("contact", keys),
        ]);
        const err = a.error || b.error;
        if (err) toast.error(errMsg(err));
      }
      toast.success(`${c.name} added as a lead`);
      onCreated?.(c);
      onClose();
    }
    setBusy(false);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add contact"
      subtitle="Saved as a lead in Companies, with this person as the main contact."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} loading={busy} disabled={!ready}>
            {!busy && <UserPlus className="h-4 w-4" />} Add contact
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="First name">
          <Input autoFocus value={first} onChange={(e) => setFirst(e.target.value)} />
        </Field>
        <Field label="Last name">
          <Input value={last} onChange={(e) => setLast(e.target.value)} />
        </Field>
        <Field label="Company" hint="Leave empty to use the person's name." className="sm:col-span-2">
          <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="ACME TRUCKING LLC" />
        </Field>
        <Field label="Phone">
          <Input value={tel} onChange={(e) => setTel(e.target.value)} inputMode="tel" placeholder="(310) 555-1234" />
        </Field>
        <Field label="Email">
          <Input value={mail} onChange={(e) => setMail(e.target.value)} type="email" placeholder="name@company.com" />
        </Field>
      </div>
    </Modal>
  );
}
