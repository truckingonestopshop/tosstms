-- ==============================================================================
-- TOSS TMS — Seed Data
-- ==============================================================================

-- 1. Insert Initial Carriers
INSERT INTO public.tms_companies (id, name, mc_number, dot_number, contact_name, contact_phone, contact_email, address, commission_percent, billing_cadence)
VALUES 
  ('comp-001', 'Ironclad Express LLC', 'MC-1102934', '3490123', 'Marcus Vance', '(312) 555-0192', 'dispatch@ironcladexpress.com', '1240 S Michigan Ave, Chicago, IL 60605', 10.00, 'weekly'),
  ('comp-002', 'Apex Hauling Co', 'MC-992341', '3129840', 'Elena Rostova', '(214) 555-7821', 'operations@apexhauling.com', '4500 Lyndon B Johnson Fwy, Dallas, TX 75244', 8.50, 'weekly'),
  ('comp-003', 'Lone Star Freight Logistics', 'MC-149204', '2891045', 'David Miller', '(713) 555-4491', 'david@lonestarfreight.com', '1001 McKinney St, Houston, TX 77002', 10.00, 'monthly')
ON CONFLICT (id) DO NOTHING;

-- 2. Insert Drivers
INSERT INTO public.tms_drivers (id, company_id, name, phone, email, cdl_number, cdl_expiry, medical_card_expiry)
VALUES
  ('driv-001', 'comp-001', 'James Hawkins', '(312) 555-9012', 'j.hawkins@ironclad.com', 'IL-88492019', '2027-04-15', '2027-01-20'),
  ('driv-002', 'comp-001', 'Tyrone Jackson', '(312) 555-9013', 't.jackson@ironclad.com', 'IL-99401293', '2026-11-01', '2026-12-15'),
  ('driv-003', 'comp-002', 'Viktor Krum', '(214) 555-8812', 'vkrum@apexhauling.com', 'TX-77381920', '2028-06-30', '2027-03-10'),
  ('driv-004', 'comp-003', 'Carlos Ramirez', '(713) 555-3319', 'carlos@lonestar.com', 'TX-11928374', '2027-09-12', '2026-11-28')
ON CONFLICT (id) DO NOTHING;

-- 3. Insert Equipment
INSERT INTO public.tms_trucks (id, company_id, unit_number, trailer_number, plate, vin_number, trailer_type, trailer_length, max_weight, door_type, suspension, assigned_driver_id, current_location, empty_date)
VALUES
  ('trk-001', 'comp-001', 'Unit 101', 'TR-5301', 'P-88192', '1FUJA6CV7CL192834', '53ft Dry Van', '53 ft', 45000, 'Swing', 'Air Ride', 'driv-001', 'Chicago, IL', 'Ready Now'),
  ('trk-002', 'comp-001', 'Unit 102', 'TR-5302', 'P-88193', '1FUJA6CV7CL192835', '53ft Utility Reefer', '53 ft', 44000, 'Swing', 'Air Ride', 'driv-002', 'Gary, IN', 'Ready Now'),
  ('trk-003', 'comp-002', 'Unit 201', 'FB-4801', 'TX-99012', '2HSDAAER8CH881920', '48ft Flatbed', '48 ft', 48000, 'Open Flat', 'Air Ride', 'driv-003', 'Dallas, TX', 'Under Load'),
  ('trk-004', 'comp-003', 'Unit 301', 'SD-5301', 'TX-44120', '3AKJHHDR9DH119284', 'Step Deck', '53 ft', 46000, 'Open Flat', 'Air Ride', 'driv-004', 'Houston, TX', 'Ready Tomorrow')
ON CONFLICT (id) DO NOTHING;

