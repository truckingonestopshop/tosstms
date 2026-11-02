# Sales products, opportunities → cases, case expenses (asked and built 2026-11-02)

Migrations 0050–0052. Sales level (Rep / Manager / CRO) is set per person on Users → TOSS Cloud. Later: case queues instead of assigning to the rep.

## Quick fixes in this batch
- [x] Company Documents: Load paperwork, Rate Confirmation, Lumper Receipt only for people with Dispatch access (owners always).
- [x] An expiry date entered once (driver's License expires / Medical card, or on a license file) goes on the driver and on every file of the same paper.
- [x] Agreements are not Required paperwork (dispatch, DOT compliance, factoring, driver agreements).
- [x] Permits card (truck): drag and drop files.
- [x] Dispatch dashboard "Gross this month": dropdown Delivered / Booked / Picked up (this month).
- [x] Opening a case from a customer keeps you in the customer's account (not the all-companies Cases page).

## Products (Sales → Products)
- [x] Variants: one product (e.g. Articles of Incorporation) with a list of variants (e.g. each state) and each variant's price.
- [x] Type: add **Exchange**.
- [x] Expense of the product (if any), per product / variant.
- [x] Timeframe (how long the work takes) → the case's due date is set from it.
- [x] Discounts allowed: Rep, Manager, CRO amounts. A rep adds up to the Rep discount; a manager Rep + Manager; the CRO all three.

## Opportunities
- [x] New opportunity starts as **New**.
- [x] Pick a product; if it has variants a second dropdown appears and a variant is required.
- [x] Discounts tab per line (limited by the person's level: Rep / Manager / CRO).
- [x] Invoice created / sent → opportunity **Invoice sent**.
- [x] Invoice charged (paid) → opportunity **Won** and a case is created **for each product line** (title: product + variant), assigned to the rep (queues later), due date from the product's timeframe.

## Cases
- [x] Due date from the product's timeframe; the overdue alert can be turned off, with a required reason (the entity takes longer).
- [x] Expenses: several per case, prefilled from the product's expense (editable), with payment method (cards / bank accounts from Accounting, client's bank account, client's credit card), date, agent who processed it, website, receipt files (several).
- [x] Files (PDF, photos, any file) on notes, work time and expenses.
