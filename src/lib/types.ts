// Row shapes of the tms_* tables (see supabase/migrations/0001_tms_core.sql).
// Dates are ISO strings: `date` columns as "YYYY-MM-DD", timestamps as full ISO.

export type Role = "owner" | "dispatcher";

export interface Member {
  user_id: string;
  email: string;
  full_name: string;
  role: Role;
  created_at: string;
}

export type BillingCadence = "weekly" | "monthly";

export interface Company {
  id: string;
  name: string;
  mc_number: string | null;
  dot_number: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  address: string | null;
  commission_percent: number;
  billing_cadence: BillingCadence;
  payment_terms_days: number;
  factoring_company: string | null;
  factoring_email: string | null;
  status: "active" | "inactive";
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Driver {
  id: string;
  company_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  cdl_number: string | null;
  cdl_state: string | null;
  cdl_expiry: string | null;
  medical_card_expiry: string | null;
  status: "active" | "inactive";
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface TruckAccessory {
  id: string;
  name: string;
  quantity: number;
  details?: string;
}

/** Extra notes a dispatcher pins to a truck's broker sheet. */
export interface DeskBlock {
  id: string;
  kind: "note" | "specs" | "checklist";
  title: string;
  text?: string;
  specs?: { label: string; value: string }[];
  items?: { id: string; text: string; done: boolean }[];
}

export type TruckStatus = "active" | "out_of_service" | "inactive";

/** A trailer is its own unit: it can be dropped and hooked to another truck. */
export interface Trailer {
  id: string;
  company_id: string;
  unit_number: string;
  trailer_type: string | null;
  trailer_length: string | null;
  max_weight: number | null;
  door_type: string | null;
  suspension: string | null;
  /** reefer unit, e-track, liftgate, food grade… */
  features: string | null;
  /** type-specific specs (air chute, reefer unit, deck…), see lib/trailerSpecs.ts */
  specs: Record<string, string | string[]>;
  plate: string | null;
  vin_number: string | null;
  year: number | null;
  make: string | null;
  status: TruckStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Truck {
  id: string;
  company_id: string;
  unit_number: string;
  /** hooked trailer; the trailer_* fields below mirror it (kept in step by the database) */
  trailer_id: string | null;
  trailer_number: string | null;
  plate: string | null;
  vin_number: string | null;
  year: number | null;
  make: string | null;
  trailer_type: string | null;
  trailer_length: string | null;
  max_weight: number | null;
  door_type: string | null;
  suspension: string | null;
  important_info: string | null;
  accessories: TruckAccessory[];
  desk_blocks: DeskBlock[];
  custom_pitch: string | null;
  assigned_driver_id: string | null;
  current_location: string | null;
  available_date: string | null;
  status: TruckStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type LoadStatus =
  | "new"
  | "booked"
  | "in_transit"
  | "delivered"
  | "invoiced"
  | "paid"
  | "canceled_by_broker"
  | "canceled_by_carrier";

export type StopStatus = "pending" | "en_route" | "arrived" | "completed";

export interface LoadStop {
  id: string;
  type: "pickup" | "delivery";
  facility_name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  date: string;
  time: string;
  /** e.g. "FCFS 08:00–16:00" or "Appt 10:00" */
  appointment: string;
  contact_name: string;
  phone: string;
  reference_numbers: string;
  commodity: string;
  weight: string;
  instructions: string;
  status: StopStatus;
}

export interface Load {
  id: string;
  company_id: string;
  driver_id: string | null;
  truck_id: string | null;
  trailer_id?: string | null;
  dispatcher_id: string | null;
  load_number: string | null;
  rate_con_number: string | null;
  status: LoadStatus;
  broker_name: string;
  broker_mc: string | null;
  broker_contact: string | null;
  broker_email: string | null;
  broker_phone: string | null;
  origin_city: string;
  origin_state: string;
  destination_city: string;
  destination_state: string;
  pickup_date: string | null;
  delivery_date: string | null;
  gross_amount: number;
  commission_percent: number;
  dispatcher_cut: number;
  loaded_miles: number;
  deadhead_miles: number;
  /** where the truck is empty before the first pickup ("City, ST") */
  deadhead_from?: string | null;
  weight_lbs: number | null;
  commodity: string | null;
  equipment_type: string | null;
  broker_notes: string | null;
  internal_notes: string | null;
  stops: LoadStop[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface LoadEvent {
  id: string;
  load_id: string;
  kind: "created" | "status" | "note" | "document" | "update";
  from_status: LoadStatus | null;
  to_status: LoadStatus | null;
  message: string | null;
  actor_id: string | null;
  actor_name: string | null;
  created_at: string;
}

export type DocScope = "company" | "load" | "driver" | "truck" | "trailer" | "any";

/** When a document type is required. Loads: from that status on. */
export type DocRequired = "always" | "booked" | "in_transit" | "delivered";

export interface DocType {
  key: string;
  name: string;
  scope: DocScope;
  is_default: boolean;
  /** null = optional */
  required_from: DocRequired | null;
  /** asks for an expiry date and shows expiry alerts */
  has_expiry: boolean;
  /** merged into the load's billing packet */
  in_packet: boolean;
  sort: number;
}

export interface DocumentItem {
  id: string;
  company_id: string;
  load_id: string | null;
  driver_id: string | null;
  truck_id: string | null;
  trailer_id?: string | null;
  doc_type: string;
  file_path: string;
  file_name: string;
  file_size: number | null;
  mime_type: string | null;
  expires_on: string | null;
  notes: string | null;
  uploaded_by: string | null;
  uploaded_at: string;
}

export type InvoiceStatus = "draft" | "sent" | "paid" | "void";
export type InvoiceType = "load" | "custom";
export type Currency = "USD" | "EUR" | "MDL";

export interface InvoiceOverrides {
  bill_to_title?: string;
  terms_title?: string;
  terms_text?: string;
  remittance_title?: string;
  remittance_text?: string;
  total_label?: string;
  footer_text?: string;
}

export interface InvoiceLine {
  id: string;
  invoice_id: string;
  load_id: string | null;
  position: number;
  description: string;
  line_date: string | null;
  quantity: number;
  unit_price: number;
  gross_amount: number;
  amount: number;
  load_number: string | null;
  rate_con_number: string | null;
  broker_name: string | null;
  driver_name: string | null;
  origin: string | null;
  destination: string | null;
  pickup_date: string | null;
  delivery_date: string | null;
}

export type PaymentMethod = "ach" | "zelle" | "wire" | "check" | "card" | "cash" | "factoring" | "other";

/** One payment received on an invoice (the invoice's amount paid and status follow from these). */
export interface InvoicePayment {
  id: string;
  invoice_id: string;
  amount: number;
  paid_on: string;
  method: PaymentMethod;
  reference: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export interface Invoice {
  id: string;
  company_id: string | null;
  invoice_number: string;
  invoice_type: InvoiceType;
  status: InvoiceStatus;
  currency: Currency;
  issue_date: string;
  due_date: string | null;
  period_start: string | null;
  period_end: string | null;
  total_gross: number;
  total_due: number;
  amount_paid: number;
  notes: string | null;
  issuer_name: string | null;
  issuer_address: string | null;
  issuer_email: string | null;
  issuer_phone: string | null;
  bill_to_name: string | null;
  bill_to_details: string | null;
  doc_overrides: InvoiceOverrides;
  sent_at: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
  lines: InvoiceLine[];
}

export type VaultCategory = "login" | "contact" | "custom";

export interface VaultItem {
  id: string;
  company_id: string;
  category: VaultCategory;
  title: string;
  url: string | null;
  username: string | null;
  password: string | null;
  account_number: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  role_title: string | null;
  notes: string | null;
  custom_fields: { label: string; value: string }[];
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Settings {
  id: 1;
  issuer_name: string;
  issuer_address: string;
  issuer_email: string;
  issuer_phone: string;
  invoice_prefix: string;
  remittance_text: string;
  footer_text: string;
}

/** What the rate con reader returns; every field is optional and editable. */
export interface RateConExtract {
  carrier_name?: string;
  driver_name?: string;
  truck_unit?: string;
  trailer_number?: string;
  load_number?: string;
  rate_con_number?: string;
  broker_name?: string;
  broker_mc?: string;
  broker_contact?: string;
  broker_email?: string;
  broker_phone?: string;
  gross_amount?: number;
  loaded_miles?: number;
  weight_lbs?: number;
  commodity?: string;
  equipment_type?: string;
  broker_notes?: string;
  stops?: Partial<LoadStop>[];
}
