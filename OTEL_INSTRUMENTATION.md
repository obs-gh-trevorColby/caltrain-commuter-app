# OpenTelemetry Instrumentation

This document describes the comprehensive OpenTelemetry instrumentation added to the Caltrain Commuter App to track all API fetch requests for transit and weather data.

## Overview

The application now includes full OpenTelemetry instrumentation for:

- **Server-side API routes** - Weather, Trains, and Alerts APIs
- **External API calls** - OpenWeatherMap, 511.org GTFS Realtime, GTFS Static data
- **Client-side components** - React components making API calls
- **Data processing operations** - GTFS parsing, CSV processing, etc.

## Instrumented Components

### 1. Weather API (`app/api/weather/route.ts`)

**Spans Created:**
- `weather.api.get` - Main API handler span
- `fetch.weather.openweathermap` - OpenWeatherMap API calls
- `weather.generate_mock` - Mock weather data generation
- `weather.fallback_mock` - Fallback mock data on errors

**Attributes Tracked:**
- Station ID, name, and coordinates
- API configuration status
- Response size and weather conditions
- Cache hit/miss status
- Mock data indicators

**Metrics:**
- HTTP request duration and count
- API call success/failure rates
- Response status codes

### 2. GTFS Realtime API (`lib/gtfs-realtime.ts`)

**Spans Created:**
- `fetch.transit.tripupdates` - Trip updates from 511.org
- `fetch.transit.servicealerts` - Service alerts from 511.org
- `transit.parse.protobuf` - Protobuf parsing
- `transit.process.tripupdates` - Trip update processing
- `transit.process.servicealerts` - Service alert processing

**Attributes Tracked:**
- Agency (Caltrain), API provider (511.org)
- Response format (protobuf/JSON) and size
- Number of trip updates and stop time updates
- Alert counts by severity (info, warning, critical)
- Cache TTL settings

### 3. GTFS Static Data (`lib/gtfs-static.ts`)

**Spans Created:**
- `gtfs.fetch_data` - Main GTFS data fetching
- `fetch.gtfs.static_data` - GTFS zip file download
- `gtfs.extract_zip` - ZIP file extraction
- `gtfs.parse_zip_files` - CSV file parsing from ZIP
- `gtfs.load_local_data` - Local file loading fallback
- `gtfs.get_scheduled_trains` - Train schedule queries

**Attributes Tracked:**
- Download size and duration
- File sizes for each GTFS file
- Parse duration and record counts
- Cache validity and fallback scenarios
- Train query parameters (origin, destination, date)
- Service IDs and trip counts

### 4. Client-side Components

#### WeatherWidget (`components/WeatherWidget.tsx`)
**Spans Created:**
- `client.fetch.weather` - Weather API calls from client

**Attributes Tracked:**
- Station ID and loading state
- Response size and mock data status
- Weather conditions and UI state

#### TrainList (`components/TrainList.tsx`)
**Spans Created:**
- `client.fetch.trains` - Train schedule API calls from client

**Attributes Tracked:**
- Origin and destination stations
- Train counts by type (Local, Limited, Express)
- Train status distribution (on-time, delayed, cancelled)
- Mock data indicators

#### ServiceAlerts (`components/ServiceAlerts.tsx`)
**Spans Created:**
- `client.fetch.alerts` - Service alerts API calls from client

**Attributes Tracked:**
- Alert counts by severity
- Response size and mock data status

## Utility Functions (`lib/otel-utils.ts`)

The instrumentation uses a set of utility functions for consistent span creation:

- `createHttpSpan()` - Creates HTTP client spans with standard attributes
- `setResponseAttributes()` - Sets response status and size attributes
- `recordSpanError()` - Records errors with proper status and attributes
- `instrumentedFetch()` - Wrapper for fetch with automatic instrumentation
- `createProcessingSpan()` - Creates internal processing spans
- `instrumentFunction()` - Wraps functions with span instrumentation

## Semantic Conventions

The instrumentation follows OpenTelemetry semantic conventions:

