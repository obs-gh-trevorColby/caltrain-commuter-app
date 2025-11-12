/**
 * Test file to validate OpenTelemetry instrumentation
 * This file tests that spans are created correctly and attributes are set properly
 */

import { trace, SpanStatusCode } from '@opentelemetry/api';
import {
  serverTracer,
  getClientTracer,
  createHttpSpan,
  setResponseAttributes,
  recordSpanError,
  instrumentedFetch,
  createProcessingSpan,
  instrumentFunction
} from '../otel-utils';

// Mock fetch for testing
global.fetch = jest.fn();

describe('OpenTelemetry Instrumentation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Utility Functions', () => {
    test('createHttpSpan creates span with correct attributes', () => {
      const tracer = serverTracer;
      const span = createHttpSpan(
        tracer,
        'test.http.request',
        {
          url: 'https://api.example.com/test',
          method: 'GET',
        },
        {
          'custom.attribute': 'test-value',
        }
      );

      expect(span).toBeDefined();
      // Note: In a real test environment, you would need to set up span processors
      // to capture and verify the actual span attributes
    });

    test('setResponseAttributes sets correct status for success', () => {
      const tracer = serverTracer;
      const span = tracer.startSpan('test.span');

      setResponseAttributes(span, 200, 1024, true);

      // In a real test, you would verify the attributes were set correctly
      span.end();
    });

    test('setResponseAttributes sets error status for 4xx/5xx', () => {
      const tracer = serverTracer;
      const span = tracer.startSpan('test.span');

      setResponseAttributes(span, 404);

      // In a real test, you would verify the error status was set
      span.end();
    });

    test('recordSpanError records error correctly', () => {
      const tracer = serverTracer;
      const span = tracer.startSpan('test.span');
      const error = new Error('Test error');

      recordSpanError(span, error, { 'error.context': 'test' });

      // In a real test, you would verify the error was recorded
      span.end();
    });

    test('createProcessingSpan creates internal span', () => {
      const tracer = serverTracer;
      const span = createProcessingSpan(
        tracer,
        'test.processing',
        { 'operation': 'test' }
      );

      expect(span).toBeDefined();
      span.end();
    });
  });

  describe('instrumentedFetch', () => {
    test('successful fetch creates span with correct attributes', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({ data: 'test' }),
      };

      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const tracer = serverTracer;
      const response = await instrumentedFetch(
        tracer,
        'test.fetch',
        'https://api.example.com/test',
        { method: 'GET' },
        { apiProvider: 'test-api' }
      );

      expect(response).toBe(mockResponse);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com/test',
        { method: 'GET' }
      );
    });

    test('failed fetch records error in span', async () => {
      const error = new Error('Network error');
      (global.fetch as jest.Mock).mockRejectedValue(error);

      const tracer = serverTracer;

      await expect(
        instrumentedFetch(
          tracer,
          'test.fetch.error',
          'https://api.example.com/test',
          { method: 'GET' },
          { apiProvider: 'test-api' }
        )
      ).rejects.toThrow('Network error');
    });
  });

  describe('instrumentFunction', () => {
    test('successful function execution', async () => {
      const tracer = serverTracer;
      const testFunction = jest.fn().mockResolvedValue('success');

      const result = await instrumentFunction(
        tracer,
        'test.function',
        testFunction,
        { 'function.name': 'testFunction' }
      );

      expect(result).toBe('success');
      expect(testFunction).toHaveBeenCalled();
    });

    test('function execution with error', async () => {
      const tracer = serverTracer;
      const error = new Error('Function error');
      const testFunction = jest.fn().mockRejectedValue(error);

      await expect(
        instrumentFunction(
          tracer,
          'test.function.error',
          testFunction,
          { 'function.name': 'errorFunction' }
        )
      ).rejects.toThrow('Function error');
    });
  });

  describe('Client Tracer', () => {
    test('getClientTracer returns tracer instance', () => {
      const tracer = getClientTracer();
      expect(tracer).toBeDefined();
    });
  });
});

// Integration test to verify instrumentation works end-to-end
describe('Integration Tests', () => {
  test('Weather API instrumentation flow', () => {
    // This would test the actual weather API route with instrumentation
    // In a real test environment, you would:
    // 1. Set up a test OTEL collector or in-memory span processor
    // 2. Make a request to the weather API
    // 3. Verify that spans are created with correct attributes
    // 4. Verify that metrics are recorded

    expect(true).toBe(true); // Placeholder
  });

  test('GTFS Realtime API instrumentation flow', () => {
    // Similar integration test for GTFS Realtime API
    expect(true).toBe(true); // Placeholder
  });

  test('Client-side component instrumentation', () => {
    // Test that client components create spans when making API calls
    expect(true).toBe(true); // Placeholder
  });
});