-- 4. Insert Loads
INSERT INTO public.tms_loads (
  id, company_id, driver_id, truck_id, load_number,
  origin_city, origin_state, destination_city, destination_state,
  pickup_date, delivery_date, gross_amount, dispatcher_cut, status,
  broker_name, broker_contact, broker_email, broker_phone, rate_con_number,
  total_miles, rate_per_mile, weight_lbs, broker_notes, stops
) VALUES
  (
    'load-001', 'comp-001', 'driv-001', 'trk-001', 'TOSS-8041',
    'Chicago', 'IL', 'Atlanta', 'GA',
    '2026-10-12', '2026-10-14', 2850.00, 285.00, 'delivered',
    'Echo Global Logistics', 'Sarah Jenkins', 'sjenkins@echo.com', '(800) 354-7993', 'RC-994821',
    715.00, 3.98, 42000, 'No touch freight, 53ft dry van required. Check in 30 mins before appt.',
    '[{"id":"stop-1","stop_number":1,"type":"pickup","facility_name":"Central Foods Distribution","city":"Chicago","state":"IL","address":"2400 S Wood St","date":"2026-10-12","appointment_time":"08:00 AM","status":"completed"},{"id":"stop-2","stop_number":2,"type":"delivery","facility_name":"Atlanta Regional Logistics","city":"Atlanta","state":"GA","address":"450 Fulton Industrial Blvd","date":"2026-10-14","appointment_time":"10:00 AM","status":"completed"}]'::jsonb
  ),
  (
    'load-002', 'comp-001', 'driv-002', 'trk-002', 'TOSS-8042',
    'Indianapolis', 'IN', 'Dallas', 'TX',
    '2026-10-14', '2026-10-16', 3600.00, 360.00, 'in_transit',
    'C.H. Robinson', 'Mark Davis', 'mdavis@chrobinson.com', '(800) 323-7387', 'RC-881920',
    920.00, 3.91, 41500, 'Reefer set at -10F continuous. Temp recorder required at receiver.',
    '[{"id":"stop-1","stop_number":1,"type":"pickup","facility_name":"Indy Cold Storage","city":"Indianapolis","state":"IN","address":"1500 S Keystone Ave","date":"2026-10-14","appointment_time":"06:00 AM","status":"completed"},{"id":"stop-2","stop_number":2,"type":"delivery","facility_name":"Dallas Fresh Hub","city":"Dallas","state":"TX","address":"3300 Cockrell Hill Rd","date":"2026-10-16","appointment_time":"02:00 PM","status":"en_route"}]'::jsonb
  ),
  (
    'load-003', 'comp-002', 'driv-003', 'trk-003', 'TOSS-8043',
    'Houston', 'TX', 'Memphis', 'TN',
    '2026-10-15', '2026-10-16', 2450.00, 208.25, 'booked',
    'TQL (Total Quality Logistics)', 'Austin Reed', 'areed@tql.com', '(800) 580-3101', 'RC-441928',
    585.00, 4.18, 47000, 'Steel coils. 4-inch straps, chains and edge protectors required.',
    '[{"id":"stop-1","stop_number":1,"type":"pickup","facility_name":"Port of Houston Steel","city":"Houston","state":"TX","address":"111 East Loop North","date":"2026-10-15","appointment_time":"07:00 AM","status":"ready"},{"id":"stop-2","stop_number":2,"type":"delivery","facility_name":"Mid-South Metal Fabricators","city":"Memphis","state":"TN","address":"2800 Presidents Island","date":"2026-10-16","appointment_time":"01:00 PM","status":"pending"}]'::jsonb
  ),
  (
    'load-004', 'comp-001', 'driv-001', 'trk-001', 'TOSS-8044',
    'Atlanta', 'GA', 'Savannah', 'GA',
    '2026-10-08', '2026-10-09', 1150.00, 115.00, 'invoiced',
    'Landstar System', 'Greg Taylor', 'gtaylor@landstar.com', '(800) 872-9400', 'RC-331092',
    248.00, 4.63, 38000, 'Packaging materials. Clean trailer.',
    '[{"id":"stop-1","stop_number":1,"type":"pickup","facility_name":"Atlanta Corrugated","city":"Atlanta","state":"GA","address":"1000 Tradeport Dr","date":"2026-10-08","appointment_time":"09:00 AM","status":"completed"},{"id":"stop-2","stop_number":2,"type":"delivery","facility_name":"Coastal Distribution Center","city":"Savannah","state":"GA","address":"200 Tremont Rd","date":"2026-10-09","appointment_time":"11:00 AM","status":"completed"}]'::jsonb
  ),
  (
    'load-005', 'comp-001', 'driv-002', 'trk-002', 'TOSS-8045',
    'Milwaukee', 'WI', 'Chicago', 'IL',
    '2026-10-05', '2026-10-05', 850.00, 85.00, 'paid',
    'Arrive Logistics', 'Jessica Bell', 'jbell@arrivelogistics.com', '(888) 995-7600', 'RC-112093',
    92.00, 9.23, 32000, 'Short haul beverage freight.',
    '[{"id":"stop-1","stop_number":1,"type":"pickup","facility_name":"Miller Brewing Terminal","city":"Milwaukee","state":"WI","address":"4251 W State St","date":"2026-10-05","appointment_time":"08:00 AM","status":"completed"},{"id":"stop-2","stop_number":2,"type":"delivery","facility_name":"Chicago Beverage Depot","city":"Chicago","state":"IL","address":"3500 S Morgan St","date":"2026-10-05","appointment_time":"02:00 PM","status":"completed"}]'::jsonb
  )
ON CONFLICT (id) DO NOTHING;
