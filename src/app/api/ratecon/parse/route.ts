import { NextRequest, NextResponse } from 'next/server';
import { ExtractedRateCon } from '@/types';
import { extractText } from 'unpdf';
import { parseRateConTextHeuristic } from '@/lib/ratecon/parser';
import { calculateMapboxRoute, geocodeLocation, estimateCityDistanceMiles } from '@/lib/mapbox/routing';


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
    return decoder.decode(uint8).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, ' ').substring(0, 15000);
  } catch {
    return '';
  }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const clientText = (formData.get('text') as string | null) || '';

    if (!file && !clientText) {
      return NextResponse.json({ error: 'No document uploaded' }, { status: 400 });
    }

    const fileName = file?.name || 'rate_confirmation.pdf';
    let text = clientText.trim().length > 25 ? clientText : '';

    if (!text && file) {
      const buffer = await file.arrayBuffer();
      text = await extractTextFromBuffer(buffer, fileName);
    }

    // 1. Initial heuristic parsing
    const heuristicData = parseRateConTextHeuristic(text, fileName);
    let finalData: ExtractedRateCon = { ...heuristicData };

    // 2. DeepSeek Document Intelligence (if DEEPSEEK_API_KEY is configured)
    const deepseekKey = process.env.DEEPSEEK_API_KEY;
    if (deepseekKey && text.length > 30) {
      try {
        const endpoint = `${process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com'}/chat/completions`;
        const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

        const prompt = `You are a freight logistics rate confirmation document parser.
Extract the load details from this text and output ONLY valid JSON without markdown wrapping:
Text:
${text.substring(0, 8000)}

Output JSON schema:
{
  "broker_name": string,
  "broker_contact": string,
  "broker_email": string,
  "broker_phone": string,
  "broker_mc": string,
  "load_number": string,
  "rate_con_number": string,
  "gross_amount": number,
  "origin_city": string,
  "origin_state": string,
  "origin_address": string,
  "destination_city": string,
  "destination_state": string,
  "destination_address": string,
  "pickup_date": "YYYY-MM-DD",
  "delivery_date": "YYYY-MM-DD",
  "weight_lbs": number,
  "commodities": string,
  "equipment_type": string,
  "notes": string
}`;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12000);

        const aiRes = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${deepseekKey}`,
          },
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.1,
            response_format: { type: 'json_object' },
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (aiRes.ok) {
          const aiJson = await aiRes.json();
          const parsedContent = JSON.parse(aiJson.choices[0].message.content);
          finalData = {
            ...finalData,
            ...parsedContent,
          };
        }
      } catch (aiErr) {
        console.warn('DeepSeek ratecon extraction fallback to heuristic:', aiErr);
      }
    }

    // 3. Calculate distance & RPM via Mapbox if possible
    if (finalData.origin_city && finalData.destination_city) {
      try {
        const [originCoords, destCoords] = await Promise.all([
          geocodeLocation(`${finalData.origin_city}, ${finalData.origin_state}`),
          geocodeLocation(`${finalData.destination_city}, ${finalData.destination_state}`),
        ]);

        if (originCoords && destCoords) {
          const route = await calculateMapboxRoute([originCoords, destCoords]);
          if (route) {
            finalData.total_miles = route.distanceMiles;
            if (finalData.gross_amount && route.distanceMiles > 0) {
              finalData.rate_per_mile = Math.round((finalData.gross_amount / route.distanceMiles) * 100) / 100;
            }
          }
        }
      } catch {
        // Fallback distance estimation
        const estMiles = estimateCityDistanceMiles(finalData.origin_city, finalData.destination_city);
        finalData.total_miles = estMiles;
        if (finalData.gross_amount) {
          finalData.rate_per_mile = Math.round((finalData.gross_amount / estMiles) * 100) / 100;
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
