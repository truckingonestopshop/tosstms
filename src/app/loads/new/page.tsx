'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/lib/data/AppContext';
import { RateConScanner } from '@/components/loads/RateConScanner';
import { MapboxRoutePreview } from '@/components/loads/MapboxRoutePreview';
import { ExtractedRateCon, Load, LoadStop } from '@/types';
import {
  Truck,
  Building,
  DollarSign,
  Calendar,
  MapPin,
  User,
  Save,
  ArrowLeft,
  CheckCircle2,
} from 'lucide-react';
import Link from 'next/link';

export default function NewLoadPage() {
  const router = useRouter();
  const { addLoad, companies, activeCompany, scopedDrivers, scopedTrucks } = useApp();

  const [companyId, setCompanyId] = useState<string>(
    activeCompany?.id || companies[0]?.id || 'comp-001'
  );
  const [loadNumber, setLoadNumber] = useState(`TOSS-${Math.floor(1000 + Math.random() * 9000)}`);
  const [rateConNumber, setRateConNumber] = useState('');
  const [brokerName, setBrokerName] = useState('');
  const [brokerContact, setBrokerContact] = useState('');
  const [brokerPhone, setBrokerPhone] = useState('');
  const [brokerEmail, setBrokerEmail] = useState('');

  const [originCity, setOriginCity] = useState('');
  const [originState, setOriginState] = useState('');
  const [originAddress, setOriginAddress] = useState('');
  const [pickupDate, setPickupDate] = useState(new Date().toISOString().split('T')[0]);

  const [destinationCity, setDestinationCity] = useState('');
  const [destinationState, setDestinationState] = useState('');
  const [destinationAddress, setDestinationAddress] = useState('');
  const [deliveryDate, setDeliveryDate] = useState(new Date().toISOString().split('T')[0]);

  const [grossAmount, setGrossAmount] = useState<number>(0);
  const [totalMiles, setTotalMiles] = useState<number>(0);
  const [weightLbs, setWeightLbs] = useState<number | undefined>(undefined);
  const [commodities, setCommodities] = useState('');
  const [brokerNotes, setBrokerNotes] = useState('');

  const [driverId, setDriverId] = useState('');
  const [truckId, setTruckId] = useState('');
  const [status, setStatus] = useState<any>('booked');

  const [stops, setStops] = useState<LoadStop[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // When RateConScanner extracts fields
  const handleExtracted = (data: ExtractedRateCon) => {
    if (data.broker_name) setBrokerName(data.broker_name);
    if (data.broker_contact) setBrokerContact(data.broker_contact);
    if (data.broker_phone) setBrokerPhone(data.broker_phone);
    if (data.broker_email) setBrokerEmail(data.broker_email);
    if (data.load_number) setLoadNumber(data.load_number);
    if (data.rate_con_number) setRateConNumber(data.rate_con_number);

    if (data.origin_city) setOriginCity(data.origin_city);
    if (data.origin_state) setOriginState(data.origin_state);
    if (data.origin_address) setOriginAddress(data.origin_address);
    if (data.pickup_date) setPickupDate(data.pickup_date);

    if (data.destination_city) setDestinationCity(data.destination_city);
    if (data.destination_state) setDestinationState(data.destination_state);
    if (data.destination_address) setDestinationAddress(data.destination_address);
    if (data.delivery_date) setDeliveryDate(data.delivery_date);

    if (data.gross_amount) setGrossAmount(data.gross_amount);
    if (data.total_miles) setTotalMiles(data.total_miles);
    if (data.weight_lbs) setWeightLbs(data.weight_lbs);
    if (data.commodities) setCommodities(data.commodities);
    if (data.notes) setBrokerNotes(data.notes);
    if (data.stops) setStops(data.stops);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const targetComp = companies.find((c) => c.id === companyId);
      const cutPercent = targetComp?.commission_percent ?? 10.0;
      const dispatcherCut = (grossAmount * cutPercent) / 100;

      await addLoad({
        company_id: companyId,
        load_number: loadNumber,
        rate_con_number: rateConNumber,
        broker_name: brokerName,
        broker_contact: brokerContact,
        broker_phone: brokerPhone,
        broker_email: brokerEmail,
        origin_city: originCity,
        origin_state: originState,
        destination_city: destinationCity,
        destination_state: destinationState,
        pickup_date: pickupDate,
        delivery_date: deliveryDate,
        gross_amount: Number(grossAmount),
        dispatcher_cut: dispatcherCut,
        status,
        total_miles: Number(totalMiles),
        weight_lbs: weightLbs,
        broker_notes: brokerNotes,
        driver_id: driverId || null,
        truck_id: truckId || null,
        stops,
      });

      router.push('/loads');
    } catch (err) {
      console.error('Failed to book load:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Preview Load object for live Mapbox route
  const previewLoad: Load = {
    id: 'preview',
    company_id: companyId,
    driver_id: driverId,
    truck_id: truckId,
    load_number: loadNumber,
    origin_city: originCity || 'Chicago',
    origin_state: originState || 'IL',
    destination_city: destinationCity || 'Atlanta',
    destination_state: destinationState || 'GA',
    pickup_date: pickupDate,
    delivery_date: deliveryDate,
    gross_amount: grossAmount,
    dispatcher_cut: 0,
    status: 'booked',
    broker_name: brokerName || 'Broker',
    broker_contact: '',
    rate_con_number: rateConNumber,
    total_miles: totalMiles,
    rate_per_mile: grossAmount && totalMiles ? grossAmount / totalMiles : 0,
    created_at: '',
    updated_at: '',
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <Link
            href="/loads"
            className="p-1.5 rounded-lg border border-border bg-card text-text-muted hover:text-text-main"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-text-main">
              Book Freight Load
            </h1>
            <p className="text-xs text-text-muted">
              Import broker confirmation document or manually input lane & equipment details
            </p>
          </div>
        </div>
      </div>

      {/* 1. Rate Confirmation Document Scanner */}
      <RateConScanner onExtracted={handleExtracted} />

      {/* 2. Main Booking Form */}
      <form onSubmit={handleSubmit} className="space-y-6 text-xs">
        {/* Carrier & Numbers */}
        <div className="tms-card p-5 space-y-4">
          <h3 className="text-sm font-bold uppercase tracking-wider text-text-main border-b border-border pb-2">
            1. Carrier Assignment & Reference Numbers
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block font-semibold text-text-main mb-1">Carrier Entity</label>
              <select
                value={companyId}
                onChange={(e) => setCompanyId(e.target.value)}
                className="tms-input"
                required
              >
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.mc_number} • {c.commission_percent}% Cut)
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-text-main mb-1">Load Order #</label>
              <input
                type="text"
                required
                value={loadNumber}
                onChange={(e) => setLoadNumber(e.target.value)}
                className="tms-input"
              />
            </div>
            <div>
              <label className="block font-semibold text-text-main mb-1">Rate Con Ref #</label>
              <input
                type="text"
                value={rateConNumber}
                onChange={(e) => setRateConNumber(e.target.value)}
                placeholder="e.g. RC-991204"
                className="tms-input"
              />
            </div>
          </div>
        </div>

        {/* Lane Origin & Destination */}
        <div className="tms-card p-5 space-y-4">
          <h3 className="text-sm font-bold uppercase tracking-wider text-text-main border-b border-border pb-2">
            2. Lane Origins, Stops & Appointments
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Origin Shipper */}
            <div className="p-3.5 rounded-xl border border-border bg-card-subtle space-y-2">
              <span className="font-bold text-emerald-500 block uppercase text-[10px] tracking-wider">
                Pickup Origin (Shipper)
              </span>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="block text-[11px] text-text-muted mb-0.5">City</label>
                  <input
                    type="text"
                    required
                    value={originCity}
                    onChange={(e) => setOriginCity(e.target.value)}
                    placeholder="Chicago"
                    className="tms-input"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-text-muted mb-0.5">State</label>
                  <input
                    type="text"
                    required
                    value={originState}
                    onChange={(e) => setOriginState(e.target.value)}
                    placeholder="IL"
                    className="tms-input"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-text-muted mb-0.5">Pickup Date</label>
                  <input
                    type="date"
                    required
                    value={pickupDate}
                    onChange={(e) => setPickupDate(e.target.value)}
                    className="tms-input"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-text-muted mb-0.5">Address (optional)</label>
                  <input
                    type="text"
                    value={originAddress}
                    onChange={(e) => setOriginAddress(e.target.value)}
                    placeholder="Facility street address"
                    className="tms-input"
                  />
                </div>
              </div>
            </div>

            {/* Destination Receiver */}
            <div className="p-3.5 rounded-xl border border-border bg-card-subtle space-y-2">
              <span className="font-bold text-brand-500 block uppercase text-[10px] tracking-wider">
                Delivery Destination (Receiver)
              </span>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="block text-[11px] text-text-muted mb-0.5">City</label>
                  <input
                    type="text"
                    required
                    value={destinationCity}
                    onChange={(e) => setDestinationCity(e.target.value)}
                    placeholder="Atlanta"
                    className="tms-input"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-text-muted mb-0.5">State</label>
                  <input
                    type="text"
                    required
                    value={destinationState}
                    onChange={(e) => setDestinationState(e.target.value)}
                    placeholder="GA"
                    className="tms-input"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-text-muted mb-0.5">Delivery Date</label>
                  <input
                    type="date"
                    required
                    value={deliveryDate}
                    onChange={(e) => setDeliveryDate(e.target.value)}
                    className="tms-input"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-text-muted mb-0.5">Address (optional)</label>
                  <input
                    type="text"
                    value={destinationAddress}
                    onChange={(e) => setDestinationAddress(e.target.value)}
                    placeholder="Facility street address"
                    className="tms-input"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Mapbox Route Preview */}
          <div className="mt-4">
            <MapboxRoutePreview load={previewLoad} />
          </div>
        </div>

        {/* Financials & Broker Details */}
        <div className="tms-card p-5 space-y-4">
          <h3 className="text-sm font-bold uppercase tracking-wider text-text-main border-b border-border pb-2">
            3. Financials, Broker & Equipment Assignment
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block font-semibold text-text-main mb-1">Gross Freight Amount ($)</label>
              <input
                type="number"
                step="0.01"
                required
                value={grossAmount}
                onChange={(e) => setGrossAmount(parseFloat(e.target.value) || 0)}
                className="tms-input font-bold text-emerald-500"
              />
            </div>
            <div>
              <label className="block font-semibold text-text-main mb-1">Total Miles</label>
              <input
                type="number"
                value={totalMiles}
                onChange={(e) => setTotalMiles(parseInt(e.target.value, 10) || 0)}
                className="tms-input"
              />
            </div>
            <div>
              <label className="block font-semibold text-text-main mb-1">Initial Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="tms-input font-semibold"
              >
                <option value="booked">Booked</option>
                <option value="in_transit">In Transit</option>
                <option value="delivered">Delivered</option>
              </select>
            </div>
          </div>

          {/* Broker Details */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
            <div>
              <label className="block font-semibold text-text-main mb-1">Broker Company Name</label>
              <input
                type="text"
                required
                value={brokerName}
                onChange={(e) => setBrokerName(e.target.value)}
                placeholder="e.g. Echo Global Logistics"
                className="tms-input"
              />
            </div>
            <div>
              <label className="block font-semibold text-text-main mb-1">Broker Phone</label>
              <input
                type="text"
                value={brokerPhone}
                onChange={(e) => setBrokerPhone(e.target.value)}
                placeholder="(800) 000-0000"
                className="tms-input"
              />
            </div>
            <div>
              <label className="block font-semibold text-text-main mb-1">Broker Contact Email</label>
              <input
                type="email"
                value={brokerEmail}
                onChange={(e) => setBrokerEmail(e.target.value)}
                placeholder="broker@logistics.com"
                className="tms-input"
              />
            </div>
          </div>

          {/* Driver & Tractor */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <div>
              <label className="block font-semibold text-text-main mb-1">Assign Driver</label>
              <select
                value={driverId}
                onChange={(e) => setDriverId(e.target.value)}
                className="tms-input"
              >
                <option value="">Unassigned</option>
                {scopedDrivers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.phone})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-text-main mb-1">Assign Tractor Unit</label>
              <select
                value={truckId}
                onChange={(e) => setTruckId(e.target.value)}
                className="tms-input"
              >
                <option value="">Unassigned</option>
                {scopedTrucks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.unit_number} ({t.trailer_type})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Submit Bar */}
        <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
          <Link href="/loads" className="btn-secondary text-xs py-2 px-4">
            Cancel
          </Link>
          <button
            type="submit"
            disabled={isSubmitting}
            className="btn-primary text-xs py-2 px-6 shadow-md"
          >
            <Save className="h-4 w-4" />
            <span>{isSubmitting ? 'Booking Load...' : 'Confirm & Book Load'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
