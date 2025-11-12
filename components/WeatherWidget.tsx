'use client';

import { useEffect, useState } from 'react';
import { WeatherData } from '@/lib/types';
import { getStationById } from '@/lib/stations';
import { getClientTracer, createHttpSpan, setResponseAttributes, recordSpanError } from '@/lib/otel-utils';

interface WeatherWidgetProps {
  stationId: string;
  label: string;
}

export default function WeatherWidget({ stationId, label }: WeatherWidgetProps) {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMockData, setIsMockData] = useState(false);

  useEffect(() => {
    if (!stationId) {
      setWeather(null);
      return;
    }

    const fetchWeather = async () => {
      const tracer = getClientTracer();
      const span = createHttpSpan(
        tracer,
        'client.fetch.weather',
        {
          url: `/api/weather?station=${stationId}`,
          method: 'GET',
        },
        {
          'weather.station.id': stationId,
          'weather.component': 'WeatherWidget',
        }
      );

      setLoading(true);
      setError(null);

      span.setAttributes({
        'weather.ui.loading': true,
      });

      try {
        const response = await fetch(`/api/weather?station=${stationId}`);

        setResponseAttributes(span, response.status);

        if (!response.ok) {
          throw new Error('Failed to fetch weather data');
        }

        const data = await response.json();
        const responseSize = JSON.stringify(data).length;

        span.setAttributes({
          'weather.response.size': responseSize,
          'weather.response.is_mock': data.isMockData || false,
          'weather.response.temperature': data.temperature,
          'weather.response.condition': data.description,
        });

        setWeather(data);
        setIsMockData(data.isMockData || false);

        span.setAttributes({
          'weather.ui.success': true,
        });
      } catch (err) {
        const error = err instanceof Error ? err : new Error('An error occurred');
        recordSpanError(span, error, {
          'weather.ui.error': true,
        });

        setError(error.message);
        setWeather(null);
      } finally {
        setLoading(false);
        span.setAttributes({
          'weather.ui.loading': false,
        });
        span.end();
      }
    };

    fetchWeather();

    // Auto-refresh every 10 minutes
    const interval = setInterval(fetchWeather, 600000);

    return () => clearInterval(interval);
  }, [stationId]);

  const station = getStationById(stationId);

  if (!stationId || !station) {
    return null;
  }

  if (loading && !weather) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
        <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-2">{label}</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">{station.name}</p>
        <div className="animate-pulse space-y-3">
          <div className="bg-gray-200 dark:bg-gray-700 h-16 rounded" />
          <div className="bg-gray-200 dark:bg-gray-700 h-8 rounded" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
        <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-2">{label}</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">{station.name}</p>
        <div className="bg-red-50 dark:bg-red-900/30 border-l-4 border-red-400 dark:border-red-600 p-3">
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        </div>
      </div>
    );
  }

  if (!weather) {
    return null;
  }

  return (
    <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900 rounded-lg shadow-md p-6">
      <div className="flex items-center gap-2 mb-1">
        <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100">{label}</h3>
        {isMockData && (
          <span className="text-xs bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 px-2 py-1 rounded font-semibold">
            DEMO MODE
          </span>
        )}
      </div>
      <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">{station.name}</p>

      {isMockData && (
        <div className="mb-4 bg-yellow-50 dark:bg-yellow-900/30 border-l-4 border-yellow-400 dark:border-yellow-600 p-3">
          <p className="text-xs text-yellow-800 dark:text-yellow-300">
            <strong>Demo weather shown.</strong> Configure WEATHER_API_KEY for real weather data.
          </p>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {/* Weather Icon */}
          <div className="bg-white dark:bg-gray-700 rounded-full p-3 shadow-sm">
            <img
              src={`https://openweathermap.org/img/wn/${weather.icon}@2x.png`}
              alt={weather.description}
              className="w-12 h-12"
            />
          </div>

          {/* Temperature */}
          <div>
            <div className="text-4xl font-bold text-gray-900 dark:text-gray-100">
              {weather.temperature}°F
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-300 capitalize">
              {weather.description}
            </div>
          </div>
        </div>
      </div>

      {/* Additional Info */}
      <div className="mt-4 pt-4 border-t border-blue-200 dark:border-blue-800 grid grid-cols-2 gap-4 text-sm">
        <div>
          <div className="text-gray-600 dark:text-gray-300">Wind</div>
          <div className="font-semibold text-gray-800 dark:text-gray-100">{weather.windSpeed} mph</div>
        </div>
        <div>
          <div className="text-gray-600 dark:text-gray-300">Humidity</div>
          <div className="font-semibold text-gray-800 dark:text-gray-100">{weather.humidity}%</div>
        </div>
      </div>
    </div>
  );
}
