import { NextRequest, NextResponse } from 'next/server';
import { ExtractedRateCon, LoadStop } from '@/types';
import { extractText } from 'unpdf';
import { parseRateConTextHeuristic } from '@/lib/ratecon/parser';
import { calculateFreightTripDetails, estimateCityDistanceMiles } from '@/lib/mapbox/routing';

async function extractTextFromBuffer(buffer: ArrayBuffer, fileName: string): Promise<string> {
  const uint8 = new Uint8Array(buffer);
  const isPdf =
    fileName.toLowerCase().endsWith('.pdf') ||
    (uint8[0] === 0x25 && uint8[1] === 0x50 && uint8[2] === 0x44 && uint8[3] === 0x46);

  if (isPdf) {
    try {
      const { text } = await extractText(uint8);
      const fullText = Array.isArray(text) ? text.join('\n\n') : text || '';
      if (fullText.trim().length > 30) return fullText;
    } catch (err) {
      console.warn('unpdf text extraction error:', err);
    }
  }

  try {
    const decoder = new TextDecoder('utf-8');
    return decoder.decode(uint8).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, ' ').substring(0, 20000);
  } catch {
    return '';
  }
}

export async function POST(req: NextRequest) {
  try {
    let clientText = '';
    let fileName = 'rate_confirmation.pdf';
    let truckLocation = '';

    const contentType = req.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      try {
        const body = await req.json();
        clientText = body.text || '';
        fileName = body.fileName || fileName;
        truckLocation = body.truckLocation || '';
      } catch (e) {
        console.warn('JSON parse error from request body:', e);
      }
    } else {
      try {
        const formData = await req.formData();
        const file = formData.get('file') as File | null;
        clientText = (formData.get('text') as string | null) || '';
        truckLocation = (formData.get('truckLocation') as string | null) || '';

        if (file) {
          fileName = file.name;
          const buffer = await file.arrayBuffer();
          const extracted = await extractTextFromBuffer(buffer, fileName);
          if (extracted.trim().length > 15) {
            clientText = extracted;
          }
        }
      } catch (e) {
        console.warn('FormData parse error from request body:', e);
      }
    }

    if (!clientText || clientText.trim().length < 15) {
      return NextResponse.json({ error: 'No readable text found in document' }, { status: 400 });
    }

    // 1. Initial heuristic parsing for instant baseline
    const heuristicData = parseRateConTextHeuristic(clientText, fileName);
    let finalData: ExtractedRateCon = { ...heuristicData };

    // 2. DeepSeek AI Document Intelligence (Industry-standard US freight extraction)
    const deepseekKey = process.env.DEEPSEEK_API_KEY;
    if (deepseekKey && clientText.length > 25) {
      try {
        const endpoint = `${process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com'}/chat/completions`;
        const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

        const systemPrompt = `You are an expert US Freight Logistics Dispatcher and Rate Confirmation (Rate Con) document intelligence parser for Trucking One Stop Shop (TOSS TMS).
Analyze this freight broker rate confirmation (supports TQL, C.H. Robinson, Echo Global Logistics, Coyote, Landstar, Arrive Logistics, NTG, Worldwide Express, RXO, J.B. Hunt, Schneider, etc.) and extract full operational details.

Return ONLY a valid JSON object matching this schema:
{
  "broker_name": string,
  "broker_mc": string,
  "broker_contact": string,
  "broker_phone": string,
  "broker_email": string,
  "load_number": string,
  "rate_con_number": string,
  "gross_amount": number,
  "linehaul_amount": number,
  "fuel_surcharge": number,
  "detention_terms": string,
  "layover_terms": string,
  "tonu_terms": string,
  "origin_city": string,
  "origin_state": string,
  "origin_address": string,
  "origin_zip": string,
  "destination_city": string,
  "destination_state": string,
  "destination_address": string,
  "destination_zip": string,
  "pickup_date": "YYYY-MM-DD",
  "pickup_time": string,
  "delivery_date": "YYYY-MM-DD",
  "delivery_time": string,
  "weight_lbs": number,
  "commodities": string,
  "equipment_type": string,
  "temperature": string,
  "notes": string,
  "stops": [
    {
      "stop_number": number,
      "type": "pickup" | "delivery",
      "facility_name": string,
      "address": string,
      "city": string,
      "state": string,
      "zip": string,
      "date": "YYYY-MM-DD",
      "appointment_time": string,
      "reference_numbers": string,
      "notes": string
    }
  ]
}`;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 14000);

        const aiRes = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${deepseekKey}`,
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: systemPrompt },
              {
                role: 'user',
                content: `Here is the Rate Confirmation raw text to parse:\n\n${clientText.substring(0, 10000)}`,
              },
            ],
            temperature: 0.1,
            response_format: { type: 'json_object' },
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (aiRes.ok) {
          const aiJson = await aiRes.json();
          const parsedContent = JSON.parse(aiJson.choices[0].message.content);

          // Format stops into standard LoadStop format
          let formattedStops: LoadStop[] | undefined = undefined;
          if (Array.isArray(parsedContent.stops) && parsedContent.stops.length > 0) {
            formattedStops = parsedContent.stops.map((s: any, idx: number) => ({
              id: `stop-${idx + 1}`,
              stop_number: s.stop_number || idx + 1,
              type: s.type === 'delivery' ? 'delivery' : 'pickup',
              facility_name: s.facility_name || '',
              address: s.address || '',
              city: s.city || '',
              state: s.state || '',
              zip: s.zip || '',
              date: s.date || (s.type === 'delivery' ? parsedContent.delivery_date : parsedContent.pickup_date) || '',
              appointment_time: s.appointment_time || '',
              reference_numbers: s.reference_numbers || '',
              notes: s.notes || '',
              status: idx === 0 ? 'ready' : 'pending',
            }));
          }

          finalData = {
            ...finalData,
            ...parsedContent,
            ...(formattedStops ? { stops: formattedStops } : {}),
          };
        }
      } catch (aiErr) {
        console.warn('DeepSeek ratecon extraction fallback to heuristic:', aiErr);
      }
    }

    // 3. Mapbox Routing & Live Deadhead Calculation
    if (finalData.origin_city && finalData.destination_city) {
      try {
        const originStr = `${finalData.origin_city}, ${finalData.origin_state || ''}`.trim();
        const destStr = `${finalData.destination_city}, ${finalData.destination_state || ''}`.trim();

        const intermediateStops: string[] = [];
        if (finalData.stops && finalData.stops.length > 2) {
          // Add intermediate stops between first pickup and last delivery
          for (let i = 1; i < finalData.stops.length - 1; i++) {
            const s = finalData.stops[i];
            if (s.city && s.state) {
              intermediateStops.push(`${s.city}, ${s.state}`);
            }
          }
        }

        const tripDetails = await calculateFreightTripDetails({
          originCityState: originStr,
          destCityState: destStr,
          intermediateStops,
          truckLocation: truckLocation || null,
        });

        finalData.loaded_miles = tripDetails.loadedMiles;
        finalData.deadhead_miles = tripDetails.deadheadMiles;
        finalData.total_miles = tripDetails.totalMiles;
        finalData.route_geometry = tripDetails.loadedGeometry;
        finalData.deadhead_geometry = tripDetails.deadheadGeometry;

        if (finalData.gross_amount && tripDetails.loadedMiles > 0) {
          finalData.rate_per_mile = Math.round((finalData.gross_amount / tripDetails.loadedMiles) * 100) / 100;
        }
      } catch (routeErr) {
        console.warn('Mapbox route calculation fallback:', routeErr);
        const estLoaded = estimateCityDistanceMiles(finalData.origin_city, finalData.destination_city);
        finalData.loaded_miles = estLoaded;
        finalData.total_miles = estLoaded;
        if (finalData.gross_amount) {
          finalData.rate_per_mile = Math.round((finalData.gross_amount / estLoaded) * 100) / 100;
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: finalData,
    });
  } catch (err: any) {
    console.error('API ratecon parse error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to process document' },
      { status: 500 }
    );
  }
}
