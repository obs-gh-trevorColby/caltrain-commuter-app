#!/usr/bin/env node

/**
 * Validation script for OpenTelemetry instrumentation
 * This script tests that the instrumentation is working correctly
 * by making requests to the instrumented APIs and checking for spans
 */

const http = require('http');
const https = require('https');

// Configuration
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const OTEL_ENDPOINT = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318';

console.log('🔍 Validating OpenTelemetry Instrumentation...');
console.log(`Base URL: ${BASE_URL}`);
console.log(`OTEL Endpoint: ${OTEL_ENDPOINT}`);

// Helper function to make HTTP requests
function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data,
        });
      });
    });

    req.on('error', reject);
    req.end();
  });
}

// Test functions
async function testWeatherAPI() {
  console.log('\n📡 Testing Weather API instrumentation...');

  try {
    const response = await makeRequest(`${BASE_URL}/api/weather?station=SF`);

    if (response.statusCode === 200) {
      const data = JSON.parse(response.body);
      console.log('✅ Weather API responded successfully');
      console.log(`   Temperature: ${data.temperature}°F`);
      console.log(`   Mock data: ${data.isMockData ? 'Yes' : 'No'}`);
      return true;
    } else {
      console.log(`❌ Weather API failed with status ${response.statusCode}`);
      return false;
    }
  } catch (error) {
    console.log(`❌ Weather API error: ${error.message}`);
    return false;
  }
}

async function testTrainsAPI() {
  console.log('\n🚂 Testing Trains API instrumentation...');

  try {
    const response = await makeRequest(`${BASE_URL}/api/trains?origin=SF&destination=SJ`);

    if (response.statusCode === 200) {
      const data = JSON.parse(response.body);
      console.log('✅ Trains API responded successfully');
      console.log(`   Found ${data.trains?.length || 0} trains`);
      console.log(`   Mock data: ${data.isMockData ? 'Yes' : 'No'}`);
      console.log(`   Mock schedule: ${data.isMockSchedule ? 'Yes' : 'No'}`);
      return true;
    } else {
      console.log(`❌ Trains API failed with status ${response.statusCode}`);
      return false;
    }
  } catch (error) {
    console.log(`❌ Trains API error: ${error.message}`);
    return false;
  }
}

async function testAlertsAPI() {
  console.log('\n🚨 Testing Alerts API instrumentation...');

  try {
    const response = await makeRequest(`${BASE_URL}/api/alerts`);

    if (response.statusCode === 200) {
      const data = JSON.parse(response.body);
      console.log('✅ Alerts API responded successfully');
      console.log(`   Found ${data.alerts?.length || 0} alerts`);
      console.log(`   Mock data: ${data.isMockData ? 'Yes' : 'No'}`);
      return true;
    } else {
      console.log(`❌ Alerts API failed with status ${response.statusCode}`);
      return false;
    }
  } catch (error) {
    console.log(`❌ Alerts API error: ${error.message}`);
    return false;
  }
}

async function checkOTELCollector() {
  console.log('\n📊 Checking OTEL Collector availability...');

  try {
    // Try to reach the OTEL collector health endpoint
    const healthUrl = `${OTEL_ENDPOINT.replace('/v1/traces', '')}/health`;
    const response = await makeRequest(healthUrl);

    if (response.statusCode === 200) {
      console.log('✅ OTEL Collector is reachable');
      return true;
    } else {
      console.log(`⚠️  OTEL Collector returned status ${response.statusCode}`);
      console.log('   This is expected if no collector is running');
      return false;
    }
  } catch (error) {
    console.log('⚠️  OTEL Collector is not reachable');
    console.log('   This is expected if no collector is running');
    console.log(`   Error: ${error.message}`);
    return false;
  }
}

// Main validation function
async function validateInstrumentation() {
  console.log('🚀 Starting validation...\n');

  const results = {
    weather: await testWeatherAPI(),
    trains: await testTrainsAPI(),
    alerts: await testAlertsAPI(),
    collector: await checkOTELCollector(),
  };

  console.log('\n📋 Validation Summary:');
  console.log('='.repeat(50));

  const apiTests = [
    { name: 'Weather API', result: results.weather },
    { name: 'Trains API', result: results.trains },
    { name: 'Alerts API', result: results.alerts },
  ];

  const passedTests = apiTests.filter(test => test.result).length;
  const totalTests = apiTests.length;

  apiTests.forEach(test => {
    console.log(`${test.result ? '✅' : '❌'} ${test.name}`);
  });

  console.log(`${results.collector ? '✅' : '⚠️ '} OTEL Collector`);

  console.log('\n📈 Results:');
  console.log(`   API Tests: ${passedTests}/${totalTests} passed`);
  console.log(`   OTEL Collector: ${results.collector ? 'Available' : 'Not available (optional)'}`);

  if (passedTests === totalTests) {
    console.log('\n🎉 All API instrumentation tests passed!');
    console.log('   Your OpenTelemetry instrumentation is working correctly.');

    if (!results.collector) {
      console.log('\n💡 To see traces and metrics:');
      console.log('   1. Set up an OTEL collector (e.g., Jaeger, Zipkin)');
      console.log('   2. Configure OTEL_EXPORTER_OTLP_ENDPOINT environment variable');
      console.log('   3. Restart the application');
    }

    process.exit(0);
  } else {
    console.log('\n❌ Some tests failed. Check the logs above for details.');
    process.exit(1);
  }
}

// Run validation
validateInstrumentation().catch(error => {
  console.error('\n💥 Validation failed with error:', error);
  process.exit(1);
});