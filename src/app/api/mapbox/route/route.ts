import { NextRequest, NextResponse } from 'next/server';
import { calculateFreightTripDetails } from '@/lib/mapbox/routing';
import { LoadStop } from '@/types';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      originCityState,
      destCityState,
      intermediateStops,
      stops,
      truckLocation,
    } = body as {
      originCityState?: string;
      destCityState?: string;
      intermediateStops?: string[];
      stops?: LoadStop[];
      truckLocation?: string | null;
    };

    const tripDetails = await calculateFreightTripDetails({
      originCityState,
      destCityState,
      intermediateStops,
      stops,
      truckLocation,
    });

    return NextResponse.json({
      success: true,
      data: tripDetails,
    });
  } catch (err: any) {
    console.error('API /api/mapbox/route error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to calculate Mapbox route' },
      { status: 500 }
    );
  }
}
