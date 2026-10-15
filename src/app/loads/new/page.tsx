'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/lib/data/AppContext';
import { RateConScanner } from '@/components/loads/RateConScanner';
import { MapboxRoutePreview } from '@/components/loads/MapboxRoutePreview';
import { ExtractedRateCon, Load, LoadStop, RouteLeg } from '@/types';
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
  Clock,
  ShieldAlert,
  Thermometer,
  Layers,
  FileCheck,
} from 'lucide-react';
import Link from 'next/link';
import { estimateCityDistanceMiles } from '@/lib/mapbox/routing';

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
  const [brokerMc, setBrokerMc] = useState('');

  const [originCity, setOriginCity] = useState('');
  const [originState, setOriginState] = useState('');
  const [originAddress, setOriginAddress] = useState('');
  const [originZip, setOriginZip] = useState('');
  const [pickupDate, setPickupDate] = useState(new Date().toISOString().split('T')[0]);
  const [pickupTime, setPickupTime] = useState('');

  const [destinationCity, setDestinationCity] = useState('');
  const [destinationState, setDestinationState] = useState('');
  const [destinationAddress, setDestinationAddress] = useState('');
  const [destinationZip, setDestinationZip] = useState('');
  const [deliveryDate, setDeliveryDate] = useState(new Date().toISOString().split('T')[0]);
  const [deliveryTime, setDeliveryTime] = useState('');

  const [grossAmount, setGrossAmount] = useState<number>(0);
  const [linehaulAmount, setLinehaulAmount] = useState<number>(0);
  const [fuelSurcharge, setFuelSurcharge] = useState<number>(0);

  const [loadedMiles, setLoadedMiles] = useState<number>(0);
  const [deadheadMiles, setDeadheadMiles] = useState<number>(0);
  const [totalMiles, setTotalMiles] = useState<number>(0);
  const [ratePerMile, setRatePerMile] = useState<number>(0);

  const [weightLbs, setWeightLbs] = useState<number | undefined>(undefined);
  const [commodities, setCommodities] = useState('');
  const [equipmentType, setEquipmentType] = useState('53ft Dry Van');
  const [temperature, setTemperature] = useState('');
  const [detentionTerms, setDetentionTerms] = useState('');
  const [tonuTerms, setTonuTerms] = useState('');
  const [brokerNotes, setBrokerNotes] = useState('');

  const [driverId, setDriverId] = useState('');
  const [truckId, setTruckId] = useState('');
  const [customTruckLocation, setCustomTruckLocation] = useState('');
  const [status, setStatus] = useState<any>('booked');

  const [stops, setStops] = useState<LoadStop[]>([]);
  const [legs, setLegs] = useState<RouteLeg[]>([]);
  const [routeGeometry, setRouteGeometry] = useState<any>(null);
  const [deadheadGeometry, setDeadheadGeometry] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Get currently selected truck equipment to read its location for Deadhead (DH) calculation
  const selectedTruck = scopedTrucks.find((t) => t.id === truckId);
  const effectiveTruckLocation = customTruckLocation || selectedTruck?.current_location || '';

  // Trigger high-precision server-side Mapbox route & deadhead recalculation
  const recalculateTrip = async (truckLocOverride?: string, newStops?: LoadStop[]) => {
    const truckLoc = truckLocOverride !== undefined ? truckLocOverride : effectiveTruckLocation;
    const activeStops = newStops || stops;

    try {
      const res = await fetch('/api/mapbox/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stops: activeStops.length > 0 ? activeStops : undefined,
          originCityState: originCity ? `${originCity}, ${originState}` : undefined,
          destCityState: destinationCity ? `${destinationCity}, ${destinationState}` : undefined,
          truckLocation: truckLoc || null,
        }),
      });

      if (res.ok) {
        const json = await res.json();
        if (json.data) {
          const d = json.data;
          setLoadedMiles(d.loadedMiles);
          setDeadheadMiles(d.deadheadMiles);
          setTotalMiles(d.totalMiles);
          setRouteGeometry(d.loadedGeometry);
          setDeadheadGeometry(d.deadheadGeometry);
          if (d.legs) setLegs(d.legs);
          if (d.stops) setStops(d.stops);
          if (grossAmount > 0 && d.loadedMiles > 0) {
            setRatePerMile(Math.round((grossAmount / d.loadedMiles) * 100) / 100);
          }
        }
      }
    } catch (e) {
      console.warn('Mapbox route calculation error:', e);
    }
  };

  // Recalculate deadhead when assigned truck or truck location changes
  useEffect(() => {
    if (effectiveTruckLocation && (originCity || stops.length > 0)) {
      recalculateTrip(effectiveTruckLocation);
    }
  }, [truckId, customTruckLocation]);

  // When RateConScanner extracts fields via DeepSeek AI
  const handleExtracted = (data: ExtractedRateCon) => {
    if (data.broker_name) setBrokerName(data.broker_name);
    if (data.broker_contact) setBrokerContact(data.broker_contact);
    if (data.broker_phone) setBrokerPhone(data.broker_phone);
    if (data.broker_email) setBrokerEmail(data.broker_email);
    if (data.broker_mc) setBrokerMc(data.broker_mc);
    if (data.load_number) setLoadNumber(data.load_number);
    if (data.rate_con_number) setRateConNumber(data.rate_con_number);

    if (data.origin_city) setOriginCity(data.origin_city);
    if (data.origin_state) setOriginState(data.origin_state);
    if (data.origin_address) setOriginAddress(data.origin_address);
    if (data.origin_zip) setOriginZip(data.origin_zip);
    if (data.pickup_date) setPickupDate(data.pickup_date);
    if (data.pickup_time) setPickupTime(data.pickup_time);

    if (data.destination_city) setDestinationCity(data.destination_city);
    if (data.destination_state) setDestinationState(data.destination_state);
    if (data.destination_address) setDestinationAddress(data.destination_address);
    if (data.destination_zip) setDestinationZip(data.destination_zip);
    if (data.delivery_date) setDeliveryDate(data.delivery_date);
    if (data.delivery_time) setDeliveryTime(data.delivery_time);

    if (data.gross_amount) setGrossAmount(data.gross_amount);
    if (data.linehaul_amount) setLinehaulAmount(data.linehaul_amount);
    if (data.fuel_surcharge) setFuelSurcharge(data.fuel_surcharge);

    if (data.loaded_miles) setLoadedMiles(data.loaded_miles);
    if (data.deadhead_miles !== undefined) setDeadheadMiles(data.deadhead_miles);
    if (data.total_miles) setTotalMiles(data.total_miles);
    if (data.rate_per_mile) setRatePerMile(data.rate_per_mile);

    if (data.weight_lbs) setWeightLbs(data.weight_lbs);
    if (data.commodities) setCommodities(data.commodities);
    if (data.equipment_type) setEquipmentType(data.equipment_type);
    if (data.temperature) setTemperature(data.temperature);
    if (data.detention_terms) setDetentionTerms(data.detention_terms);
    if (data.tonu_terms) setTonuTerms(data.tonu_terms);
    if (data.notes) setBrokerNotes(data.notes);
    if (data.stops && data.stops.length > 0) setStops(data.stops);
    if (data.legs && data.legs.length > 0) setLegs(data.legs);
    if (data.route_geometry) setRouteGeometry(data.route_geometry);
    if (data.deadhead_geometry) setDeadheadGeometry(data.deadhead_geometry);
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
        rate_con_number: rateConNumber || loadNumber,
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
        deadhead_miles: Number(deadheadMiles),
        loaded_miles: Number(loadedMiles || totalMiles),
        total_miles: Number(totalMiles || loadedMiles),
        rate_per_mile: Number(ratePerMile || (grossAmount && loadedMiles ? grossAmount / loadedMiles : 0)),
        weight_lbs: weightLbs,
        broker_notes: brokerNotes,
        driver_id: driverId || null,
        truck_id: truckId || null,
        stops:
          stops.length > 0
            ? stops
            : [
                {
                  id: 'stop-1',
                  stop_number: 1,
                  type: 'pickup',
                  city: originCity,
                  state: originState,
                  address: originAddress,
                  date: pickupDate,
                  appointment_time: pickupTime || '08:00 AM',
                  status: 'ready',
                },
                {
                  id: 'stop-2',
                  stop_number: 2,
                  type: 'delivery',
                  city: destinationCity,
                  state: destinationState,
                  address: destinationAddress,
                  date: deliveryDate,
                  appointment_time: deliveryTime || '10:00 AM',
                  status: 'pending',
                },
              ],
      });

      router.push('/loads');
    } catch (err) {
      console.error('Failed to book load:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Preview Load object for live Mapbox route
  const previewLoad = useMemo<any>(
    () => ({
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
      broker_contact: brokerContact,
      rate_con_number: rateConNumber,
      deadhead_miles: deadheadMiles,
      loaded_miles: loadedMiles || totalMiles,
      total_miles: totalMiles || loadedMiles,
      rate_per_mile: ratePerMile || (grossAmount && loadedMiles ? grossAmount / loadedMiles : 0),
      stops: stops,
      legs: legs,
      route_geometry: routeGeometry,
      deadhead_geometry: deadheadGeometry,
      created_at: '',
      updated_at: '',
    }),
    [
      companyId,
      driverId,
      truckId,
      loadNumber,
      originCity,
      originState,
      destinationCity,
      destinationState,
      pickupDate,
      deliveryDate,
      grossAmount,
      brokerName,
      brokerContact,
      rateConNumber,
      deadheadMiles,
      loadedMiles,
      totalMiles,
      ratePerMile,
      stops,
      legs,
      routeGeometry,
      deadheadGeometry,
    ]
  );

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
              Import US Broker Rate Confirmation or input load specifications manually
            </p>
          </div>
        </div>
      </div>

      {/* Tractor & Driver Pre-Assignment Bar for Live Deadhead (DH) Calculation */}
      <div className="tms-card p-3.5 bg-card flex flex-wrap items-center justify-between gap-3 text-xs border border-border">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20 flex items-center justify-center shrink-0">
            <Truck className="h-4 w-4" />
          </div>
          <div>
            <span className="font-semibold text-text-main text-xs block">
              Assign Tractor Equipment for Live Deadhead (DH)
            </span>
            <span className="text-[11px] text-text-muted">
              Mapbox computes real highway deadhead miles and route from equipment origin to Stop 1
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={truckId}
            onChange={(e) => {
              const val = e.target.value;
              setTruckId(val);
              const found = scopedTrucks.find((t) => t.id === val);
              if (found?.assigned_driver_id && !driverId) {
                setDriverId(found.assigned_driver_id);
              }
            }}
            className="tms-input py-1.5 text-xs w-auto min-w-[210px] font-semibold"
          >
            <option value="">-- Select Tractor Equipment --</option>
            {scopedTrucks.map((t) => (
              <option key={t.id} value={t.id}>
                Unit {t.unit_number} ({t.trailer_type} • {t.current_location || 'Loc Pending'})
              </option>
            ))}
          </select>

          <input
            type="text"
            value={customTruckLocation}
            onChange={(e) => setCustomTruckLocation(e.target.value)}
            placeholder="Or custom location (e.g. Dallas, TX)"
            className="tms-input py-1.5 text-xs w-48 font-medium"
          />
        </div>
      </div>

      {/* 1. Rate Confirmation Document Scanner with DeepSeek AI */}
      <RateConScanner
        onExtracted={handleExtracted}
        truckLocation={effectiveTruckLocation}
      />

      {/* 2. Main Booking Form */}
      <form onSubmit={handleSubmit} className="space-y-6 text-xs">
        {/* Carrier & Numbers */}
        <div className="tms-card p-5 space-y-4">
          <h3 className="text-sm font-bold uppercase tracking-wider text-text-main border-b border-border pb-2 flex items-center justify-between">
            <span>1. Carrier Assignment & Reference Numbers</span>
            <span className="text-xs font-mono font-normal text-text-muted">
              {companies.find((c) => c.id === companyId)?.name}
            </span>
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
              <label className="block font-semibold text-text-main mb-1">Broker Load / PO #</label>
              <input
                type="text"
                required
                value={loadNumber}
                onChange={(e) => setLoadNumber(e.target.value)}
                className="tms-input font-bold"
              />
            </div>
            <div>
              <label className="block font-semibold text-text-main mb-1">Rate Con Reference #</label>
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

        {/* Lane Origins & Destinations */}
        <div className="tms-card p-5 space-y-4">
          <h3 className="text-sm font-bold uppercase tracking-wider text-text-main border-b border-border pb-2">
            2. Lane Origins, Stops & Mapbox Routing
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
                    className="tms-input font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-text-muted mb-0.5">State</label>
                  <input
                    type="text"
                    required
                    maxLength={2}
                    value={originState}
                    onChange={(e) => setOriginState(e.target.value.toUpperCase())}
                    placeholder="IL"
                    className="tms-input font-semibold uppercase"
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
                  <label className="block text-[11px] text-text-muted mb-0.5">Appt Time / Window</label>
                  <input
                    type="text"
                    value={pickupTime}
                    onChange={(e) => setPickupTime(e.target.value)}
                    placeholder="08:00 AM or FCFS"
                    className="tms-input"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] text-text-muted mb-0.5">Address (Facility Street)</label>
                <input
                  type="text"
                  value={originAddress}
                  onChange={(e) => setOriginAddress(e.target.value)}
                  placeholder="Facility street address"
                  className="tms-input"
                />
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
                    placeholder="Charlotte"
                    className="tms-input font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-text-muted mb-0.5">State</label>
                  <input
                    type="text"
                    required
                    maxLength={2}
                    value={destinationState}
                    onChange={(e) => setDestinationState(e.target.value.toUpperCase())}
                    placeholder="NC"
                    className="tms-input font-semibold uppercase"
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
                  <label className="block text-[11px] text-text-muted mb-0.5">Appt Time / Window</label>
                  <input
                    type="text"
                    value={deliveryTime}
                    onChange={(e) => setDeliveryTime(e.target.value)}
                    placeholder="10:00 AM Strict"
                    className="tms-input"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] text-text-muted mb-0.5">Address (Facility Street)</label>
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

          {/* Multi-Stop Sequence Timeline with Mapbox Leg Miles */}
          {stops.length > 0 && (
            <div className="mt-4 p-4 rounded-xl border border-border bg-card space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-text-main text-xs uppercase tracking-wider flex items-center gap-2">
                  <Layers className="h-3.5 w-3.5 text-brand-500" />
                  <span>Stops Schedule ({stops.length} Milestones Extracted)</span>
                </span>
                <span className="text-[11px] text-text-muted font-mono">
                  Multi-Stop Highway Routing via Mapbox
                </span>
              </div>

              {/* Deadhead Banner before Stop 1 (if tractor origin is set) */}
              {effectiveTruckLocation && (
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-400 text-xs">
                  <div className="flex items-center gap-2">
                    <Truck className="h-4 w-4 shrink-0" />
                    <div>
                      <span className="font-semibold text-text-main">
                        Equipment Origin: {selectedTruck ? `Unit ${selectedTruck.unit_number} • ` : ''}{effectiveTruckLocation}
                      </span>
                      <span className="text-[11px] text-text-muted block">
                        Transit to first pickup ({stops[0]?.city}, {stops[0]?.state})
                      </span>
                    </div>
                  </div>
                  <div className="text-right font-mono">
                    <span className="text-xs font-bold text-purple-400">
                      +{deadheadMiles} mi DH
                    </span>
                    <span className="text-[10px] text-text-muted block">
                      ~{Math.round((deadheadMiles / 55) * 10) / 10}h transit
                    </span>
                  </div>
                </div>
              )}

              <div className="space-y-1">
                {stops.map((stop, i) => {
                  const isPickup = stop.type === 'pickup' || i === 0;
                  const isFinal = i === stops.length - 1 && !isPickup;
                  const isIntermediate = !isPickup && !isFinal;

                  const legMiles =
                    stop.miles_from_previous ||
                    (i > 0 && legs[i - 1]?.distance_miles) ||
                    0;
                  const legDuration =
                    stop.duration_from_previous_minutes ||
                    (i > 0 && legs[i - 1]?.duration_minutes) ||
                    0;
                  const legSummary =
                    stop.leg_summary || (i > 0 && legs[i - 1]?.summary) || '';

                  return (
                    <React.Fragment key={stop.id || i}>
                      {/* Leg Milestone Indicator between consecutive stops */}
                      {i > 0 && (
                        <div className="flex items-center gap-3 py-1 px-3 text-xs">
                          <div className="w-0.5 h-6 bg-border ml-2 mr-1" />
                          <div className="flex flex-wrap items-center gap-2 px-2.5 py-1 rounded bg-card-subtle border border-border/80 text-[11px] font-mono">
                            <span className="text-brand-500 font-bold">
                              ↳ Leg {i}: +{legMiles} mi
                            </span>
                            {legDuration > 0 && (
                              <span className="text-text-muted">
                                (~{Math.round((legDuration / 60) * 10) / 10}h)
                              </span>
                            )}
                            {legSummary && (
                              <span className="text-text-muted text-[10px] italic">
                                via {legSummary}
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Stop Card */}
                      <div className="p-3 rounded-lg border border-border bg-card-subtle flex flex-wrap items-center justify-between gap-3 text-xs hover:border-border/80 transition-all">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-[11px] text-white shadow-sm ${
                              isPickup
                                ? 'bg-emerald-500'
                                : isIntermediate
                                ? 'bg-amber-500'
                                : 'bg-[#F79B4D]'
                            }`}
                          >
                            {stop.stop_number || i + 1}
                          </div>
                          <div>
                            <div className="font-semibold text-text-main flex items-center gap-2">
                              <span>{stop.facility_name || `${stop.city}, ${stop.state}`}</span>
                              <span
                                className={`text-[10px] font-medium uppercase px-1.5 py-0.2 rounded ${
                                  isPickup
                                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                    : isIntermediate
                                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                    : 'bg-brand-500/10 text-brand-400 border border-brand-500/20'
                                }`}
                              >
                                {isPickup ? 'Pickup' : isFinal ? 'Final Delivery' : `Delivery (Drop ${i})`}
                              </span>
                            </div>
                            <div className="text-[11px] text-text-muted mt-0.5">
                              {stop.address ? `${stop.address}, ` : ''}
                              {stop.city}, {stop.state} {stop.zip || ''}
                            </div>
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="font-medium text-text-main flex items-center gap-1 justify-end">
                            <Calendar className="h-3 w-3 text-text-muted" />
                            <span>{stop.date}</span>
                          </div>
                          <div className="text-[11px] text-text-muted mt-0.5">
                            {stop.appointment_time || 'Appt Pending'}
                            {stop.reference_numbers ? ` • Ref: ${stop.reference_numbers}` : ''}
                          </div>
                        </div>
                      </div>
                    </React.Fragment>
                  );
                })}
              </div>

              {/* Total Miles & Mileage Summary Bar */}
              <div className="pt-2 border-t border-border flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-3 font-mono text-[11px]">
                  <span className="text-text-muted">
                    Loaded Route: <strong className="text-text-main">{loadedMiles} mi</strong>
                  </span>
                  {deadheadMiles > 0 && (
                    <span className="text-purple-400">
                      Deadhead: <strong>+{deadheadMiles} mi</strong>
                    </span>
                  )}
                  <span className="text-brand-500 font-bold">
                    Total Trip: {totalMiles} mi
                  </span>
                </div>
                {ratePerMile > 0 && (
                  <span className="font-mono text-emerald-500 font-bold text-xs bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                    ${ratePerMile.toFixed(2)}/mi
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Interactive Mapbox Route Preview with Live Deadhead */}
          <div className="mt-4">
            <MapboxRoutePreview
              load={previewLoad}
              truckOriginCity={effectiveTruckLocation}
            />
          </div>
        </div>

        {/* Financials & Mileage */}
        <div className="tms-card p-5 space-y-4">
          <h3 className="text-sm font-bold uppercase tracking-wider text-text-main border-b border-border pb-2">
            3. Financial Compensation & Mileage Breakdown
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="block font-semibold text-text-main mb-1">Total Gross Rate ($)</label>
              <input
                type="number"
                step="0.01"
                required
                value={grossAmount}
                onChange={(e) => {
                  const val = parseFloat(e.target.value) || 0;
                  setGrossAmount(val);
                  if (loadedMiles > 0) {
                    setRatePerMile(Math.round((val / loadedMiles) * 100) / 100);
                  }
                }}
                className="tms-input font-bold text-emerald-500 text-sm"
              />
            </div>
            <div>
              <label className="block font-semibold text-text-main mb-1">Loaded Miles (Mapbox)</label>
              <input
                type="number"
                value={loadedMiles || totalMiles}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10) || 0;
                  setLoadedMiles(val);
                  setTotalMiles(val + (deadheadMiles || 0));
                  if (grossAmount > 0 && val > 0) {
                    setRatePerMile(Math.round((grossAmount / val) * 100) / 100);
                  }
                }}
                className="tms-input font-bold"
              />
            </div>
            <div>
              <label className="block font-semibold text-text-main mb-1 flex items-center justify-between">
                <span>Deadhead (DH)</span>
                {selectedTruck?.current_location && (
                  <span className="text-[10px] text-purple-400 font-normal">
                    from {selectedTruck.current_location}
                  </span>
                )}
              </label>
              <input
                type="number"
                value={deadheadMiles}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10) || 0;
                  setDeadheadMiles(val);
                  setTotalMiles((loadedMiles || 0) + val);
                }}
                className="tms-input text-purple-400 font-semibold"
              />
            </div>
            <div>
              <label className="block font-semibold text-text-main mb-1">Rate Per Mile (RPM)</label>
              <div className="tms-input bg-card-subtle font-bold text-emerald-500 flex items-center">
                ${ratePerMile.toFixed(2)}/mi
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
            <div>
              <label className="block text-[11px] text-text-muted mb-0.5">Linehaul Amount ($)</label>
              <input
                type="number"
                step="0.01"
                value={linehaulAmount || ''}
                onChange={(e) => setLinehaulAmount(parseFloat(e.target.value) || 0)}
                placeholder="Optional linehaul portion"
                className="tms-input"
              />
            </div>
            <div>
              <label className="block text-[11px] text-text-muted mb-0.5">Fuel Surcharge (FSC) ($)</label>
              <input
                type="number"
                step="0.01"
                value={fuelSurcharge || ''}
                onChange={(e) => setFuelSurcharge(parseFloat(e.target.value) || 0)}
                placeholder="Optional separate FSC"
                className="tms-input"
              />
            </div>
            <div>
              <label className="block text-[11px] text-text-muted mb-0.5">Load Initial Status</label>
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
        </div>

        {/* Equipment & Cargo Specifications */}
        <div className="tms-card p-5 space-y-4">
          <h3 className="text-sm font-bold uppercase tracking-wider text-text-main border-b border-border pb-2">
            4. Equipment Requirements & Cargo Specifications
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="block font-semibold text-text-main mb-1">Equipment Type</label>
              <input
                type="text"
                value={equipmentType}
                onChange={(e) => setEquipmentType(e.target.value)}
                placeholder="53ft Dry Van / Reefer"
                className="tms-input font-semibold"
              />
            </div>
            <div>
              <label className="block font-semibold text-text-main mb-1">Cargo Weight (lbs)</label>
              <input
                type="number"
                value={weightLbs || ''}
                onChange={(e) => setWeightLbs(parseInt(e.target.value, 10) || undefined)}
                placeholder="e.g. 42000"
                className="tms-input font-semibold"
              />
            </div>
            <div>
              <label className="block font-semibold text-text-main mb-1">Reefer Temperature</label>
              <input
                type="text"
                value={temperature}
                onChange={(e) => setTemperature(e.target.value)}
                placeholder="-10F Continuous / N/A"
                className="tms-input"
              />
            </div>
            <div>
              <label className="block font-semibold text-text-main mb-1">Commodity</label>
              <input
                type="text"
                value={commodities}
                onChange={(e) => setCommodities(e.target.value)}
                placeholder="Packaging, Beverages, etc."
                className="tms-input"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div>
              <label className="block text-[11px] text-text-muted mb-0.5">Detention Terms</label>
              <input
                type="text"
                value={detentionTerms}
                onChange={(e) => setDetentionTerms(e.target.value)}
                placeholder="$50/hr after 2 hrs free time"
                className="tms-input"
              />
            </div>
            <div>
              <label className="block text-[11px] text-text-muted mb-0.5">TONU Fee Terms</label>
              <input
                type="text"
                value={tonuTerms}
                onChange={(e) => setTonuTerms(e.target.value)}
                placeholder="$150 TONU if canceled"
                className="tms-input"
              />
            </div>
          </div>
        </div>

        {/* Broker Details & Equipment Assignment */}
        <div className="tms-card p-5 space-y-4">
          <h3 className="text-sm font-bold uppercase tracking-wider text-text-main border-b border-border pb-2">
            5. Broker Contacts & Dispatch Assignments
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="block font-semibold text-text-main mb-1">Brokerage Name</label>
              <input
                type="text"
                required
                value={brokerName}
                onChange={(e) => setBrokerName(e.target.value)}
                placeholder="e.g. Total Quality Logistics"
                className="tms-input font-semibold"
              />
            </div>
            <div>
              <label className="block font-semibold text-text-main mb-1">Broker MC #</label>
              <input
                type="text"
                value={brokerMc}
                onChange={(e) => setBrokerMc(e.target.value)}
                placeholder="MC-000000"
                className="tms-input"
              />
            </div>
            <div>
              <label className="block font-semibold text-text-main mb-1">Broker Agent / Contact</label>
              <input
                type="text"
                value={brokerContact}
                onChange={(e) => setBrokerContact(e.target.value)}
                placeholder="Marcus Brody"
                className="tms-input"
              />
            </div>
            <div>
              <label className="block font-semibold text-text-main mb-1">Broker Phone</label>
              <input
                type="text"
                value={brokerPhone}
                onChange={(e) => setBrokerPhone(e.target.value)}
                placeholder="(800) 000-0000 ext. 12"
                className="tms-input"
              />
            </div>
          </div>

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
                    {t.unit_number} ({t.trailer_type}) — Located in {t.current_location || 'Terminal'}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-text-main mb-1">
              Broker Instructions & Special Notes
            </label>
            <textarea
              rows={3}
              value={brokerNotes}
              onChange={(e) => setBrokerNotes(e.target.value)}
              placeholder="Tracking via MacroPoint/Trucker Tools, 2 load locks, hard hat, safety glasses, appointment check-in policies..."
              className="tms-input font-mono text-[11px]"
            />
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
            className="btn-primary text-xs py-2 px-6 shadow-md flex items-center gap-2"
          >
            <Save className="h-4 w-4" />
            <span>{isSubmitting ? 'Booking Load...' : 'Confirm & Book Load'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
