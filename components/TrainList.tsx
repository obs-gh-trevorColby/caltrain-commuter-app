'use client';

import { useEffect, useState } from 'react';
import { Train } from '@/lib/types';
import { formatTime, formatDuration } from '@/lib/utils';
import { getClientTracer, createHttpSpan, setResponseAttributes, recordSpanError } from '@/lib/otel-utils';

interface TrainListProps {
  originId: string;
  destinationId: string;
}

export default function TrainList({ originId, destinationId }: TrainListProps) {
  const [trains, setTrains] = useState<Train[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isMockData, setIsMockData] = useState(false);
  const [isMockSchedule, setIsMockSchedule] = useState(false);

  useEffect(() => {
    if (!originId || !destinationId) {
      setTrains([]);
      return;
    }

    const fetchTrains = async () => {
      const tracer = getClientTracer();
      const span = createHttpSpan(
        tracer,
        'client.fetch.trains',
        {
          url: `/api/trains?origin=${originId}&destination=${destinationId}`,
          method: 'GET',
        },
        {
          'trains.origin.id': originId,
          'trains.destination.id': destinationId,
          'trains.component': 'TrainList',
        }
      );

      setLoading(true);
      setError(null);

      span.setAttributes({
        'trains.ui.loading': true,
      });

      try {
        const response = await fetch(
          `/api/trains?origin=${originId}&destination=${destinationId}`
        );

        setResponseAttributes(span, response.status);

        if (!response.ok) {
          throw new Error('Failed to fetch train data');
        }

        const data = await response.json();
        const responseSize = JSON.stringify(data).length;
        const trainCount = data.trains?.length || 0;

        span.setAttributes({
          'trains.response.size': responseSize,
          'trains.response.count': trainCount,
          'trains.response.is_mock_data': data.isMockData || false,
          'trains.response.is_mock_schedule': data.isMockSchedule || false,
        });

        // Count trains by type and status
        const trainsByType = (data.trains || []).reduce((acc: Record<string, number>, train: Train) => {
          acc[train.type] = (acc[train.type] || 0) + 1;
          return acc;
        }, {});

        const trainsByStatus = (data.trains || []).reduce((acc: Record<string, number>, train: Train) => {
          const status = train.status || 'unknown';
          acc[status] = (acc[status] || 0) + 1;
          return acc;
        }, {});

        span.setAttributes({
          'trains.types.local': trainsByType.Local || 0,
          'trains.types.limited': trainsByType.Limited || 0,
          'trains.types.express': trainsByType.Express || 0,
          'trains.status.on_time': trainsByStatus['on-time'] || 0,
          'trains.status.delayed': trainsByStatus.delayed || 0,
          'trains.status.cancelled': trainsByStatus.cancelled || 0,
        });

        setTrains(data.trains || []);
        setIsMockData(data.isMockData || false);
        setIsMockSchedule(data.isMockSchedule || false);
        setLastUpdated(new Date());

        span.setAttributes({
          'trains.ui.success': true,
        });
      } catch (err) {
        const error = err instanceof Error ? err : new Error('An error occurred');
        recordSpanError(span, error, {
          'trains.ui.error': true,
        });

        setError(error.message);
        setTrains([]);
      } finally {
        setLoading(false);
        span.setAttributes({
          'trains.ui.loading': false,
        });
        span.end();
      }
    };

    fetchTrains();

    // Auto-refresh every 60 seconds
    const interval = setInterval(fetchTrains, 60000);

    return () => clearInterval(interval);
  }, [originId, destinationId]);

  if (!originId || !destinationId) {
    return null;
  }

  if (loading && trains.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
        <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-4">Next Trains</h2>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse bg-gray-200 dark:bg-gray-700 h-24 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
        <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-4">Next Trains</h2>
        <div className="bg-red-50 dark:bg-red-900/30 border-l-4 border-red-400 dark:border-red-600 p-4">
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        </div>
      </div>
    );
  }

  if (trains.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
        <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-4">Next Trains</h2>
        <div className="bg-yellow-50 dark:bg-yellow-900/30 border-l-4 border-yellow-400 dark:border-yellow-600 p-4">
          <p className="text-sm text-yellow-700 dark:text-yellow-300">
            No trains currently scheduled for this route.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">Next Trains</h2>
          {(isMockData || isMockSchedule) && (
            <span className="text-xs bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 px-2 py-1 rounded font-semibold">
              DEMO MODE
            </span>
          )}
        </div>
        {lastUpdated && (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Updated {lastUpdated.toLocaleTimeString()}
          </p>
        )}
      </div>

      {isMockSchedule && (
        <div className="mb-4 bg-red-50 dark:bg-red-900/30 border-l-4 border-red-500 dark:border-red-600 p-3">
          <p className="text-sm text-red-800 dark:text-red-300 font-semibold">
            ⚠️ Mock Schedule Data
          </p>
          <p className="text-xs text-red-700 dark:text-red-300 mt-1">
            Unable to load real train schedule. The trains and times shown below are simulated for demonstration purposes only.
          </p>
        </div>
      )}

      {isMockData && !isMockSchedule && (
        <div className="mb-4 bg-yellow-50 dark:bg-yellow-900/30 border-l-4 border-yellow-400 dark:border-yellow-600 p-3">
          <p className="text-xs text-yellow-800 dark:text-yellow-300">
            <strong>Demo delays shown.</strong> Configure TRANSIT_API_KEY for real-time train delays.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {trains.map((train, index) => (
          <div
            key={`${train.trainNumber}-${index}`}
            className={`border rounded-lg p-4 transition-all ${
              index === 0
                ? 'border-blue-500 dark:border-blue-400 bg-blue-50 dark:bg-blue-900/30 shadow-md'
                : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
            }`}
          >
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className={`font-bold text-lg ${
                      index === 0 ? 'text-blue-700 dark:text-blue-300' : 'text-gray-800 dark:text-gray-100'
                    }`}
                  >
                    {formatTime(train.departureTime)}
                  </span>
                  {index === 0 && (
                    <span className="bg-blue-500 dark:bg-blue-600 text-white text-xs px-2 py-1 rounded font-semibold">
                      NEXT
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 text-sm text-gray-600 dark:text-gray-300">
                  <div>
                    <span className="font-medium">Arrives:</span>{' '}
                    {formatTime(train.arrivalTime)}
                  </div>
                  <div>
                    <span className="font-medium">Duration:</span>{' '}
                    {formatDuration(train.duration)}
                  </div>
                </div>

                {/* Delay status indicator */}
                {train.status && train.status !== 'on-time' && (
                  <div className="mt-2">
                    {train.status === 'cancelled' ? (
                      <div className="inline-flex items-center gap-1 bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 text-xs font-semibold px-2 py-1 rounded">
                        <span>❌</span>
                        <span>CANCELLED</span>
                      </div>
                    ) : train.delay && train.delay > 0 ? (
                      <div className="inline-flex items-center gap-1 bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 text-xs font-semibold px-2 py-1 rounded">
                        <span>⚠️</span>
                        <span>Delayed {train.delay} min</span>
                      </div>
                    ) : train.delay && train.delay < 0 ? (
                      <div className="inline-flex items-center gap-1 bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 text-xs font-semibold px-2 py-1 rounded">
                        <span>✓</span>
                        <span>Early {Math.abs(train.delay)} min</span>
                      </div>
                    ) : null}
                  </div>
                )}

                {train.status === 'on-time' && (
                  <div className="mt-2">
                    <div className="inline-flex items-center gap-1 bg-green-50 dark:bg-green-900/40 text-green-600 dark:text-green-300 text-xs font-semibold px-2 py-1 rounded">
                      <span>✓</span>
                      <span>On Time</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="text-right">
                <div
                  className={`text-xs font-semibold px-2 py-1 rounded text-center ${
                    train.type === 'Express'
                      ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300'
                      : train.type === 'Limited'
                      ? 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  {train.type}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Train {train.trainNumber}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">{train.direction}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
