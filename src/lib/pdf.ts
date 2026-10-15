"use client";

/** Saves a rendered document element (an invoice) as a letter-size PDF file. */
export async function saveElementPdf(el: HTMLElement, fileName: string) {
  const [h2c, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);
  const html2canvas = (h2c as unknown as { default?: typeof import("html2canvas").default }).default ?? (h2c as unknown as typeof import("html2canvas").default);
  const canvas = await html2canvas(el, {
    scale: 2,
    backgroundColor: "#ffffff",
    useCORS: true,
    onclone: (doc: Document) => {
      const s = doc.createElement("style");
      // The document is always black on white; drop the on-screen shadow and edit outlines.
      s.textContent = `.print-sheet{box-shadow:none!important;border-radius:0!important} .print-sheet input,.print-sheet textarea{border-color:transparent!important;background:transparent!important}`;
      doc.head.appendChild(s);
    },
  });
  const img = canvas.toDataURL("image/png");
  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
  const pw = pdf.internal.pageSize.getWidth();
  const ph = pdf.internal.pageSize.getHeight();
  const h = (canvas.height * pw) / canvas.width;
  let left = h;
  let y = 0;
  pdf.addImage(img, "PNG", 0, y, pw, h);
  left -= ph;
  while (left > 0) {
    y -= ph;
    pdf.addPage();
    pdf.addImage(img, "PNG", 0, y, pw, h);
    left -= ph;
  }
  pdf.save(fileName.endsWith(".pdf") ? fileName : `${fileName}.pdf`);
}
