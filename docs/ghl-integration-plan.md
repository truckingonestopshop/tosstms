# Lead Hunter → GoHighLevel → TOSS Cloud

Two parts, done in order. Each step says who does it and how we know it's done.

```
Lead Hunter                GoHighLevel (GHL)                     TOSS Cloud
[Send to GHL] ──────────▶  Contact (type: Lead)
                           agent works the lead
                           type: Lead → Customer ──workflow──▶  Carrier created
                                                  (webhook)     (services, source, sold by)
```

---

## Part 1 · Lead Hunter → GHL (the "Send to GHL" button)

**Result:** on a lead's page in Lead Hunter (`/c/{DOT}`), one click creates the contact in GHL with
everything Hunter knows. Clicking again updates it; it never makes a second contact.

### Step 1.1 · GHL access (you, ~5 min)
1. GHL sub-account → **Settings → Private Integrations → Create new integration**
2. Name: `TOSS Lead Hunter`. Permissions: **View/Edit Contacts**, **View Custom Fields**, **View Locations**.
3. Copy the token. Find the **Location ID** (Settings → Business Profile, or the part after `/location/` in the address bar).
4. Add both to Lead Hunter yourself (never paste them in chat):
   - `E:\DEV\TOSS LEADS\TOSS\apps\web\.env.local` → `GHL_TOKEN=…` and `GHL_LOCATION_ID=…`
   - Vercel → Lead Hunter project → Settings → Environment Variables → same two names
- **Done when:** both are saved in both places.

### Step 1.2 · Field map (me, checked with you)
Which Hunter value goes into which GHL field. GHL custom fields are found **by name**, so renaming a field in
GHL later means updating this list.

| GHL field | From Lead Hunter |
|---|---|
| First name / Last name | Owner / officer name (split) |
| Phone (Primary) | Company phone |
| Email | Company email |
| Business name | Legal name |
| DBA Name | DBA |
| DOT | USDOT number |
| MC | MC / docket number |
| Street address, City, State, Postal code, Country | Physical address |
| Equipment | Equipment from the fleet data |
| Number of Trucks / Number of Drivers | Power units / drivers |
| Registration date | Authority / MCS-150 date |
| TOSS DOT CRM | Link to the company in Lead Hunter (`…/c/{DOT}`) |
| Contact type | `Lead` |
| Tag | `lead hunter` |
- **Done when:** you confirm the table (add or remove fields).

### Step 1.3 · Server side in Lead Hunter (me)
- A server route `POST /api/leads/{dot}/ghl`: loads the lead, builds the contact, and calls GHL's
  **upsert contact** (matches an existing contact by phone or email, so no duplicates).
- Looks up the GHL custom field IDs by name (cached), saves the GHL contact ID for that DOT, and returns the
  link to the contact in GHL.
- The token stays on the server; only signed-in Hunter users can call it.
- New table in Lead Hunter's database for the link (DOT ↔ GHL contact, who sent it, when). Nothing existing changes.
- **Done when:** typecheck, lint and build pass.

### Step 1.4 · The button (me)
- **Send to GHL** on the lead page. After sending: **In GHL ✓ · Open** (opens the contact in GHL) and
  **Update in GHL** to resend.
- Clear error if GHL refuses (wrong token, missing permission, missing field).
- **Done when:** checked in the browser.

### Step 1.5 · Live test (together)
1. Send one real lead from Hunter.
2. Open it in GHL: every field from 1.2 is filled, type is Lead, tag is there.
3. Send again: still one contact, updated.
- **Done when:** you're happy with what lands in GHL. Then commit and push Lead Hunter.

---

## Part 2 · GHL → TOSS Cloud (Lead → Customer)

**Result:** when an agent changes a contact's **Contact type from Lead to Customer**, the carrier appears in
TOSS Cloud with its details, the services sold, the source and who sold it.

### Step 2.1 · GHL fields (you, ~5 min)
GHL → Settings → Custom Fields (Contact):
1. **+ Add Field → Checkbox** · name `Services Sold` · options: Dispatch, DOT Compliance, MCPT, Accounting, Factoring, Fuel Card, Insurance.
2. **+ Add Field → Single line** · name `Referred By`.
3. **+ Add Field → Single line** · name `EIN` (optional).
4. Edit the existing **Contact Source** field and add the options: Call List, Cross Sale, X Marketing, Email Marketing, Text Marketing.
   (Already understood: Facebook / Instagram / WhatsApp / LinkedIn Marketing, Referred By a Client, Fiverr.)

"Sold by" = the contact **Owner** in GHL.
- **Done when:** the fields exist.

### Step 2.2 · Receiving address in TOSS Cloud (me)
- `POST https://tosscloud.tech/api/ghl/customer?key=…` with a secret key (kept in Cloud's settings, local and Vercel).
- Only acts when the contact type is **Customer**.
- Creates the carrier: name, DBA, EIN, DOT, MC, address, owner first/last name, phone, email, 2nd contact,
  services sold (with Source, Referred by and Sold by on each), and the GHL contact ID.
- **Already in Cloud** (same GHL contact or same DOT): fills in what's missing and adds new services; never
  overwrites what the team typed, never deletes.
- Every call is logged (what came in, what was created or why it was skipped).
- **Done when:** typecheck, lint and build pass.

### Step 2.3 · Test with sample data (me)
- Send sample GHL payloads to the local address: new carrier, same DOT again, missing DOT, wrong key.
- **Done when:** each case does the right thing. Then commit and push Cloud.

### Step 2.4 · The GHL workflow (you, with my exact steps)
1. Automation → Workflows → **Create workflow → Start from scratch**.
2. Trigger: **Contact Changed** → filter **Contact type is Customer**.
3. Action: **Webhook**, method **POST**, URL = the address from 2.2 (with the key).
4. Save, test with a fake contact, then **Publish**.
- **Done when:** the workflow is published.

### Step 2.5 · Live test (together)
1. In GHL, set a test contact (with DOT, services, source) to **Customer**.
2. It shows up in TOSS Cloud with services checked and Sold by / Source filled.
3. Change it back and forth: still one carrier.
4. Delete the test carrier.

---

## Status

| Step | Who | Status |
|---|---|---|
| 1.1 GHL access | You | Done (token checked: GHL answered) |
| 1.2 Field map | Me + you | Done |
| 1.3 Hunter server route | Me | Done, live (06fb87d) |
| 1.4 Button | Me | Done, live (06fb87d) |
| 1.5 Live test | Together | In progress |
| 2.1 GHL fields | You | To do (steps above) |
| 2.2 Cloud receiving address | Me | Done (/api/ghl/customer, migration 0019 applied). Not committed |
| 2.3 Sample tests | Me | Done: 6 cases pass locally, test rows removed |
| 2.4 GHL workflow | You | After 2.2 is pushed live |
| 2.5 Live test | Together | — |
