# Research: our own DocuSign (2026-11-02)

## 1. The open-source DocuSign clones

| Project | License | Stack | GitHub ★ | What it has | Catch |
|---|---|---|---|---|---|
| **DocuSeal** | AGPL-3.0 + extra terms (7b) | Ruby on Rails, Vue | ~19k | Field builder (12 types), multiple signers, PDF e-signature + signature verification, API, webhooks, emails | Reminders, SMS verification, conditional fields / formulas, bulk send, embedding, white-label, roles are **Pro (paid)**. Different stack from ours. |
| **Documenso** | AGPL-3.0 | TypeScript, React, Postgres, pdf.js, pdf-lib | ~15.6k | Templates, signing with a digital certificate (PAdES), API, webhooks, teams, self-host | Enterprise key for SSO / white-label embed editor / 21 CFR Part 11. Closest stack to TOSS Cloud. |
| **OpenSign** | AGPL-3.0 | React, Node, MongoDB | ~7.2k | Templates (public link too), signing in order, email OTP, reminders, expiry, audit trail + certificate, bulk send, API | MongoDB / Parse; smaller. |
| **LibreSign** | AGPL-3.0 | Nextcloud app (PHP) | — | Signing inside Nextcloud | Only makes sense with Nextcloud. |

**All of the complete ones are AGPL.** Copying their code into TOSS Cloud would make TOSS Cloud AGPL too: its whole source would have to be offered to everyone who uses it over the web, carriers and drivers who sign included. Running one **unchanged, as its own service**, connected by API, does not do that.

## 2. Free building blocks we *can* put inside TOSS Cloud (permissive licenses)

| Library | License | Use |
|---|---|---|
| **pdfme** | MIT | WYSIWYG template designer on an existing PDF + form filling + PDF generator (browser and Node). Field types: text, multi-variable text, image, SVG, table, list, select (dropdown), date / time, radio, checkbox, barcodes / QR. |
| **@signpdf/signpdf** | MIT | Real digital signature (PKCS#7 / PAdES) on the final PDF, so any change after signing is detectable in Adobe Reader, like DocuSign's seal. |
| **pdf.js** (already used via unpdf) | Apache-2.0 | Showing PDFs. |
| **pdf-lib** (already used) | MIT | Writing values, signatures and the certificate into the PDF. |
| **EmbedPDF** | MIT (v2) / Apache-2.0 (main) | Fast PDF viewer with annotations, if we want a richer viewer. |
| **signature_pad** | MIT | Smooth signature drawing (pressure-like strokes). |

## 3. What DocuSign does, and where we stand

| DocuSign feature | TOSS Cloud today |
|---|---|
| Templates from a PDF, fields placed on pages | ✅ |
| Templates written in the app with merge fields | ✅ (written templates) |
| Signature, initials, date signed, text, checkbox | ✅ |
| Name / email / company / title, number, dropdown, radio, attachment upload, approve / decline fields | ❌ |
| Formulas (calculated fields), conditional fields (show when…) | ❌ |
| Validation (EIN, SSN, phone, email, ZIP masks), read-only / locked prefilled fields | ❌ |
| Several documents in one envelope | ❌ (one document per send) |
| Recipient types: signer, CC | ✅ |
| Needs to view, approver, in-person signer (host hands the tablet), editor | ❌ |
| Signing order, incl. parallel groups | ✅ in order / all at once; ❌ groups |
| Access code, email / SMS one-time code before signing | ❌ |
| Automatic reminders and expiry | ✅ expiry, manual remind; ❌ automatic reminders |
| Correct / void / resend | ✅ void, resend; ❌ correct after sending |
| Bulk send (one template to a list) | ❌ |
| PowerForms (public link anyone can fill and sign, e.g. driver application) | ❌ |
| Signer attachments, comments | ❌ |
| Certificate of completion, audit trail | ✅ |
| Digital certificate seal on the PDF (tamper-evident) | ❌ (values are written in, no cryptographic seal) |
| Branding (logo, colors) on emails and signing page | partly |
| Email delivery | ✅ (Resend) |
| SMS delivery | ❌ (provider not picked) |
| API / webhooks | not needed inside TOSS Cloud |

## 4. Options

**A. Run Documenso unchanged next to TOSS Cloud** (e.g. sign.tosscloud.tech) and connect it by API and webhooks.
Fast to get many features; separate app and database to host and keep updated; the signing and template screens look like Documenso, not TOSS; two places for templates; still need our own glue for companies / drivers / DER / cases.

**B. Upgrade our own signing with the MIT / Apache pieces (recommended).**
Everything stays inside TOSS Cloud (one login, one database, linked to companies, drivers, DER, cases, opportunities). Use **pdfme** for a much richer template designer and field types, **@signpdf** for the tamper-evident digital seal, and build the DocuSign workflow features ourselves in phases:

1. **Fields & designer:** pdfme designer; all field types (name, email, company, title, number, dropdown, radio, attachment, approve / decline); validation masks; read-only prefilled; formulas; conditional fields.
2. **Envelope & recipients:** several documents per envelope; needs-to-view, approver, in-person signer; parallel signing groups; correct after sending.
3. **Security & proof:** access code, email one-time code (and SMS when the provider is picked); digital certificate seal (PAdES) + "Verify this document" page; full audit.
4. **Automation:** automatic reminders, expiry sweep, bulk send from a list, public PowerForm links (driver application, W-9), signer attachments and comments, branding.

Sources: [DocuSeal](https://github.com/docusealco/docuseal), [Documenso](https://github.com/documenso/documenso), [Documenso self-hosting](https://docs.documenso.com/developers/self-hosting), [OpenSign](https://github.com/OpenSignLabs/OpenSign), [pdfme](https://github.com/pdfme/pdfme), [pdfme features](https://pdfme.com/docs/supported-features), [@signpdf/signpdf](https://www.npmjs.com/package/@signpdf/signpdf), [EmbedPDF licensing](https://github.com/embedpdf/embed-pdf-viewer/blob/main/LICENSING.md), [DocuSign features](https://www.docusign.com/en-au/products/electronic-signature/features), [DocuSign conditional fields](https://support.docusign.com/s/document-item?bundleId=gbo1643332197980&topicId=hew1578456460132.html&_LANG=enus&language=en_US), [DocuSign recipients](https://developers.docusign.com/docs/esign-rest-api/esign101/concepts/recipients/), [DocuSign bulk send](https://www.docusign.com/products/electronic-signature/features/bulk-send), [open-source roundup](https://sliplane.io/blog/5-open-source-docusign-alternatives).
