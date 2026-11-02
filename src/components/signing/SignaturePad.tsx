"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Segmented } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";

/** The drawn or typed signature as a PNG, cropped to the ink. */
function trimmed(canvas: HTMLCanvasElement): string | null {
  const ctx = canvas.getContext("2d")!;
  const { width, height } = canvas;
  const data = ctx.getImageData(0, 0, width, height).data;
  let top = height,
    left = width,
    right = 0,
    bottom = 0;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (data[(y * width + x) * 4 + 3] > 10) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
  if (right <= left || bottom <= top) return null;
  const pad = 6;
  const out = document.createElement("canvas");
  out.width = right - left + pad * 2;
  out.height = bottom - top + pad * 2;
  out.getContext("2d")!.drawImage(canvas, left - pad, top - pad, out.width, out.height, 0, 0, out.width, out.height);
  return out.toDataURL("image/png");
}

const SCRIPT = "'Segoe Script', 'Brush Script MT', 'Snell Roundhand', 'Apple Chancery', cursive";

/** Draw or type a signature (or initials). Returns a PNG data URL. */
export function SignaturePad({ open, initials, name, onClose, onDone }: { open: boolean; initials?: boolean; name: string; onClose: () => void; onDone: (png: string) => void }) {
  const [mode, setMode] = useState<"draw" | "type">("draw");
  const [typed, setTyped] = useState("");
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);
  const suggestion = initials
    ? name
        .split(/\s+/)
        .filter(Boolean)
        .map((w) => w[0]!.toUpperCase())
        .join("")
    : name;

  const [was, setWas] = useState(false);
  if (open !== was) {
    setWas(open);
    if (open) {
      setTyped(suggestion);
      setEmpty(true);
    }
  }

  const ctx = () => {
    const c = canvas.current!.getContext("2d")!;
    c.lineWidth = 2.6;
    c.lineCap = "round";
    c.lineJoin = "round";
    c.strokeStyle = "#0b1d4d";
    return c;
  };
  const point = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * canvas.current!.width, y: ((e.clientY - r.top) / r.height) * canvas.current!.height };
  };
  const clear = () => {
    const c = canvas.current;
    if (c) c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    setEmpty(true);
  };
  const done = () => {
    if (mode === "draw") {
      const png = canvas.current && trimmed(canvas.current);
      if (png) onDone(png);
      return;
    }
    const text = typed.trim();
    if (!text) return;
    const c = document.createElement("canvas");
    c.width = 900;
    c.height = 220;
    const g = c.getContext("2d")!;
    let size = 110;
    g.font = `${size}px ${SCRIPT}`;
    while (g.measureText(text).width > 860 && size > 30) g.font = `${(size -= 4)}px ${SCRIPT}`;
    g.fillStyle = "#0b1d4d";
    g.textBaseline = "middle";
    g.fillText(text, 20, 115);
    const png = trimmed(c);
    if (png) onDone(png);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initials ? "Your initials" : "Your signature"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={done} disabled={mode === "draw" ? empty : !typed.trim()}>
            Use this {initials ? "initials" : "signature"}
          </Button>
        </>
      }
    >
      <Segmented<"draw" | "type">
        value={mode}
        onChange={setMode}
        options={[
          { value: "draw", label: "Draw" },
          { value: "type", label: "Type" },
        ]}
      />
      {mode === "draw" ? (
        <div className="mt-3">
          <canvas
            ref={canvas}
            width={900}
            height={300}
            className="h-44 w-full touch-none rounded-lg border border-dashed border-line-strong bg-white"
            onPointerDown={(e) => {
              drawing.current = true;
              (e.target as HTMLElement).setPointerCapture(e.pointerId);
              const p = point(e);
              const c = ctx();
              c.beginPath();
              c.moveTo(p.x, p.y);
              c.lineTo(p.x + 0.1, p.y + 0.1);
              c.stroke();
              setEmpty(false);
            }}
            onPointerMove={(e) => {
              if (!drawing.current) return;
              const p = point(e);
              const c = ctx();
              c.lineTo(p.x, p.y);
              c.stroke();
            }}
            onPointerUp={() => (drawing.current = false)}
          />
          <div className="mt-1 flex justify-between text-xs text-fg-3">
            <span>Sign with your finger or mouse</span>
            <button onClick={clear} className="font-medium hover:text-fg">
              Clear
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3">
          <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={initials ? "Initials" : "Full name"} autoFocus />
          <div className="mt-3 flex h-28 items-center overflow-hidden rounded-lg border border-line bg-white px-4 text-5xl text-[#0b1d4d]" style={{ fontFamily: SCRIPT }}>
            {typed || " "}
          </div>
        </div>
      )}
    </Modal>
  );
}
