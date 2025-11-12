// GTFS-Realtime utilities for fetching Caltrain real-time data from 511.org
import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import { serverTracer, instrumentedFetch, createProcessingSpan, recordSpanError } from './otel-utils';

const CALTRAIN_AGENCY = 'CT';
const API_BASE = 'http://api.511.org/transit';

export interface TripUpdate {
  tripId: string;
  routeId: string;
  startDate: string;
  startTime: string;
  stopTimeUpdates: StopTimeUpdate[];
}

export interface StopTimeUpdate {
  stopId: string;
  stopSequence: number;
  arrival?: {
    delay: number; // in seconds
    time: number; // unix timestamp
  };
  departure?: {
    delay: number; // in seconds
    time: number; // unix timestamp
  };
  scheduleRelationship?: string;
}

export interface Alert {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  headerText: string;
  descriptionText: string;
  url?: string;
  activePeriods: Array<{
    start: number;
    end: number;
  }>;
  informedEntities: Array<{
    agencyId?: string;
    routeId?: string;
    routeType?: number;
    stopId?: string;
  }>;
}

/**
 * Fetch real-time trip updates from 511.org
 */
export async function fetchTripUpdates(): Promise<TripUpdate[]> {
  const span = serverTracer.startSpan('fetch.transit.tripupdates', {
    attributes: {
      'transit.agency': CALTRAIN_AGENCY,
      'transit.api.provider': '511.org',
      'transit.data.type': 'trip_updates',
    },
  });

  try {
    const apiKey = process.env.TRANSIT_API_KEY;
    if (!apiKey) {
      console.warn('TRANSIT_API_KEY not configured');
      span.setAttributes({
        'transit.api.configured': false,
        'transit.result.count': 0,
      });
      return [];
    }

    span.setAttributes({
      'transit.api.configured': true,
    });

    const url = `${API_BASE}/tripupdates?api_key=${apiKey}&agency=${CALTRAIN_AGENCY}`;

    const response = await instrumentedFetch(
      serverTracer,
      'fetch.transit.511org.tripupdates',
      url,
      { next: { revalidate: 30 } }, // Cache for 30 seconds
      {
        apiProvider: '511.org',
        'transit.agency': CALTRAIN_AGENCY,
        'transit.endpoint': 'tripupdates',
        'cache.ttl': 30,
      }
    );

    if (!response.ok) {
      throw new Error(`511.org API error: ${response.status}`);
    }

    const buffer = await response.arrayBuffer();
    const bufferSize = buffer.byteLength;

    span.setAttributes({
      'transit.response.size': bufferSize,
      'transit.response.format': 'protobuf',
    });

    const parseSpan = createProcessingSpan(serverTracer, 'transit.parse.protobuf', {
      'transit.data.type': 'trip_updates',
      'transit.data.size': bufferSize,
    });

    let feed;
    try {
      feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(
        new Uint8Array(buffer)
      );
      parseSpan.end();
    } catch (error) {
      recordSpanError(parseSpan, error as Error);
      parseSpan.end();
      throw error;
    }

    const processSpan = createProcessingSpan(serverTracer, 'transit.process.tripupdates', {
      'transit.entities.total': feed.entity.length,
    });

    const updates: TripUpdate[] = [];
    let tripUpdateCount = 0;
    let stopTimeUpdateCount = 0;

    try {
      for (const entity of feed.entity) {
        if (entity.tripUpdate && entity.tripUpdate.trip) {
          tripUpdateCount++;
          const trip = entity.tripUpdate.trip;
          const stopTimeUpdates: StopTimeUpdate[] = [];

          for (const stu of entity.tripUpdate.stopTimeUpdate || []) {
            stopTimeUpdateCount++;
            stopTimeUpdates.push({
              stopId: stu.stopId || '',
              stopSequence: stu.stopSequence || 0,
              arrival: stu.arrival
                ? {
                    delay: stu.arrival.delay || 0,
                    time: typeof stu.arrival.time === 'number'
                      ? stu.arrival.time
                      : (stu.arrival.time?.toNumber() || 0),
                  }
                : undefined,
              departure: stu.departure
                ? {
                    delay: stu.departure.delay || 0,
                    time: typeof stu.departure.time === 'number'
                      ? stu.departure.time
                      : (stu.departure.time?.toNumber() || 0),
                  }
                : undefined,
              scheduleRelationship: stu.scheduleRelationship?.toString(),
            });
          }

          updates.push({
            tripId: trip.tripId || '',
            routeId: trip.routeId || '',
            startDate: trip.startDate || '',
            startTime: trip.startTime || '',
            stopTimeUpdates,
          });
        }
      }

      processSpan.setAttributes({
        'transit.trip_updates.count': tripUpdateCount,
        'transit.stop_time_updates.count': stopTimeUpdateCount,
      });
      processSpan.end();
    } catch (error) {
      recordSpanError(processSpan, error as Error);
      processSpan.end();
      throw error;
    }

    span.setAttributes({
      'transit.result.count': updates.length,
      'transit.trip_updates.processed': tripUpdateCount,
      'transit.stop_time_updates.processed': stopTimeUpdateCount,
    });

    return updates;
  } catch (error) {
    console.error('Error fetching trip updates:', error);
    recordSpanError(span, error as Error, {
      'transit.operation': 'fetch_trip_updates',
    });
    span.setAttributes({
      'transit.result.count': 0,
    });
    return [];
  } finally {
    span.end();
  }
}

