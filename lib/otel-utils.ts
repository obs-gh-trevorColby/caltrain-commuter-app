import { trace, SpanStatusCode, SpanKind, metrics } from '@opentelemetry/api';
import { ATTR_HTTP_REQUEST_METHOD, ATTR_HTTP_RESPONSE_STATUS_CODE, ATTR_URL_FULL } from '@opentelemetry/semantic-conventions';

// Server-side tracer
export const serverTracer = trace.getTracer('caltrain-commuter-app-server');

// Client-side tracer (will be initialized in client components)
export const getClientTracer = () => trace.getTracer('caltrain-commuter-app-client');

// Metrics
const meter = metrics.getMeter('caltrain-commuter-app');

// HTTP request duration histogram
export const httpRequestDuration = meter.createHistogram('http_request_duration_ms', {
  description: 'Duration of HTTP requests in milliseconds',
  unit: 'ms',
});

// HTTP request counter
export const httpRequestCounter = meter.createCounter('http_requests_total', {
  description: 'Total number of HTTP requests',
});

// API call success/failure counter
export const apiCallCounter = meter.createCounter('api_calls_total', {
  description: 'Total number of API calls',
});

/**
 * Common attributes for HTTP requests following OpenTelemetry semantic conventions
 */
export interface HttpSpanAttributes {
  url: string;
  method: string;
  statusCode?: number;
  userAgent?: string;
  contentLength?: number;
}

/**
 * Custom attributes for API calls
 */
export interface ApiSpanAttributes {
  apiProvider: string;
  endpoint: string;
  cacheHit?: boolean;
  responseSize?: number;
  errorType?: string;
}

/**
 * Create a span for HTTP requests with standard attributes
 */
export function createHttpSpan(
  tracer: ReturnType<typeof trace.getTracer>,
  spanName: string,
  attributes: HttpSpanAttributes,
  customAttributes?: Record<string, string | number | boolean>
) {
  const span = tracer.startSpan(spanName, {
    kind: SpanKind.CLIENT,
    attributes: {
      [ATTR_HTTP_REQUEST_METHOD]: attributes.method,
      [ATTR_URL_FULL]: attributes.url,
      ...customAttributes,
    },
  });

  return span;
}

/**
 * Set response attributes on a span
 */
export function setResponseAttributes(
  span: ReturnType<typeof tracer.startSpan>,
  statusCode: number,
  responseSize?: number,
  cacheHit?: boolean
) {
  span.setAttributes({
    [ATTR_HTTP_RESPONSE_STATUS_CODE]: statusCode,
    ...(responseSize && { 'http.response.body.size': responseSize }),
    ...(cacheHit !== undefined && { 'cache.hit': cacheHit }),
  });

  // Set span status based on HTTP status code
  if (statusCode >= 400) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: `HTTP ${statusCode}`,
    });
  } else {
    span.setStatus({ code: SpanStatusCode.OK });
  }
}

/**
 * Record an error in a span
 */
export function recordSpanError(
  span: ReturnType<typeof tracer.startSpan>,
  error: Error | string,
  attributes?: Record<string, string | number | boolean>
) {
  const errorMessage = typeof error === 'string' ? error : error.message;
  const errorName = typeof error === 'string' ? 'Error' : error.name;

  span.recordException(typeof error === 'string' ? new Error(error) : error);
  span.setStatus({
    code: SpanStatusCode.ERROR,
    message: errorMessage,
  });

  span.setAttributes({
    'error.type': errorName,
    'error.message': errorMessage,
    ...attributes,
  });
}

/**
 * Wrapper function to instrument fetch calls
 */
export async function instrumentedFetch(
  tracer: ReturnType<typeof trace.getTracer>,
  spanName: string,
  url: string,
  options: RequestInit = {},
  customAttributes?: Record<string, string | number | boolean>
): Promise<Response> {
  const startTime = Date.now();
  const span = createHttpSpan(
    tracer,
    spanName,
    {
      url,
      method: options.method || 'GET',
    },
    customAttributes
  );

  try {
    const response = await fetch(url, options);
    const duration = Date.now() - startTime;

    // Set response attributes
    setResponseAttributes(span, response.status);

    // Record metrics
    httpRequestDuration.record(duration, {
      method: options.method || 'GET',
      status_code: response.status.toString(),
      url: new URL(url).hostname,
    });

    httpRequestCounter.add(1, {
      method: options.method || 'GET',
      status_code: response.status.toString(),
      url: new URL(url).hostname,
    });

    apiCallCounter.add(1, {
      api_provider: customAttributes?.apiProvider as string || 'unknown',
      status: response.ok ? 'success' : 'error',
    });

    return response;
  } catch (error) {
    const duration = Date.now() - startTime;

    recordSpanError(span, error as Error);

    // Record error metrics
    httpRequestDuration.record(duration, {
      method: options.method || 'GET',
      status_code: '0',
      url: new URL(url).hostname,
    });

    httpRequestCounter.add(1, {
      method: options.method || 'GET',
      status_code: '0',
      url: new URL(url).hostname,
    });

    apiCallCounter.add(1, {
      api_provider: customAttributes?.apiProvider as string || 'unknown',
      status: 'error',
    });

    throw error;
  } finally {
    span.end();
  }
}

/**
 * Create a span for data processing operations
 */
export function createProcessingSpan(
  tracer: ReturnType<typeof trace.getTracer>,
  spanName: string,
  attributes?: Record<string, string | number | boolean>
) {
  return tracer.startSpan(spanName, {
    kind: SpanKind.INTERNAL,
    attributes,
  });
}

/**
 * Instrument a function with a span
 */
export async function instrumentFunction<T>(
  tracer: ReturnType<typeof trace.getTracer>,
  spanName: string,
  fn: () => Promise<T> | T,
  attributes?: Record<string, string | number | boolean>
): Promise<T> {
  const span = createProcessingSpan(tracer, spanName, attributes);

  try {
    const result = await fn();
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    recordSpanError(span, error as Error);
    throw error;
  } finally {
    span.end();
  }
}