- **HTTP attributes**: `http.method`, `http.response.status_code`, `url.full`
- **Error attributes**: `error.type`, `error.message`
- **Custom attributes**: Prefixed by domain (e.g., `weather.`, `transit.`, `gtfs.`)

## Metrics

The following metrics are automatically recorded:

- `http_request_duration_ms` - HTTP request duration histogram
- `http_requests_total` - HTTP request counter
- `api_calls_total` - API call success/failure counter

## Configuration

### Environment Variables

- `OTEL_EXPORTER_OTLP_ENDPOINT` - OTLP endpoint (default: http://localhost:4318)
- `OTEL_EXPORTER_OTLP_BEARER_TOKEN` - Optional bearer token for authentication
- `NEXT_PUBLIC_OTEL_EXPORTER_OTLP_ENDPOINT` - Client-side OTLP endpoint
- `NEXT_PUBLIC_OTEL_EXPORTER_OTLP_BEARER_TOKEN` - Client-side bearer token

### Existing OpenTelemetry Setup

The application uses the existing OpenTelemetry configuration:

- `instrumentation.ts` - Next.js instrumentation entry point
- `otel-server.ts` - Server-side OTEL configuration
- `otel-client.ts` - Client-side OTEL configuration

## Testing and Validation

### Unit Tests

Run the OpenTelemetry instrumentation tests:

```bash
npm test lib/__tests__/otel-instrumentation.test.ts
```

### Integration Validation

Use the validation script to test instrumentation in a running application:

```bash
# Start the application
npm run dev

# In another terminal, run validation
node scripts/validate-otel-instrumentation.js
```

The validation script will:
1. Test all instrumented API endpoints
2. Check OTEL collector availability
3. Report on instrumentation status

### Manual Testing

1. **Start the application**: `npm run dev`
2. **Use the application**: Navigate through different pages, select stations, view weather and train data
3. **Check traces**: If you have an OTEL collector running (Jaeger, Zipkin, etc.), you should see traces for all API calls

## Observability Benefits

With this instrumentation, you can now:

1. **Track API Performance**: Monitor response times for all external API calls
2. **Identify Bottlenecks**: See which operations take the most time
3. **Monitor Error Rates**: Track API failures and error patterns
4. **Cache Effectiveness**: Monitor cache hit/miss rates
5. **User Experience**: Track client-side API call performance
6. **Data Quality**: Monitor mock vs. real data usage
7. **Service Dependencies**: Understand dependencies on external services

## Example Traces

Typical trace structure for a weather request:

```
weather.api.get
├── fetch.weather.openweathermap
└── weather.generate_mock (if API key not configured)
```

Typical trace structure for a train schedule request:

```
gtfs.get_scheduled_trains
├── gtfs.fetch_data
│   ├── fetch.gtfs.static_data
│   ├── gtfs.extract_zip
│   └── gtfs.parse_zip_files
└── (train processing logic)
```

## Troubleshooting

### No Traces Visible

1. Check that `OTEL_EXPORTER_OTLP_ENDPOINT` is set correctly
2. Ensure your OTEL collector is running and accessible
3. Check application logs for OTEL initialization messages
4. Verify network connectivity to the OTEL collector

### High Cardinality Warnings

If you see warnings about high cardinality attributes:
1. Review custom attributes in spans
2. Consider reducing the number of unique values
3. Use sampling to reduce trace volume

### Performance Impact

The instrumentation is designed to be lightweight, but if you notice performance issues:
1. Enable sampling in the OTEL configuration
2. Reduce the number of custom attributes
3. Use asynchronous span processors

## Future Enhancements

Potential improvements to the instrumentation:

1. **Custom Metrics**: Add business-specific metrics (trains on-time percentage, etc.)
2. **Distributed Tracing**: Connect traces across service boundaries
3. **Alerting**: Set up alerts based on error rates or performance thresholds
4. **Dashboards**: Create observability dashboards for key metrics
5. **Sampling**: Implement intelligent sampling strategies