/**
 * Fetch service alerts from 511.org
 */
export async function fetchServiceAlerts(): Promise<Alert[]> {
  const span = serverTracer.startSpan('fetch.transit.servicealerts', {
    attributes: {
      'transit.agency': CALTRAIN_AGENCY,
      'transit.api.provider': '511.org',
      'transit.data.type': 'service_alerts',
    },
  });

  try {
    const apiKey = process.env.TRANSIT_API_KEY;
    if (!apiKey) {
      console.warn('TRANSIT_API_KEY not configured');
      span.setAttributes({
        'transit.api.configured': false,
        'transit.result.count': 0,
      });
      return [];
    }

    span.setAttributes({
      'transit.api.configured': true,
    });

    const url = `${API_BASE}/servicealerts?api_key=${apiKey}&agency=${CALTRAIN_AGENCY}&format=json`;

    const response = await instrumentedFetch(
      serverTracer,
      'fetch.transit.511org.servicealerts',
      url,
      { next: { revalidate: 300 } }, // Cache for 5 minutes
      {
        apiProvider: '511.org',
        'transit.agency': CALTRAIN_AGENCY,
        'transit.endpoint': 'servicealerts',
        'transit.format': 'json',
        'cache.ttl': 300,
      }
    );

    if (!response.ok) {
      throw new Error(`511.org API error: ${response.status}`);
    }

    const data = await response.json();
    const responseSize = JSON.stringify(data).length;

    span.setAttributes({
      'transit.response.size': responseSize,
      'transit.response.format': 'json',
    });

    const alerts: Alert[] = [];

    const processSpan = createProcessingSpan(serverTracer, 'transit.process.servicealerts', {
      'transit.data.format': 'json',
    });

    try {
      // Parse JSON format service alerts
      if (data.ServiceDelivery?.SituationExchangeDelivery?.Situations?.PtSituationElement) {
        const situations = Array.isArray(data.ServiceDelivery.SituationExchangeDelivery.Situations.PtSituationElement)
          ? data.ServiceDelivery.SituationExchangeDelivery.Situations.PtSituationElement
          : [data.ServiceDelivery.SituationExchangeDelivery.Situations.PtSituationElement];

        processSpan.setAttributes({
          'transit.situations.total': situations.length,
        });

        let criticalCount = 0;
        let warningCount = 0;
        let infoCount = 0;

        for (const situation of situations) {
          const severity = mapSeverity(situation.Severity);

          // Count by severity
          switch (severity) {
            case 'critical': criticalCount++; break;
            case 'warning': warningCount++; break;
            case 'info': infoCount++; break;
          }

          alerts.push({
            id: situation.SituationNumber || Math.random().toString(),
            severity,
            headerText: situation.Summary?.[0]?._ || 'Service Alert',
            descriptionText: situation.Description?.[0]?._ || '',
            url: situation.InfoLinks?.InfoLink?.[0]?.Uri || undefined,
            activePeriods: [],
            informedEntities: [],
          });
        }

        processSpan.setAttributes({
          'transit.alerts.critical': criticalCount,
          'transit.alerts.warning': warningCount,
          'transit.alerts.info': infoCount,
        });
      }

      processSpan.end();
    } catch (error) {
      recordSpanError(processSpan, error as Error);
      processSpan.end();
      throw error;
    }

    span.setAttributes({
      'transit.result.count': alerts.length,
    });

    return alerts;
  } catch (error) {
    console.error('Error fetching service alerts:', error);
    recordSpanError(span, error as Error, {
      'transit.operation': 'fetch_service_alerts',
    });
    span.setAttributes({
      'transit.result.count': 0,
    });
    return [];
  } finally {
    span.end();
  }
}

