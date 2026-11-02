"use client";

import { useEffect, useState } from "react";
import type { PageSize } from "@/lib/signing";

/** Page sizes (PDF points) of a PDF. */
export async function pdfPageSizes(bytes: Uint8Array): Promise<PageSize[]> {
  const { getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(bytes.slice());
  const out: PageSize[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const vp = (await pdf.getPage(p)).getViewport({ scale: 1 });
    out.push({ w: vp.width, h: vp.height });
  }
  return out;
}

/**
 * A PDF shown page by page, each with an overlay on top (fields). The overlay is positioned in
 * shares of the page (0–1), so it lines up at any width. `src` is a URL or the file's bytes.
 */
export function PdfPages({
  src,
  pages,
  overlay,
  onPageClick,
  className,
}: {
  src: string | Uint8Array | null;
  pages: PageSize[];
  overlay?: (page: number) => React.ReactNode;
  /** a click on the page itself (not on a field), at x / y shares of the page */
  onPageClick?: (page: number, x: number, y: number) => void;
  className?: string;
}) {
  const [images, setImages] = useState<string[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!src) return;
    let alive = true;
    (async () => {
      try {
        const bytes = typeof src === "string" ? new Uint8Array(await (await fetch(src)).arrayBuffer()) : src;
        const { renderPageAsImage, getDocumentProxy } = await import("unpdf");
        const n = (await getDocumentProxy(bytes.slice())).numPages;
        const out: string[] = [];
        for (let p = 1; p <= n; p++) {
          out.push(await renderPageAsImage(bytes.slice(), p, { toDataURL: true, width: 1240 }));
          if (alive) setImages([...out]);
        }
      } catch {
        if (alive) setError("The PDF couldn't be shown.");
      }
    })();
    return () => {
      alive = false;
    };
  }, [src]);

  if (error) return <div className="rounded-lg border border-line p-6 text-center text-sm text-fg-3">{error}</div>;
  return (
    <div className={className}>
      {pages.map((size, i) => (
        <div
          key={i}
          className="relative mx-auto mb-4 w-full overflow-hidden rounded-md bg-white shadow-sm ring-1 ring-line"
          style={{ aspectRatio: `${size.w} / ${size.h}` }}
          onClick={(e) => {
            if (!onPageClick || e.target !== e.currentTarget.querySelector("[data-page-bg]")) return;
            const r = e.currentTarget.getBoundingClientRect();
            onPageClick(i, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
          }}
        >
          {images[i] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img data-page-bg src={images[i]} alt={`Page ${i + 1}`} className="absolute inset-0 h-full w-full select-none" draggable={false} />
          ) : (
            <div data-page-bg className="absolute inset-0 flex items-center justify-center text-xs text-zinc-400">
              Loading page {i + 1}…
            </div>
          )}
          {overlay?.(i)}
        </div>
      ))}
    </div>
  );
}
