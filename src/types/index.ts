// ==============================================================================
// TOSS TMS — Type Definitions
// ==============================================================================

export type UserRole = 'owner' | 'dispatcher' | 'admin';

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  created_at?: string;
}

export type BillingCadence = 'weekly' | 'monthly';

export interface Company {
  id: string;
  name: string;
  mc_number: string;
  dot_number: string;
  contact_name: string;
  contact_phone: string;
  contact_email: string;
  address?: string;
  commission_percent: number;
  billing_cadence: BillingCadence;
  notes: string;
  created_at: string;
}

export interface CompanyDispatcher {
  company_id: string;
  user_id: string;
  created_at?: string;
}

export interface Driver {
  id: string;
  company_id: string;
  name: string;
  phone: string;
  email?: string;
  cdl_number: string;
  cdl_expiry: string;
  medical_card_expiry: string;
  notes: string;
  created_at: string;
}

export interface TruckAccessory {
  id: string;
  name: string;
  quantity?: number;
  details?: string;
}

export interface Truck {
  id: string;
  company_id: string;
  unit_number: string;
  trailer_number: string;
  plate: string;
  vin_number?: string;
  trailer_type: string;
  trailer_length: string;
  max_weight: number;
  door_type?: string;
  suspension?: string;
  important_info?: string;
  accessories: TruckAccessory[];
  custom_pitch?: string;
  assigned_driver_id?: string | null;
  current_location?: string;
  empty_date?: string;
  notes: string;
  created_at: string;
}

export type LoadStatus =
  | 'new'
  | 'booked'
  | 'in_transit'
  | 'delivered'
  | 'invoiced'
  | 'paid'
  | 'canceled_by_broker'
  | 'canceled_by_carrier';

export type StopStatus = 'ready' | 'en_route' | 'arrived' | 'completed' | 'pending';

export interface LoadStop {
  id: string;
  stop_number: number;
  type: 'pickup' | 'delivery';
  facility_name?: string;
  address?: string;
  city: string;
  state: string;
  zip?: string;
  phone?: string;
  contact_name?: string;
  date: string;
  appointment_time?: string;
  appointment_window?: string;
  commodities?: string;
  reference_numbers?: string;
  instructions?: string[];
  status: StopStatus;
  notes?: string;
}

export interface Load {
  id: string;
  company_id: string;
  driver_id: string | null;
  truck_id: string | null;
  load_number?: string;
  origin_city: string;
  origin_state: string;
  destination_city: string;
  destination_state: string;
  pickup_date: string;
  delivery_date: string;
  gross_amount: number;
  dispatcher_cut: number;
  status: LoadStatus;
  broker_name: string;
  broker_contact: string;
  broker_email?: string;
  broker_phone?: string;
  rate_con_number: string;
  deadhead_miles?: number;
  loaded_miles?: number;
  total_miles?: number;
  rate_per_mile?: number;
  weight_lbs?: number;
  broker_notes?: string;
  stops?: LoadStop[];
  created_at: string;
  updated_at: string;
  // Computed helpers for UI
  driver_name?: string;
  truck_unit?: string;
  company_name?: string;
}

export type StandardDocType =
  | 'rate_confirmation'
  | 'bol'
  | 'pod'
  | 'lumper_receipt'
  | 'insurance'
  | 'authority'
  | 'contract'
  | 'other';

export type DocType = StandardDocType | (string & {});

export interface DocumentItem {
  id: string;
  company_id: string;
  load_id: string | null;
  driver_id: string | null;
  doc_type: DocType;
  classification_label?: string;
  file_path: string;
  file_name: string;
  file_size?: number;
  uploaded_at: string;
}

export interface CompanyVaultItem {
  id: string;
  company_id: string;
  doc_type: 'w9' | 'coi' | 'authority' | 'noa' | 'other';
  title: string;
  file_path: string;
  file_name: string;
  file_size?: number;
  uploaded_at: string;
}

export type InvoiceStatus = 'draft' | 'sent' | 'paid';

export interface InvoiceLineItem {
  id?: string;
  description: string;
  load_id?: string | null;
  load_number?: string;
  pickup_date?: string;
  delivery_date?: string;
  gross_amount: number;
  commission_percent: number;
  commission_amount: number;
}

export interface Invoice {
  id: string;
  company_id: string | null;
  invoice_number: string;
  period_start: string;
  period_end: string;
  due_date?: string | null;
  status: InvoiceStatus;
  total_gross: number;
  total_commission: number;
  notes?: string;
  created_at: string;
  company_name?: string;
  line_items?: InvoiceLineItem[];
  pdf_url?: string;
}

export interface ExtractedRateCon {
  broker_name?: string;
  broker_contact?: string;
  broker_email?: string;
  broker_phone?: string;
  broker_mc?: string;
  rate_con_number?: string;
  load_number?: string;
  gross_amount?: number;
  origin_city?: string;
  origin_state?: string;
  origin_address?: string;
  origin_zip?: string;
  destination_city?: string;
  destination_state?: string;
  destination_address?: string;
  destination_zip?: string;
  pickup_date?: string;
  pickup_time?: string;
  delivery_date?: string;
  delivery_time?: string;
  weight_lbs?: number;
  commodities?: string;
  equipment_type?: string;
  notes?: string;
  stops?: LoadStop[];
  total_miles?: number;
  rate_per_mile?: number;
}

export interface MapboxRouteResult {
  distanceMiles: number;
  durationMinutes: number;
  geometry: {
    type: 'LineString';
    coordinates: [number, number][];
  };
  waypoints: {
    name: string;
    location: [number, number];
  }[];
}

export type TimeRangePreset = '7d' | '1m' | '3m' | '6m' | '1y' | 'all' | 'custom';
