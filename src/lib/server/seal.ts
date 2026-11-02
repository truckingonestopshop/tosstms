import "server-only";
import { randomBytes } from "node:crypto";
import { adminClient } from "./admin";

// The digital seal on every completed TossSign PDF (PKCS#7, @signpdf, MIT). Adobe Reader shows the
// document as signed by "TossSign · Trucking One Stop Shop" and flags any change made after it.
// The key is made once (self-signed) and kept in tms_private.sign_keys, read only by the server.

let cached: { p12: Buffer; passphrase: string } | null = null;

async function key() {
  if (cached) return cached;
  const db = adminClient();
  const read = async () => ((await db.rpc("tms_sign_key_get")).data as { p12_base64: string; passphrase: string }[] | null)?.[0];
  let k = await read();
  if (!k) {
    const forge = (await import("node-forge")).default;
    const keys = forge.pki.rsa.generateKeyPair(2048);
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = `01${randomBytes(8).toString("hex")}`;
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date(Date.now() + 1000 * 60 * 60 * 24 * 365 * 15);
    const subject = [
      { name: "commonName", value: "TossSign" },
      { name: "organizationName", value: "Trucking One Stop Shop" },
      { name: "countryName", value: "US" },
    ];
    cert.setSubject(subject);
    cert.setIssuer(subject);
    cert.setExtensions([
      { name: "basicConstraints", cA: false },
      { name: "keyUsage", digitalSignature: true, nonRepudiation: true },
    ]);
    cert.sign(keys.privateKey, forge.md.sha256.create());
    const passphrase = randomBytes(24).toString("hex");
    const p12 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], passphrase, { algorithm: "3des" });
    const b64 = forge.util.encode64(forge.asn1.toDer(p12).getBytes());
    await db.rpc("tms_sign_key_put", { p12: b64, pass: passphrase, subj: "CN=TossSign, O=Trucking One Stop Shop" });
    // Another server may have stored one at the same moment: use whichever is saved.
    k = await read();
  }
  if (!k) throw new Error("The signing key couldn't be made");
  cached = { p12: Buffer.from(k.p12_base64, "base64"), passphrase: k.passphrase };
  return cached;
}

/** Seals a finished PDF. Returns the sealed bytes, or the PDF as it was if sealing fails. */
export async function sealPdf(pdf: Uint8Array, why: string): Promise<{ bytes: Uint8Array; sealed: boolean }> {
  try {
    const [{ PDFDocument }, { pdflibAddPlaceholder }, signpdf, { P12Signer }, k] = await Promise.all([
      import("pdf-lib"),
      import("@signpdf/placeholder-pdf-lib"),
      import("@signpdf/signpdf"),
      import("@signpdf/signer-p12"),
      key(),
    ]);
    const doc = await PDFDocument.load(pdf, { ignoreEncryption: true });
    pdflibAddPlaceholder({ pdfDoc: doc, reason: why, contactInfo: "team@mail.tosscloud.tech", name: "TossSign · Trucking One Stop Shop", location: "TOSS Cloud", signatureLength: 16000 });
    const withPlaceholder = await doc.save({ useObjectStreams: false });
    const signed = await signpdf.default.sign(Buffer.from(withPlaceholder), new P12Signer(k.p12, { passphrase: k.passphrase }));
    return { bytes: new Uint8Array(signed), sealed: true };
  } catch (e) {
    console.error("TossSign seal failed", e);
    return { bytes: pdf, sealed: false };
  }
}
