'use client';

import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { Company, Driver, Truck, Load, Invoice, LoadStatus, InvoiceStatus } from '@/types';
import { INITIAL_COMPANIES, INITIAL_DRIVERS, INITIAL_TRUCKS, INITIAL_LOADS, INITIAL_INVOICES } from './mockData';
import { createClient } from '@/lib/supabase/client';

interface AppContextType {
  // Carrier Scope
  companies: Company[];
  selectedCompanyId: string | 'all';
  setSelectedCompanyId: (id: string | 'all') => void;
  activeCompany: Company | null;

  // Data
  loads: Load[];
  scopedLoads: Load[];
  drivers: Driver[];
  scopedDrivers: Driver[];
  trucks: Truck[];
  scopedTrucks: Truck[];
  invoices: Invoice[];
  scopedInvoices: Invoice[];

  // Actions
  addLoad: (load: Partial<Load>) => Promise<Load>;
  updateLoad: (id: string, updates: Partial<Load>) => Promise<Load | null>;
  deleteLoad: (id: string) => Promise<boolean>;
  batchChangeLoadStatus: (loadIds: string[], status: LoadStatus) => Promise<void>;

  addDriver: (driver: Partial<Driver>) => Promise<Driver>;
  updateDriver: (id: string, updates: Partial<Driver>) => Promise<Driver | null>;

  addTruck: (truck: Partial<Truck>) => Promise<Truck>;
  updateTruck: (id: string, updates: Partial<Truck>) => Promise<Truck | null>;

  addCompany: (company: Partial<Company>) => Promise<Company>;
  updateCompany: (id: string, updates: Partial<Company>) => Promise<Company | null>;

  createInvoice: (invoice: Partial<Invoice>, loadIds?: string[]) => Promise<Invoice>;
  updateInvoiceStatus: (id: string, status: InvoiceStatus) => Promise<Invoice | null>;

  // Sync status
  isOnline: boolean;
  refreshData: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [companies, setCompanies] = useState<Company[]>(INITIAL_COMPANIES);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | 'all'>('all');
  const [drivers, setDrivers] = useState<Driver[]>(INITIAL_DRIVERS);
  const [trucks, setTrucks] = useState<Truck[]>(INITIAL_TRUCKS);
  const [loads, setLoads] = useState<Load[]>(INITIAL_LOADS);
  const [invoices, setInvoices] = useState<Invoice[]>(INITIAL_INVOICES);
  const [isOnline, setIsOnline] = useState(true);

  const supabase = useMemo(() => createClient(), []);

  // Fetch from Supabase with graceful fallback
  const refreshData = useCallback(async () => {
    try {
      const [compRes, drivRes, trkRes, loadRes, invRes] = await Promise.all([
        supabase.from('tms_companies').select('*'),
        supabase.from('tms_drivers').select('*'),
        supabase.from('tms_trucks').select('*'),
        supabase.from('tms_loads').select('*').order('pickup_date', { ascending: false }),
        supabase.from('tms_invoices').select('*').order('created_at', { ascending: false }),
      ]);

      if (compRes.data && compRes.data.length > 0) setCompanies(compRes.data);
      if (drivRes.data && drivRes.data.length > 0) setDrivers(drivRes.data);
      if (trkRes.data && trkRes.data.length > 0) setTrucks(trkRes.data);
      if (loadRes.data && loadRes.data.length > 0) {
        // Hydrate company/driver names
        const enriched = loadRes.data.map((l: Load) => ({
          ...l,
          company_name: companies.find((c) => c.id === l.company_id)?.name,
          driver_name: drivers.find((d) => d.id === l.driver_id)?.name,
          truck_unit: trucks.find((t) => t.id === l.truck_id)?.unit_number,
        }));
        setLoads(enriched);
      }
      if (invRes.data && invRes.data.length > 0) setInvoices(invRes.data);
    } catch (err) {
      console.warn('Supabase not connected or tables not created yet; running on memory state', err);
    }
  }, [supabase, companies, drivers, trucks]);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  // Active carrier company
  const activeCompany = useMemo(() => {
    if (selectedCompanyId === 'all') return null;
    return companies.find((c) => c.id === selectedCompanyId) || null;
  }, [companies, selectedCompanyId]);

