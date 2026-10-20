"use client";

import { useEffect, useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

const BOX = 280;
const OUT = 512;

/** Square photo crop: drag to position, slider to zoom. Returns a 512×512 JPEG. */
export function PhotoCropper({ file, onCancel, onDone }: { file: File; onCancel: () => void; onDone: (blob: Blob) => void }) {
  const [url] = useState(() => URL.createObjectURL(file));
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [saving, setSaving] = useState(false);
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null);

  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  const base = img ? Math.max(BOX / img.naturalWidth, BOX / img.naturalHeight) : 1;
  const scale = base * zoom;
  const dw = img ? img.naturalWidth * scale : BOX;
  const dh = img ? img.naturalHeight * scale : BOX;
  /** Keep the photo covering the whole circle. */
  const clamp = (x: number, y: number) => ({ x: Math.min(0, Math.max(BOX - dw, x)), y: Math.min(0, Math.max(BOX - dh, y)) });

  const setZoomKeepCenter = (z: number) => {
    if (!img) return setZoom(z);
    const cx = (BOX / 2 - pos.x) / scale;
    const cy = (BOX / 2 - pos.y) / scale;
    const ns = base * z;
    setZoom(z);
    const ndw = img.naturalWidth * ns;
    const ndh = img.naturalHeight * ns;
    setPos({ x: Math.min(0, Math.max(BOX - ndw, BOX / 2 - cx * ns)), y: Math.min(0, Math.max(BOX - ndh, BOX / 2 - cy * ns)) });
  };

  const save = async () => {
    if (!img) return;
    setSaving(true);
    const c = document.createElement("canvas");
    c.width = OUT;
    c.height = OUT;
    const g = c.getContext("2d")!;
    g.fillStyle = "#fff";
    g.fillRect(0, 0, OUT, OUT);
    g.drawImage(img, -pos.x / scale, -pos.y / scale, BOX / scale, BOX / scale, 0, 0, OUT, OUT);
    const blob: Blob | null = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.88));
    setSaving(false);
    if (blob) onDone(blob);
  };

  return (
    <Modal
      open
      onClose={onCancel}
      size="sm"
      title="Position your photo"
      subtitle="Drag to move, use the slider to zoom."
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} loading={saving} disabled={!img}>
            Use photo
          </Button>
        </>
      }
    >
      <div className="flex flex-col items-center gap-4">
        <div
          className="relative touch-none select-none overflow-hidden rounded-xl bg-surface-3"
          style={{ width: BOX, height: BOX, cursor: drag.current ? "grabbing" : "grab" }}
          onPointerDown={(e) => {
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            drag.current = { px: e.clientX, py: e.clientY, x: pos.x, y: pos.y };
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (d) setPos(clamp(d.x + e.clientX - d.px, d.y + e.clientY - d.py));
          }}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt=""
            draggable={false}
            onLoad={(e) => {
              const el = e.currentTarget;
              const b = Math.max(BOX / el.naturalWidth, BOX / el.naturalHeight);
              setImg(el);
              setPos({ x: (BOX - el.naturalWidth * b) / 2, y: (BOX - el.naturalHeight * b) / 2 });
            }}
            className="pointer-events-none absolute left-0 top-0 max-w-none origin-top-left"
            style={{ width: dw, height: dh, transform: `translate(${pos.x}px, ${pos.y}px)` }}
          />
          {/* Circle guide: what shows in the round avatar */}
          <svg aria-hidden className="pointer-events-none absolute inset-0" width={BOX} height={BOX}>
            <defs>
              <mask id="crop-hole">
                <rect width={BOX} height={BOX} fill="white" />
                <circle cx={BOX / 2} cy={BOX / 2} r={BOX / 2 - 6} fill="black" />
              </mask>
            </defs>
            <rect width={BOX} height={BOX} fill="rgba(0,0,0,0.5)" mask="url(#crop-hole)" />
            <circle cx={BOX / 2} cy={BOX / 2} r={BOX / 2 - 6} fill="none" stroke="white" strokeOpacity="0.85" strokeWidth="2" />
          </svg>
        </div>
        <div className="flex w-full max-w-[280px] items-center gap-2">
          <button type="button" onClick={() => setZoomKeepCenter(Math.max(1, +(zoom - 0.2).toFixed(2)))} className="rounded-md p-1 text-fg-3 hover:text-fg" aria-label="Zoom out">
            <Minus className="h-4 w-4" />
          </button>
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoomKeepCenter(Number(e.target.value))}
            className="flex-1 accent-[#f28c38]"
            aria-label="Zoom"
          />
          <button type="button" onClick={() => setZoomKeepCenter(Math.min(3, +(zoom + 0.2).toFixed(2)))} className="rounded-md p-1 text-fg-3 hover:text-fg" aria-label="Zoom in">
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>
    </Modal>
  );
}
