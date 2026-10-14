# TOSS TMS — Trucking Management System

Internal operations, dispatch, fleet, and billing platform for **Trucking One Stop Shop** ([truckingonestopshop.net](https://truckingonestopshop.net)).

---

## Architecture & Features

- **Multi-Carrier Tenant Management**: Switch between assigned carrier companies or master view. Scoped loads, drivers, equipment, and commission rates.
- **Operations Dashboard**: Gross volume, commission cut, active in-transit loads, and un-invoiced freight.
- **Interactive Dispatch Calendar**: Dual-mode monthly grid and schedule agenda view with 7d, 1m, 3m, 6m, 1y, and lifetime presets, multi-select batch status updating, and quick load inspection.
- **Loads Board & Full Lifecycle**: Complete freight status tracking (`Booked` → `In Transit` → `Delivered` → `Invoiced` → `Paid`).
- **Rate Confirmation Scanner**: Drag-and-drop broker PDF/image import. DeepSeek LLM structured data extraction with local OCR fallback. Zero AI buzzwords—straightforward freight terminology.
- **Mapbox Route Engine**: Dynamic Mapbox GL JS route visualizer with dark/light map tiles, turn-by-turn driving distance, and drive time estimation.
- **Invoicing & Factoring Packets**:
  - Carrier commission invoicing with calendar-based load selection.
  - Printable/PDF invoice sheets with remittance instructions.
  - **Factoring Packet Bundler**: One-click download compiling Invoice + Rate Con + Signed POD + Lumper receipts into a clean PDF package for factoring partners (Apex, RTS, Triumph, WinFactor).
- **Fleet & Compliance Vault**:
  - Driver records with automated CDL and DOT Medical Card expiration alerts.
  - Tractor & trailer inventory with live empty status and location tracking.
  - Carrier compliance document vault (W-9, COI, Operating Authority, NOA).
  - **Live Broker Desk**: Instant copy-paste credentials for dispatchers working load boards.
- **Light & Dark Theme**: Full theme support with signature TOSS Orange (`#F79B4D`) accents and Eina 03 typography.
- **Responsive Layout**: Desktop control center + optimized mobile navigation for dispatchers on smartphones and tablets.

---

## Getting Started

### 1. Install Dependencies & Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 2. Configure Environment Variables

Edit `.env.local`:

```bash
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://yguxmgqnnbjmpzrxqlco.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

# Mapbox Token (for interactive maps & distance)
NEXT_PUBLIC_MAPBOX_TOKEN=your-mapbox-token

# DeepSeek API (for Rate Confirmation extraction)
DEEPSEEK_API_KEY=your-deepseek-api-key
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat
```

### 3. Supabase Database Setup

1. Open your Supabase SQL editor (`https://yguxmgqnnbjmpzrxqlco.supabase.co` or your shared project).
2. Run [`supabase/schema.sql`](supabase/schema.sql) to create all `tms_*` tables, storage buckets, views, and RLS policies.
3. (Optional) Run [`supabase/seed.sql`](supabase/seed.sql) to populate initial sample carriers, drivers, equipment, and freight loads.

---

## Deployment (Vercel)

1. Connect the GitHub repository.
2. In Vercel Project Settings → Environment Variables, add the keys from `.env.local`.
3. Deploy!