/**
 * Map 511.org severity to our app's severity levels
 */
function mapSeverity(severity: string | undefined): 'info' | 'warning' | 'critical' {
  if (!severity) return 'info';

  const sev = severity.toLowerCase();
  if (sev.includes('severe') || sev.includes('critical')) return 'critical';
  if (sev.includes('warning') || sev.includes('moderate')) return 'warning';
  return 'info';
}

/**
 * Get delay for a specific stop on a specific trip
 *
 * @param updates - Array of trip updates from GTFS-Realtime feed
 * @param stopId - The GTFS stop_id to match
 * @param tripId - The GTFS trip_id to match (optional - if not provided, matches any trip at the stop)
 * @returns Delay information for the specific trip at the specific stop, or null if not found
 */
export function getStopDelay(
  updates: TripUpdate[],
  stopId: string,
  tripId?: string
): { delay: number; status: 'on-time' | 'delayed' | 'cancelled' } | null {
  for (const update of updates) {
    // If tripId is provided, only match this specific trip
    if (tripId && update.tripId !== tripId) {
      continue;
    }

    for (const stu of update.stopTimeUpdates) {
      if (stu.stopId === stopId) {
        const delay = stu.departure?.delay || stu.arrival?.delay || 0;
        const delayMinutes = Math.round(delay / 60);

        let status: 'on-time' | 'delayed' | 'cancelled' = 'on-time';
        if (stu.scheduleRelationship === 'SKIPPED' || stu.scheduleRelationship === 'CANCELED') {
          status = 'cancelled';
        } else if (Math.abs(delayMinutes) >= 1) {
          // Show delays of 1 minute or more
          status = 'delayed';
        }

        return { delay: delayMinutes, status };
      }
    }
  }

  return null;
}

/**
 * Get delay for a specific trip (any stop on the trip)
 * This is useful when you know the trip_id but don't have the exact GTFS stop_id
 *
 * @param updates - Array of trip updates from GTFS-Realtime feed
 * @param tripId - The GTFS trip_id to match
 * @param trainNumber - Optional train number to use as fallback if exact trip_id match fails
 * @returns Delay information for the trip, or null if not found
 */
export function getTripDelay(
  updates: TripUpdate[],
  tripId: string,
  trainNumber?: string
): { delay: number; status: 'on-time' | 'delayed' | 'cancelled' } | null {
  // First, try exact trip_id match
  for (const update of updates) {
    if (update.tripId === tripId) {
      return calculateTripDelay(update);
    }
  }

  // Fallback: Try matching by train number (GTFS-RT often uses just the train number as trip_id)
  if (trainNumber) {
    for (const update of updates) {
      // Check if tripId equals train number OR ends with train number
      if (update.tripId === trainNumber || update.tripId.endsWith(`-${trainNumber}`)) {
        return calculateTripDelay(update);
      }
    }
  }

  return null;
}

/**
 * Helper function to calculate delay from a TripUpdate
 */
function calculateTripDelay(
  update: TripUpdate
): { delay: number; status: 'on-time' | 'delayed' | 'cancelled' } | null {
  if (update.stopTimeUpdates.length === 0) {
    return null;
  }

  // Find the maximum delay across all stops in this trip
  // This captures delays that accumulate during the journey
  let maxDelaySeconds = 0;
  let isCancelled = false;

  for (const stop of update.stopTimeUpdates) {
    if (stop.scheduleRelationship === 'SKIPPED' || stop.scheduleRelationship === 'CANCELED') {
      isCancelled = true;
      break;
    }

    const stopDelay = stop.departure?.delay || stop.arrival?.delay || 0;
    if (Math.abs(stopDelay) > Math.abs(maxDelaySeconds)) {
      maxDelaySeconds = stopDelay;
    }
  }

  const delayMinutes = Math.round(maxDelaySeconds / 60);

  let status: 'on-time' | 'delayed' | 'cancelled' = 'on-time';
  if (isCancelled) {
    status = 'cancelled';
  } else if (Math.abs(delayMinutes) >= 1) {
    // Show delays of 1 minute or more
    status = 'delayed';
  }

  return { delay: delayMinutes, status };
}
