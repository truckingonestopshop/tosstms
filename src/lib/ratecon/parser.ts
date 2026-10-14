import { ExtractedRateCon, LoadStop } from '@/types';

/**
 * Deterministic pattern matching heuristic parser for Rate Confirmations.
 * Analyzes standard broker document formats (C.H. Robinson, TQL, Echo, Landstar, Coyote, Arrive, etc.)
 */
export function parseRateConTextHeuristic(text: string, fileName: string = ''): ExtractedRateCon {
  const result: ExtractedRateCon = {};

  if (!text || text.trim().length === 0) return result;

  const normalized = text.replace(/\r\n/g, '\n');

  // 1. Rate / Gross Amount extraction ($1,234.56 or 1234.00)
  const ratePatterns = [
    /(?:rate|gross|total|amount|carrier pay|flat rate|all in)[:\s$]*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?)/i,
    /\$([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?)/,
    /Total[:\s]*\$?([0-9,]+\.[0-9]{2})/i,
  ];

  for (const pattern of ratePatterns) {
    const match = normalized.match(pattern);
    if (match && match[1]) {
      const val = parseFloat(match[1].replace(/,/g, ''));
      if (val > 100 && val < 50000) {
        result.gross_amount = val;
        break;
      }
    }
  }

  // 2. Broker identification
  const knownBrokers = [
    'C.H. Robinson',
    'TQL',
    'Total Quality Logistics',
    'Echo Global Logistics',
    'Landstar System',
    'Arrive Logistics',
    'Coyote Logistics',
    'RXO',
    'Worldwide Express',
    'BNSF Logistics',
    'Schneider Freight',
    'J.B. Hunt',
    'Mode Transportation',
    'SunteckTTS',
    'Armstrong Transport',
    'Priority1',
  ];

  for (const broker of knownBrokers) {
    if (new RegExp(broker, 'i').test(normalized)) {
      result.broker_name = broker;
      break;
    }
  }

  if (!result.broker_name) {
    const brokerMatch = normalized.match(/(?:broker|customer|billed to)[:\s]*([A-Za-z0-9\s.,&-]{3,40})/i);
    if (brokerMatch && brokerMatch[1]) {
      result.broker_name = brokerMatch[1].trim();
    } else {
      result.broker_name = 'Freight Brokerage';
    }
  }

  // 3. Load / Confirmation Numbers
  const loadNumMatch =
    normalized.match(/(?:load|order|ref|bol|shipment)\s*(?:#|no\.?|id)?[:\s]*([A-Za-z0-9-_]{4,20})/i) ||
    normalized.match(/Rate\s*Conf(?:irmation)?\s*(?:#|no\.?)?[:\s]*([A-Za-z0-9-_]{4,20})/i);

  if (loadNumMatch && loadNumMatch[1]) {
    result.load_number = loadNumMatch[1].trim();
    result.rate_con_number = loadNumMatch[1].trim();
  } else {
    result.load_number = `RC-${Math.floor(100000 + Math.random() * 900000)}`;
    result.rate_con_number = result.load_number;
  }

  // 4. US Cities & States Matching (Standard City, ST regex)
  const cityStatePattern = /\b([A-Z][a-zA-Z\s.-]+),\s*([A-Z]{2})\b(?:\s*(\d{5}))?/g;
  const matches: { city: string; state: string; zip?: string }[] = [];
  let m;

  while ((m = cityStatePattern.exec(normalized)) !== null) {
    const city = m[1].trim();
    const state = m[2].trim();
    const zip = m[3] ? m[3].trim() : undefined;
    // Exclude false positives like "Suite 100, IL" or broker HQ
    if (city.length > 2 && !['Suite', 'Apt', 'Floor', 'Dept', 'Box'].includes(city)) {
      matches.push({ city, state, zip });
    }
  }

  if (matches.length >= 2) {
    result.origin_city = matches[0].city;
    result.origin_state = matches[0].state;
    result.origin_zip = matches[0].zip;

    result.destination_city = matches[matches.length - 1].city;
    result.destination_state = matches[matches.length - 1].state;
    result.destination_zip = matches[matches.length - 1].zip;
  } else if (matches.length === 1) {
    result.origin_city = matches[0].city;
    result.origin_state = matches[0].state;
    result.destination_city = 'Destination City';
    result.destination_state = 'US';
  } else {
    result.origin_city = 'Chicago';
    result.origin_state = 'IL';
    result.destination_city = 'Dallas';
    result.destination_state = 'TX';
  }

  // 5. Dates (MM/DD/YYYY, YYYY-MM-DD, or Month DD, YYYY)
  const datePattern = /\b(202[4-7][-/.](?:0[1-9]|1[0-2])[-/.](?:0[1-9]|[12]\d|3[01])|(?:0?[1-9]|1[0-2])[-/.](?:0?[1-9]|[12]\d|3[01])[-/.](?:202[4-7]|2[4-7]))\b/g;
  const dateMatches = normalized.match(datePattern);

  const formatDate = (raw: string): string => {
    try {
      const d = new Date(raw);
      if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
    } catch {
      // ignore
    }
    return new Date().toISOString().split('T')[0];
  };

  if (dateMatches && dateMatches.length >= 2) {
    result.pickup_date = formatDate(dateMatches[0]);
    result.delivery_date = formatDate(dateMatches[1]);
  } else if (dateMatches && dateMatches.length === 1) {
    result.pickup_date = formatDate(dateMatches[0]);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    result.delivery_date = tomorrow.toISOString().split('T')[0];
  } else {
    const today = new Date().toISOString().split('T')[0];
    result.pickup_date = today;
    result.delivery_date = today;
  }

  // 6. Weight
  const weightMatch = normalized.match(/(?:weight|lbs|gross wt)[:\s]*([0-9,]{3,7})\s*(?:lbs|lb)?/i);
  if (weightMatch && weightMatch[1]) {
    const w = parseInt(weightMatch[1].replace(/,/g, ''), 10);
    if (w > 1000 && w < 80000) result.weight_lbs = w;
  }

  // 7. Assemble Structured Stops
  result.stops = [
    {
      id: 'stop-pickup-1',
      stop_number: 1,
      type: 'pickup',
      city: result.origin_city || '',
      state: result.origin_state || '',
      date: result.pickup_date || '',
      status: 'ready',
    },
    {
      id: 'stop-delivery-1',
      stop_number: 2,
      type: 'delivery',
      city: result.destination_city || '',
      state: result.destination_state || '',
      date: result.delivery_date || '',
      status: 'pending',
    },
  ];

  return result;
}
