-- ==============================================================================
-- TOSS TMS — Production Database Schema, Storage & RLS
-- Project: Trucking One Stop Shop (truckingonestopshop.net)
-- Compatible with: Dedicated Supabase OR Shared TOSS Supabase
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. PROFILES (Extends Supabase auth.users or internal users)
CREATE TABLE IF NOT EXISTS public.tms_profiles (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('owner', 'dispatcher', 'admin')) DEFAULT 'dispatcher',
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. COMPANIES (Carrier entities managed by dispatchers)
CREATE TABLE IF NOT EXISTS public.tms_companies (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  mc_number TEXT,
  dot_number TEXT,
  contact_name TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  address TEXT,
  commission_percent NUMERIC(5,2) NOT NULL DEFAULT 10.00,
  billing_cadence TEXT NOT NULL CHECK (billing_cadence IN ('weekly', 'monthly')) DEFAULT 'weekly',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. COMPANY DISPATCHERS (Join table for scoped multi-carrier assignments)
CREATE TABLE IF NOT EXISTS public.tms_company_dispatchers (
  company_id TEXT NOT NULL REFERENCES public.tms_companies(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (company_id, user_id)
);

-- 4. DRIVERS
CREATE TABLE IF NOT EXISTS public.tms_drivers (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id TEXT NOT NULL REFERENCES public.tms_companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  cdl_number TEXT,
  cdl_expiry TEXT,
  medical_card_expiry TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. TRUCKS & EQUIPMENT
CREATE TABLE IF NOT EXISTS public.tms_trucks (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id TEXT NOT NULL REFERENCES public.tms_companies(id) ON DELETE CASCADE,
  unit_number TEXT NOT NULL,
  trailer_number TEXT,
  plate TEXT,
  vin_number TEXT,
  trailer_type TEXT DEFAULT '53ft Dry Van',
  trailer_length TEXT DEFAULT '53 ft',
  max_weight INT DEFAULT 45000,
  door_type TEXT DEFAULT 'Swing',
  suspension TEXT DEFAULT 'Air Ride',
  important_info TEXT,
  accessories JSONB DEFAULT '[]'::jsonb,
  custom_pitch TEXT,
  assigned_driver_id TEXT REFERENCES public.tms_drivers(id) ON DELETE SET NULL,
  current_location TEXT,
  empty_date TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. LOADS
CREATE TABLE IF NOT EXISTS public.tms_loads (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id TEXT NOT NULL REFERENCES public.tms_companies(id) ON DELETE CASCADE,
  driver_id TEXT REFERENCES public.tms_drivers(id) ON DELETE SET NULL,
  truck_id TEXT REFERENCES public.tms_trucks(id) ON DELETE SET NULL,
  load_number TEXT,
  origin_city TEXT NOT NULL,
  origin_state TEXT NOT NULL,
  destination_city TEXT NOT NULL,
  destination_state TEXT NOT NULL,
  pickup_date TEXT NOT NULL,
  delivery_date TEXT NOT NULL,
  gross_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  dispatcher_cut NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  status TEXT NOT NULL CHECK (status IN ('new', 'booked', 'in_transit', 'delivered', 'invoiced', 'paid', 'canceled_by_broker', 'canceled_by_carrier')) DEFAULT 'new',
  broker_name TEXT NOT NULL,
  broker_contact TEXT,
  broker_email TEXT,
  broker_phone TEXT,
  rate_con_number TEXT,
  deadhead_miles NUMERIC(10,2) DEFAULT 0.00,
  loaded_miles NUMERIC(10,2) DEFAULT 0.00,
  total_miles NUMERIC(10,2) DEFAULT 0.00,
  rate_per_mile NUMERIC(10,2) DEFAULT 0.00,
  weight_lbs INT,
  broker_notes TEXT,
  stops JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. DOCUMENTS (Rate Cons, BOLs, PODs, Lumper Receipts)
CREATE TABLE IF NOT EXISTS public.tms_documents (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id TEXT NOT NULL REFERENCES public.tms_companies(id) ON DELETE CASCADE,
  load_id TEXT REFERENCES public.tms_loads(id) ON DELETE CASCADE,
  driver_id TEXT REFERENCES public.tms_drivers(id) ON DELETE SET NULL,
  doc_type TEXT NOT NULL DEFAULT 'other',
  classification_label TEXT,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size BIGINT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. INVOICES
CREATE TABLE IF NOT EXISTS public.tms_invoices (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id TEXT REFERENCES public.tms_companies(id) ON DELETE CASCADE,
  invoice_number TEXT NOT NULL UNIQUE,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  due_date TEXT,
  status TEXT NOT NULL CHECK (status IN ('draft', 'sent', 'paid')) DEFAULT 'draft',
  total_gross NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  total_commission NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  notes TEXT,
  pdf_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. INVOICE LOADS (Join table linking loads to invoices)
CREATE TABLE IF NOT EXISTS public.tms_invoice_loads (
  invoice_id TEXT NOT NULL REFERENCES public.tms_invoices(id) ON DELETE CASCADE,
  load_id TEXT NOT NULL REFERENCES public.tms_loads(id) ON DELETE CASCADE,
  gross_amount NUMERIC(10,2) NOT NULL,
  commission_amount NUMERIC(10,2) NOT NULL,
  PRIMARY KEY (invoice_id, load_id)
);

-- 10. COMPANY VAULT (Compliance docs: COI, W-9, Authority, NOA)
CREATE TABLE IF NOT EXISTS public.tms_company_vault (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id TEXT NOT NULL REFERENCES public.tms_companies(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL, -- 'w9', 'coi', 'authority', 'noa', 'other'
  title TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size BIGINT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- Convenient Views (Allows direct access via both `tms_loads` and `loads`)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.companies AS SELECT * FROM public.tms_companies;
CREATE OR REPLACE VIEW public.drivers AS SELECT * FROM public.tms_drivers;
CREATE OR REPLACE VIEW public.trucks AS SELECT * FROM public.tms_trucks;
CREATE OR REPLACE VIEW public.loads AS SELECT * FROM public.tms_loads;
CREATE OR REPLACE VIEW public.invoices AS SELECT * FROM public.tms_invoices;
CREATE OR REPLACE VIEW public.load_documents AS SELECT * FROM public.tms_documents;

-- ------------------------------------------------------------------------------
-- Storage Bucket Setup for Documents
-- ------------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('tms-documents', 'tms-documents', true)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS Policies
CREATE POLICY "Allow authenticated uploads"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'tms-documents');

CREATE POLICY "Allow public read access to tms-documents"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'tms-documents');

-- ------------------------------------------------------------------------------
-- Basic RLS Policies for App Security
-- ------------------------------------------------------------------------------
ALTER TABLE public.tms_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tms_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tms_drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tms_trucks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tms_loads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tms_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tms_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tms_company_vault ENABLE ROW LEVEL SECURITY;

-- Allow full operations for authenticated users (internal team platform)
CREATE POLICY "Full access for authenticated users on tms_profiles" ON public.tms_profiles FOR ALL TO authenticated USING (true);
CREATE POLICY "Full access for authenticated users on tms_companies" ON public.tms_companies FOR ALL TO authenticated USING (true);
CREATE POLICY "Full access for authenticated users on tms_drivers" ON public.tms_drivers FOR ALL TO authenticated USING (true);
CREATE POLICY "Full access for authenticated users on tms_trucks" ON public.tms_trucks FOR ALL TO authenticated USING (true);
CREATE POLICY "Full access for authenticated users on tms_loads" ON public.tms_loads FOR ALL TO authenticated USING (true);
CREATE POLICY "Full access for authenticated users on tms_documents" ON public.tms_documents FOR ALL TO authenticated USING (true);
CREATE POLICY "Full access for authenticated users on tms_invoices" ON public.tms_invoices FOR ALL TO authenticated USING (true);
CREATE POLICY "Full access for authenticated users on tms_company_vault" ON public.tms_company_vault FOR ALL TO authenticated USING (true);
