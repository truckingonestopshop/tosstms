# To do: document templates, e-signing, email & text sending

Written 2026-11-02.

## Status (2026-11-02, later): our own signing is built in TOSS Cloud
Built (migration `0047_tms_signing.sql`, section **Signing** in the menu):
- Templates: upload a PDF, place Signature / Initials / Date / Text / Checkbox fields, several signer roles, each field filled by TOSS (before sending) or a signer, fields that fill themselves (company name, DOT, MC, address, owner, driver, today…), file-as document type.
- Send from: company Documents tab, a person on Owners, DER & contacts, a driver; or a one-time uploaded PDF (fields placed in the send screen). Signers + copies, signing in order, message, expiry.
- Public signing page `/sign/<token>` (phone or computer): draw or type signature, adopt once for all fields, consent, decline with reason.
- Signed PDF with a certificate page (SHA-256 of the original, each signer's IP / device / times, history), filed on the company / driver, emailed to everyone.
- Sent list with status, copy link, "Text it" (opens the phone's messages), remind, cancel, history.

Still to do:
- [ ] **Add `RESEND_API_KEY`** to `.env.local` and Vercel (you). Until then nothing is emailed; links are copied / texted by hand.
- [ ] Pick the SMS provider (not Quo) and send texts from the server.
- [x] Write-your-own documents (migration `0048_tms_sign_written.sql`): letter-page editor with headings, fonts styles, colors, alignment, lists, tables, images / logo, links, lines, page breaks; values that fill themselves; TOSS and signer fields in the text; Preview PDF with sample values. Turned into a PDF when sent (pages never split a paragraph or table row).
- [ ] Reusable blocks (a clause used in several templates), headers / footers repeated on every page.
- [ ] Automatic reminders (e.g. every 2 days) and an expiry sweep.
- [ ] Send from a case (one-off letters tied to the case).

---

## 0 · Still open from the 2026-11-02 batch

- [ ] **Check in the app** (needs someone signed in to the local TOSS Cloud):
  - Vault login cards: Email / User shows above Password.
  - Dashboard → Drivers, trucks & trailers: no "Driving license: no expiry date" when the license expiry is typed on the driver.
  - No "All companies" picker on Dashboard, Companies, Services, Dispatch, Sales, Billing, Cases, Pending.
  - Cases: new statuses, new case starts at Received, Save button, Completed / Cancelled closes the case, company can't be changed, files on notes.
  - Company → Cases tab: Open / Mine / Closed / All panel, Cases ↔ Customer Service switch.
  - Company → Profile: Owners, DER & contacts card (add owner with license, "Also a driver", several DERs, permits / DOT contact).
- [ ] **Commit and push** once checked (push only when the whole rebuild is done).
- Database changes already live: `0045_tms_case_statuses.sql`, `0046_tms_company_people.sql`.

---

## 1 · Sending email and text from TOSS Cloud

The app sends no email or text today (Resend is only used by Supabase for sign-in emails).

### Email
- Use **Resend** with the existing domain `mail.tosscloud.tech`, sender `TOSS <team@mail.tosscloud.tech>`.
- Needs a Resend API key in `.env.local` and Vercel (`RESEND_API_KEY`), added by you, never pasted in chat.
- A server route sends the message; every send is logged (who, to, what, when, delivered / failed).

### Text (SMS)
- **Not Quo / OpenPhone.** The provider is still **to be decided**.
- Whatever it is must have: an API to send SMS from our number, delivery status callbacks, US 10DLC / A2P registration for business texting.
- Once picked: its keys go in `.env.local` and Vercel, same as email.
- [ ] **Decide the SMS provider** (you).

### Where sending is used
- Documents for signing (part 2).
- Later: anything else that needs a message (reminders, notices).

---

## 2 · Document templates and e-signing (like GHL's Documents & Contracts)

### Templates
- Start from a blank page or an uploaded PDF (TOSS letterhead, e.g. the Freight Dispatch Only Agreement).
- Rich editor: text, images, tables, page breaks, several pages.
- **Merge tags** filled in when sent: company name, address, city, state, MC, DOT, date (day / month / year), owner / DER / driver name, etc. Example: `{{contact.company_name}}`, `{{right_now.year}}`.
- **Fields**: Signature, Initials, Date, Text, Checkbox.
- Each field is assigned to **who fills it**:
  - **TOSS (before sending)**: filled by us on the send screen.
  - **A signer role** (Owner, DER, Driver, Witness, custom): filled by that person when they sign.
- Reusable blocks (a clause or page used in several templates).
- Templates are grouped by where they're sent from (see below).

### Where documents are sent from
- **Company → Documents tab**: W-9, contracts, agreements, policies…
- **DER** (from the Owners, DER & contacts card).
- **Drivers**: employment application, Clearinghouse authorizations, policies…
- **One-off upload**: a letter made for a specific case / process. Upload a PDF, place fields, send. No template needed.

### Sending
- Pick recipients (owner, DER, driver, any contact), each as **Signer** or **CC**.
- Signing **at the same time** or **in order**.
- Send by **email**, **text**, or both (part 1). Each signer gets their own link and only fills their own fields.
- Edit the message (subject / body) before sending. Optional expiry date.

### Signing page (no login)
- Opens from the link on phone or computer, shows the document, guides through the signer's fields.
- Draw or type the signature; initials; date filled automatically.
- Signer can decline (with a reason).

### After sending
- Statuses: Draft, Sent, Viewed, Partly signed, Completed, Declined, Expired.
- Resend / remind; automatic reminders (e.g. every 2 days until signed).
- When everyone has signed: a final PDF with all signatures + a **certificate page** (each signer's name, email / phone, IP, viewed and signed date and time).
- The signed PDF is saved automatically to the right place: the company's Documents, the driver's files or the DER's files (and it counts for paperwork checks where it applies, e.g. employment application).
- Shows on the company's Timeline (sent, viewed, signed).

### Reference (how GHL does it)
- https://help.gohighlevel.com/support/solutions/articles/155000000594 (Documents & Contracts)
- https://help.gohighlevel.com/support/solutions/articles/155000001300 (multiple recipients)
- https://ideas.gohighlevel.com/changelog/multi-role-signing-for-your-documents-and-contracts-templates-right-inside-workf (signer roles)
- https://ideas.gohighlevel.com/changelog/custom-value-linkage-documents-and-contracts (fields linked to contact values)

### Already in the app to build on
- Sales → Templates (`tms_templates`: text with `{{company_name}}`… tags, or a file).
- Sales → Agreements (`tms_agreements`: draft / sent / signed, signed copy upload).

---

### Open-source base (researched 2026-11-02)
- **Documenso** (AGPL-3.0; TypeScript, React, Postgres, Prisma): templates, fields, several recipients, API + webhooks. Enterprise key only for SSO, white-label embed editor, 21 CFR Part 11. Needs its own signing certificate and SMTP.
- **DocuSeal** (AGPL-3.0; Ruby on Rails): free self-host has templates, multiple signers, webhooks, basic API. SMS, embedding, reminders, conditional fields, bulk send are Pro ($20/user/month + per-document fees).
- **OpenSign** (AGPL-3.0): templates, signing order, expiry, audit certificate; smaller project.
- **Don't copy their code into TOSS Cloud**: AGPL would require publishing TOSS Cloud's source to everyone who uses it (carriers signing included).
- **Recommended**: run Documenso unchanged as its own service (e.g. sign.tosscloud.tech) and connect TOSS Cloud to it through its API and webhooks. TOSS Cloud picks the template, fills TOSS's fields, sends; texts go out through our own SMS provider with the signing link; the signed PDF comes back into the company / driver / DER files.
- [ ] **Decide the approach** (you).

## 3 · Order of work

1. You: pick the SMS provider; add the Resend key (and SMS keys) to `.env.local` and Vercel.
2. Email + text sending with a send log.
3. Template editor with merge tags and fields.
4. Send screen (recipients, roles, order, email / text).
5. Public signing page.
6. Final PDF + certificate, saved to the company / driver / DER; statuses, reminders, Timeline.
7. One-off upload-and-send.
