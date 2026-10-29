"use client";

import { useEffect, useState } from "react";
import { Button } from "./Button";
import { Modal } from "./Modal";

interface Req {
  title: string;
  body?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  /** When set, the user must type this text to enable the button. */
  typeToConfirm?: string;
  resolve: (ok: boolean) => void;
}

let push: ((r: Req) => void) | null = null;

/** Promise-based confirm dialog: `if (await confirmDialog({...})) …` */
export function confirmDialog(opts: Omit<Req, "resolve">): Promise<boolean> {
  return new Promise((resolve) => {
    if (!push) return resolve(window.confirm(opts.title));
    push({ ...opts, resolve });
  });
}

export function ConfirmHost() {
  const [req, setReq] = useState<Req | null>(null);
  const [typed, setTyped] = useState("");
  useEffect(() => {
    push = (r) => {
      setTyped("");
      setReq(r);
    };
    return () => {
      push = null;
    };
  }, []);
  const done = (ok: boolean) => {
    req?.resolve(ok);
    setReq(null);
  };
  const blocked = !!req?.typeToConfirm && typed.trim() !== req.typeToConfirm;
  return (
    <Modal
      open={!!req}
      onClose={() => done(false)}
      size="sm"
      title={req?.title}
      footer={
        <>
          <Button variant="ghost" onClick={() => done(false)}>
            {req?.cancelLabel || "Cancel"}
          </Button>
          <Button variant={req?.danger ? "danger" : "secondary"} disabled={blocked} onClick={() => done(true)} autoFocus>
            {req?.confirmLabel || "Confirm"}
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm leading-relaxed text-fg-2">
        {req?.body}
        {req?.typeToConfirm && (
          <div>
            <p className="mb-1.5 text-xs text-fg-3">
              Type <span className="font-semibold text-fg">{req.typeToConfirm}</span> to confirm.
            </p>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="h-9 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-fg focus:border-brand focus:outline-none"
            />
          </div>
        )}
      </div>
    </Modal>
  );
}
