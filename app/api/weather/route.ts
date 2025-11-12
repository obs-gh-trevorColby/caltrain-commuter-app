import { NextRequest, NextResponse } from 'next/server';
import { WeatherData } from '@/lib/types';
import { getStationById } from '@/lib/stations';
import { celsiusToFahrenheit, mpsToMph } from '@/lib/utils';
import { serverTracer, instrumentedFetch, createProcessingSpan, recordSpanError } from '@/lib/otel-utils';

export async function GET(request: NextRequest) {
  const span = serverTracer.startSpan('weather.api.get', {
    attributes: {
      'http.method': 'GET',
      'http.route': '/api/weather',
    },
  });

  try {
    const searchParams = request.nextUrl.searchParams;
    const stationId = searchParams.get('station');

    span.setAttributes({
      'weather.station.id': stationId || 'unknown',
    });

    if (!stationId) {
      span.setAttributes({ 'error.type': 'validation_error' });
      return NextResponse.json(
        { error: 'Station ID is required' },
        { status: 400 }
      );
    }

    const station = getStationById(stationId);
    if (!station) {
      span.setAttributes({ 'error.type': 'invalid_station' });
      return NextResponse.json(
        { error: 'Invalid station ID' },
        { status: 400 }
      );
    }

    span.setAttributes({
      'weather.station.name': station.name,
      'weather.station.coordinates.lat': station.coordinates.lat,
      'weather.station.coordinates.lng': station.coordinates.lng,
    });

    // Check if API key is configured
    if (!process.env.WEATHER_API_KEY) {
      console.log('Using mock weather data - configure WEATHER_API_KEY for real weather');

      span.setAttributes({
        'weather.data.source': 'mock',
        'weather.api.configured': false,
      });

      const mockWeatherSpan = createProcessingSpan(serverTracer, 'weather.generate_mock', {
        'weather.station.lat': station.coordinates.lat,
      });

      try {
        const mockData = generateMockWeather(station.coordinates.lat);
        mockWeatherSpan.end();

        return NextResponse.json(
          {
            ...mockData,
            isMockData: true
          },
          {
            headers: {
              'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1200'
            }
          }
        );
      } catch (error) {
        recordSpanError(mockWeatherSpan, error as Error);
        mockWeatherSpan.end();
        throw error;
      }
    }

    // Fetch weather from OpenWeatherMap API
    const apiKey = process.env.WEATHER_API_KEY;
    const { lat, lng } = station.coordinates;
    const weatherUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&appid=${apiKey}&units=metric`;

    span.setAttributes({
      'weather.data.source': 'openweathermap',
      'weather.api.configured': true,
      'weather.api.url': weatherUrl,
    });

    const response = await instrumentedFetch(
      serverTracer,
      'fetch.weather.openweathermap',
      weatherUrl,
      { next: { revalidate: 600 } }, // Cache for 10 minutes
      {
        apiProvider: 'openweathermap',
        'weather.station.id': stationId,
        'weather.station.coordinates.lat': lat,
        'weather.station.coordinates.lng': lng,
        'cache.ttl': 600,
      }
    );

    if (!response.ok) {
      throw new Error(`Weather API returned ${response.status}`);
    }

    const data = await response.json();
    const responseSize = JSON.stringify(data).length;

    span.setAttributes({
      'weather.response.size': responseSize,
      'weather.response.temperature': data.main?.temp,
      'weather.response.condition': data.weather?.[0]?.description,
    });

    const weatherData: WeatherData = {
      temperature: celsiusToFahrenheit(data.main.temp),
      description: data.weather[0].description,
      icon: data.weather[0].icon,
      windSpeed: mpsToMph(data.wind.speed),
      humidity: data.main.humidity
    };

    span.setAttributes({
      'weather.processed.temperature_f': weatherData.temperature,
      'weather.processed.wind_speed_mph': weatherData.windSpeed,
      'weather.processed.humidity': weatherData.humidity,
    });

    return NextResponse.json({
      ...weatherData,
      isMockData: false
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1200'
      }
    });

  } catch (error) {
    console.error('Weather API error:', error);
    recordSpanError(span, error as Error, {
      'weather.fallback': 'mock_data',
    });

    // Return mock data as fallback
    const fallbackSpan = createProcessingSpan(serverTracer, 'weather.fallback_mock', {
      'weather.station.lat': station.coordinates.lat,
      'weather.error.original': (error as Error).message,
    });

    try {
      const mockData = generateMockWeather(station.coordinates.lat);
      fallbackSpan.end();

      return NextResponse.json(
        {
          ...mockData,
          isMockData: true
        },
        {
          headers: {
            'Cache-Control': 'public, s-maxage=300'
          }
        }
      );
    } catch (fallbackError) {
      recordSpanError(fallbackSpan, fallbackError as Error);
      fallbackSpan.end();
      throw fallbackError;
    }
  } finally {
    span.end();
  }
}

// Generate mock weather data based on latitude (SF is cooler, SJ is warmer)
function generateMockWeather(lat: number): WeatherData {
  // SF is ~37.77, SJ is ~37.33 - temperature gradient
  const baseTemp = 65 + (37.77 - lat) * 20; // Warmer as you go south
  const temp = Math.round(baseTemp + Math.random() * 5);

  const conditions = [
    { description: 'clear sky', icon: '01d' },
    { description: 'few clouds', icon: '02d' },
    { description: 'partly cloudy', icon: '03d' },
    { description: 'overcast clouds', icon: '04d' }
  ];

  const condition = conditions[Math.floor(Math.random() * conditions.length)];

  return {
    temperature: temp,
    description: condition.description,
    icon: condition.icon,
    windSpeed: Math.round(5 + Math.random() * 10),
    humidity: Math.round(50 + Math.random() * 30)
  };
}

/*
  TO USE REAL WEATHER API:

  1. Get OpenWeatherMap API key:
     - Sign up at https://openweathermap.org/api
     - Free tier: 1000 calls/day, 60 calls/minute

  2. Add to .env.local:
     WEATHER_API_KEY=your_api_key_here

  3. The code above will automatically use the real API when the key is present
*/
