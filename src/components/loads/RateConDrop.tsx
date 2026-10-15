"use client";

import { useRef, useState } from "react";
import { CheckCircle2, FileText, Loader2, UploadCloud, X, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { readRateCon, type ReadResult } from "@/lib/ratecon/client";
import { cn, fileSize } from "@/lib/format";

/**
 * Drop a rate confirmation: it is read, the form is filled in, and the file is kept
 * to attach to the load. Everything stays editable.
 */
export function RateConDrop({
  file,
  onFile,
  onRead,
}: {
  file: File | null;
  onFile: (f: File | null) => void;
  onRead: (r: ReadResult) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [drag, setDrag] = useState(false);

  const run = async (f: File) => {
    onFile(f);
    setResult(null);
    setStatus("Starting…");
    try {
      const r = await readRateCon(f, setStatus);
      onRead(r);
      const filled = [
        r.data.broker_name && "broker",
        r.data.gross_amount && "rate",
        r.data.stops?.length && `${r.data.stops.length} stops`,
        (r.routeMiles || r.data.loaded_miles) && "miles",
      ].filter(Boolean);
      setResult({
        ok: !r.notice,
        text: r.notice || `Filled ${filled.join(", ")}. Review everything below before saving.`,
      });
    } catch (e) {
      setResult({ ok: false, text: (e as Error).message || "Couldn't read this file. Fill the load in by hand." });
    } finally {
      setStatus(null);
    }
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        const f = e.dataTransfer.files?.[0];
        if (f) run(f);
      }}
      className={cn("rounded-xl border border-dashed p-4 transition-colors sm:p-5", drag ? "border-brand bg-brand/5" : "border-line-strong bg-surface")}
    >
      {!file ? (
        <div className="flex flex-col items-center gap-3 py-2 text-center sm:flex-row sm:text-left">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-fg-3">
            <UploadCloud className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-fg">Start from a rate confirmation</div>
            <div className="text-[13px] text-fg-3">Drop the PDF or a photo. Broker, rate, stops and miles get filled in for you to check.</div>
          </div>
          <Button variant="secondary" onClick={() => input.current?.click()}>
            Choose file
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-fg-3">
              <FileText className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-fg">{file.name}</div>
              <div className="text-xs text-fg-3">{fileSize(file.size)} · will be attached to the load</div>
            </div>
            {!status && (
              <>
                <Button size="sm" variant="ghost" onClick={() => run(file)}>
                  Read again
                </Button>
                <button
                  onClick={() => {
                    onFile(null);
                    setResult(null);
                  }}
                  className="rounded-md p-1.5 text-fg-4 hover:bg-surface-2 hover:text-fg"
                  aria-label="Remove file"
                >
                  <X className="h-4 w-4" />
                </button>
              </>
            )}
          </div>
          {status && (
            <div className="flex items-center gap-2 text-[13px] text-fg-2">
              <Loader2 className="h-4 w-4 animate-spin" /> {status}
            </div>
          )}
          {result && (
            <div
              className={cn(
                "flex items-start gap-2 rounded-lg px-3 py-2 text-[13px]",
                result.ok ? "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300" : "bg-amber-500/10 text-amber-900 dark:text-amber-200",
              )}
            >
              {result.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
              <span>{result.text}</span>
            </div>
          )}
        </div>
      )}
      <input
        ref={input}
        type="file"
        accept=".pdf,image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) run(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}