  // Scoped views based on selected company
  const scopedLoads = useMemo(() => {
    if (selectedCompanyId === 'all') return loads;
    return loads.filter((l) => l.company_id === selectedCompanyId);
  }, [loads, selectedCompanyId]);

  const scopedDrivers = useMemo(() => {
    if (selectedCompanyId === 'all') return drivers;
    return drivers.filter((d) => d.company_id === selectedCompanyId);
  }, [drivers, selectedCompanyId]);

  const scopedTrucks = useMemo(() => {
    if (selectedCompanyId === 'all') return trucks;
    return trucks.filter((t) => t.company_id === selectedCompanyId);
  }, [trucks, selectedCompanyId]);

  const scopedInvoices = useMemo(() => {
    if (selectedCompanyId === 'all') return invoices;
    return invoices.filter((i) => i.company_id === selectedCompanyId);
  }, [invoices, selectedCompanyId]);

  // Load Actions
  const addLoad = async (newLoadData: Partial<Load>): Promise<Load> => {
    const id = `load-${Date.now()}`;
    const targetCompId = newLoadData.company_id || (selectedCompanyId !== 'all' ? selectedCompanyId : companies[0]?.id || 'comp-001');
    const comp = companies.find((c) => c.id === targetCompId);
    const commPercent = comp?.commission_percent ?? 10.0;
    const gross = Number(newLoadData.gross_amount || 0);
    const dispatcherCut = Number(newLoadData.dispatcher_cut || (gross * commPercent) / 100);

    const fullLoad: Load = {
      id,
      company_id: targetCompId,
      driver_id: newLoadData.driver_id || null,
      truck_id: newLoadData.truck_id || null,
      load_number: newLoadData.load_number || `TOSS-${Math.floor(1000 + Math.random() * 9000)}`,
      origin_city: newLoadData.origin_city || '',
      origin_state: newLoadData.origin_state || '',
      destination_city: newLoadData.destination_city || '',
      destination_state: newLoadData.destination_state || '',
      pickup_date: newLoadData.pickup_date || new Date().toISOString().split('T')[0],
      delivery_date: newLoadData.delivery_date || new Date().toISOString().split('T')[0],
      gross_amount: gross,
      dispatcher_cut: dispatcherCut,
      status: newLoadData.status || 'booked',
      broker_name: newLoadData.broker_name || '',
      broker_contact: newLoadData.broker_contact || '',
      broker_email: newLoadData.broker_email || '',
      broker_phone: newLoadData.broker_phone || '',
      rate_con_number: newLoadData.rate_con_number || '',
      total_miles: Number(newLoadData.total_miles || 0),
      rate_per_mile: Number(newLoadData.rate_per_mile || (gross && newLoadData.total_miles ? gross / newLoadData.total_miles : 0)),
      weight_lbs: newLoadData.weight_lbs,
      broker_notes: newLoadData.broker_notes,
      stops: newLoadData.stops || [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      company_name: comp?.name,
      driver_name: drivers.find((d) => d.id === newLoadData.driver_id)?.name,
      truck_unit: trucks.find((t) => t.id === newLoadData.truck_id)?.unit_number,
    };

    setLoads((prev) => [fullLoad, ...prev]);

    try {
      await supabase.from('tms_loads').insert([fullLoad]);
    } catch {
      // Continue locally
    }

    return fullLoad;
  };

  const updateLoad = async (id: string, updates: Partial<Load>): Promise<Load | null> => {
    let updatedLoad: Load | null = null;

    setLoads((prev) =>
      prev.map((l) => {
        if (l.id === id) {
          const comp = companies.find((c) => c.id === (updates.company_id || l.company_id));
          const gross = Number(updates.gross_amount ?? l.gross_amount);
          const commPercent = comp?.commission_percent ?? 10.0;
          const dispatcherCut = Number(updates.dispatcher_cut ?? (gross * commPercent) / 100);

          updatedLoad = {
            ...l,
            ...updates,
            gross_amount: gross,
            dispatcher_cut: dispatcherCut,
            updated_at: new Date().toISOString(),
            company_name: comp?.name || l.company_name,
            driver_name: drivers.find((d) => d.id === (updates.driver_id ?? l.driver_id))?.name || l.driver_name,
            truck_unit: trucks.find((t) => t.id === (updates.truck_id ?? l.truck_id))?.unit_number || l.truck_unit,
          };
          return updatedLoad;
        }
        return l;
      })
    );

    try {
      await supabase.from('tms_loads').update(updates).eq('id', id);
    } catch {
      // Continue locally
    }

    return updatedLoad;
  };

  const deleteLoad = async (id: string): Promise<boolean> => {
    setLoads((prev) => prev.filter((l) => l.id !== id));
    try {
      await supabase.from('tms_loads').delete().eq('id', id);
    } catch {
      // Continue locally
    }
    return true;
  };

  const batchChangeLoadStatus = async (loadIds: string[], status: LoadStatus) => {
    setLoads((prev) =>
      prev.map((l) => (loadIds.includes(l.id) ? { ...l, status, updated_at: new Date().toISOString() } : l))
    );
    try {
      await supabase.from('tms_loads').update({ status }).in('id', loadIds);
    } catch {
      // Continue locally
    }
  };

  // Driver Actions
  const addDriver = async (driverData: Partial<Driver>): Promise<Driver> => {
    const id = `driv-${Date.now()}`;
    const newDriver: Driver = {
      id,
      company_id: driverData.company_id || (selectedCompanyId !== 'all' ? selectedCompanyId : companies[0]?.id || 'comp-001'),
      name: driverData.name || 'New Driver',
      phone: driverData.phone || '',
      email: driverData.email || '',
      cdl_number: driverData.cdl_number || '',
      cdl_expiry: driverData.cdl_expiry || '',
      medical_card_expiry: driverData.medical_card_expiry || '',
      notes: driverData.notes || '',
      created_at: new Date().toISOString(),
    };
    setDrivers((prev) => [...prev, newDriver]);
    try {
      await supabase.from('tms_drivers').insert([newDriver]);
    } catch {
      // Continue locally
    }
    return newDriver;
  };

  const updateDriver = async (id: string, updates: Partial<Driver>): Promise<Driver | null> => {
    let updated: Driver | null = null;
    setDrivers((prev) =>
      prev.map((d) => {
        if (d.id === id) {
          updated = { ...d, ...updates };
          return updated;
        }
        return d;
      })
    );
    try {
      await supabase.from('tms_drivers').update(updates).eq('id', id);
    } catch {
      // Continue locally
    }
    return updated;
  };

  // Truck Actions
  const addTruck = async (truckData: Partial<Truck>): Promise<Truck> => {
    const id = `trk-${Date.now()}`;
    const newTruck: Truck = {
      id,
      company_id: truckData.company_id || (selectedCompanyId !== 'all' ? selectedCompanyId : companies[0]?.id || 'comp-001'),
      unit_number: truckData.unit_number || 'Unit 99',
      trailer_number: truckData.trailer_number || '',
      plate: truckData.plate || '',
      vin_number: truckData.vin_number || '',
      trailer_type: truckData.trailer_type || '53ft Dry Van',
      trailer_length: truckData.trailer_length || '53 ft',
      max_weight: truckData.max_weight || 45000,
      door_type: truckData.door_type || 'Swing',
      suspension: truckData.suspension || 'Air Ride',
      important_info: truckData.important_info || '',
      accessories: truckData.accessories || [],
      custom_pitch: truckData.custom_pitch || '',
      assigned_driver_id: truckData.assigned_driver_id || null,
      current_location: truckData.current_location || '',
      empty_date: truckData.empty_date || 'Ready Now',
      notes: truckData.notes || '',
      created_at: new Date().toISOString(),
    };
    setTrucks((prev) => [...prev, newTruck]);
    try {
      await supabase.from('tms_trucks').insert([newTruck]);
    } catch {
      // Continue locally
    }
    return newTruck;
  };

  const updateTruck = async (id: string, updates: Partial<Truck>): Promise<Truck | null> => {
    let updated: Truck | null = null;
    setTrucks((prev) =>
      prev.map((t) => {
        if (t.id === id) {
          updated = { ...t, ...updates };
          return updated;
        }
        return t;
      })
    );
    try {
      await supabase.from('tms_trucks').update(updates).eq('id', id);
    } catch {
      // Continue locally
    }
    return updated;
  };

  // Company Actions
  const addCompany = async (compData: Partial<Company>): Promise<Company> => {
    const id = `comp-${Date.now()}`;
    const newComp: Company = {
      id,
      name: compData.name || 'New Carrier LLC',
      mc_number: compData.mc_number || '',
      dot_number: compData.dot_number || '',
      contact_name: compData.contact_name || '',
      contact_phone: compData.contact_phone || '',
      contact_email: compData.contact_email || '',
      address: compData.address || '',
      commission_percent: compData.commission_percent || 10.0,
      billing_cadence: compData.billing_cadence || 'weekly',
      notes: compData.notes || '',
      created_at: new Date().toISOString(),
    };
    setCompanies((prev) => [...prev, newComp]);
    try {
      await supabase.from('tms_companies').insert([newComp]);
    } catch {
      // Continue locally
    }
    return newComp;
  };

  const updateCompany = async (id: string, updates: Partial<Company>): Promise<Company | null> => {
    let updated: Company | null = null;
    setCompanies((prev) =>
      prev.map((c) => {
        if (c.id === id) {
          updated = { ...c, ...updates };
          return updated;
        }
        return c;
      })
    );
    try {
      await supabase.from('tms_companies').update(updates).eq('id', id);
    } catch {
      // Continue locally
    }
    return updated;
  };

  // Invoice Actions
  const createInvoice = async (invoiceData: Partial<Invoice>, loadIds: string[] = []): Promise<Invoice> => {
    const id = `inv-${Date.now()}`;
    const targetCompId = invoiceData.company_id || (selectedCompanyId !== 'all' ? selectedCompanyId : companies[0]?.id);
    const comp = companies.find((c) => c.id === targetCompId);

    const newInvoice: Invoice = {
      id,
      company_id: targetCompId || null,
      invoice_number: invoiceData.invoice_number || `INV-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`,
      period_start: invoiceData.period_start || new Date().toISOString().split('T')[0],
      period_end: invoiceData.period_end || new Date().toISOString().split('T')[0],
      due_date: invoiceData.due_date || new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
      status: invoiceData.status || 'draft',
      total_gross: Number(invoiceData.total_gross || 0),
      total_commission: Number(invoiceData.total_commission || 0),
      notes: invoiceData.notes || 'Dispatch commission invoice.',
      created_at: new Date().toISOString(),
      company_name: comp?.name || 'Carrier Client',
      line_items: invoiceData.line_items || [],
      pdf_url: invoiceData.pdf_url,
    };

    setInvoices((prev) => [newInvoice, ...prev]);

    // Mark included loads as invoiced
    if (loadIds.length > 0) {
      await batchChangeLoadStatus(loadIds, 'invoiced');
    }

    try {
      await supabase.from('tms_invoices').insert([newInvoice]);
    } catch {
      // Continue locally
    }

    return newInvoice;
  };

  const updateInvoiceStatus = async (id: string, status: InvoiceStatus): Promise<Invoice | null> => {
    let updated: Invoice | null = null;
    setInvoices((prev) =>
      prev.map((i) => {
        if (i.id === id) {
          updated = { ...i, status };
          return updated;
        }
        return i;
      })
    );
    try {
      await supabase.from('tms_invoices').update({ status }).eq('id', id);
    } catch {
      // Continue locally
    }
    return updated;
  };

  return (
    <AppContext.Provider
      value={{
        companies,
        selectedCompanyId,
        setSelectedCompanyId,
        activeCompany,
        loads,
        scopedLoads,
        drivers,
        scopedDrivers,
        trucks,
        scopedTrucks,
        invoices,
        scopedInvoices,
        addLoad,
        updateLoad,
        deleteLoad,
        batchChangeLoadStatus,
        addDriver,
        updateDriver,
        addTruck,
        updateTruck,
        addCompany,
        updateCompany,
        createInvoice,
        updateInvoiceStatus,
        isOnline,
        refreshData,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
