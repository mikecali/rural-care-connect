// backend/src/otel.js
// OpenTelemetry auto-instrumentation — loads BEFORE app via --require
// Sends traces + metrics to Elastic Cloud via OTLP HTTP (API Key auth)
// Gracefully skips if OTEL_EXPORTER_OTLP_ENDPOINT is not set.

'use strict';

const log = (level, action, detail = {}) => process.stdout.write(
  JSON.stringify({
    '@timestamp': new Date().toISOString(),
    'log.level': level,
    'service.name': 'RCC-care-connect',
    'event.action': action,
    ...detail,
  }) + '\n'
);

const ENDPOINT = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

if (!ENDPOINT) {
  log('info', 'otel_skipped', { message: 'OTEL_EXPORTER_OTLP_ENDPOINT not set — running without APM' });
  module.exports = {};
  return;
}

// ── Parse OTEL_EXPORTER_OTLP_HEADERS into a headers object ───────────
// Format: "Authorization=ApiKey xxx,X-Other=value"
const rawHeaders = process.env.OTEL_EXPORTER_OTLP_HEADERS || '';
const headers = rawHeaders
  ? Object.fromEntries(
      rawHeaders.split(',')
        .map(h => {
          const idx = h.indexOf('=');
          return [h.slice(0, idx).trim(), h.slice(idx + 1).trim()];
        })
    )
  : {};

log('info', 'otel_headers_parsed', {
  message: `Parsed ${Object.keys(headers).length} OTLP header(s)`,
  'otel.headers.keys': Object.keys(headers).join(','),
});

try {
  const { NodeSDK }            = require('@opentelemetry/sdk-node');
  const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
  const { OTLPTraceExporter }  = require('@opentelemetry/exporter-trace-otlp-http');
  const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-http');
  const { PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics');
  const { Resource }           = require('@opentelemetry/resources');

  const resource = new Resource({
    'service.name':            process.env.OTEL_SERVICE_NAME    || 'RCC-care-connect',
    'service.version':         process.env.OTEL_SERVICE_VERSION || '1.0.0',
    'deployment.environment':  process.env.NODE_ENV             || 'production',
    'service.instance.id':     require('os').hostname(),
    'telemetry.sdk.language':  'nodejs',
    // RCC-specific resource attributes
    'rcc.project':             'rural-care-connect',
    'rcc.region':              'El Nido, Palawan',
  });

  const traceExporter = new OTLPTraceExporter({
    url: `${ENDPOINT}/v1/traces`,
    headers,
    timeoutMillis: 10000,
  });

  const metricExporter = new OTLPMetricExporter({
    url: `${ENDPOINT}/v1/metrics`,
    headers,
    timeoutMillis: 10000,
  });

  const sdk = new NodeSDK({
    resource,
    traceExporter,
    metricReader: new PeriodicExportingMetricReader({
      exporter: metricExporter,
      exportIntervalMillis: 30000,
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        // Instrument Express, HTTP, PostgreSQL, DNS automatically
        '@opentelemetry/instrumentation-fs': {
          enabled: false, // Too noisy — every file read creates a span
        },
        '@opentelemetry/instrumentation-http': {
          // Skip health check spam from load balancers
          ignoreIncomingRequestHook: (req) =>
            req.url === '/health' || req.url === '/ready',
          // Attach request ID to every span for correlation
          requestHook: (span, req) => {
            if (req.headers?.['x-request-id']) {
              span.setAttribute('http.request_id', req.headers['x-request-id']);
            }
          },
        },
        '@opentelemetry/instrumentation-pg': {
          // IMPORTANT: Do NOT record SQL parameter values — could contain PHI
          // Only capture the operation type and table name
          dbStatementSerializer: (operation, _params) => {
            return operation.split('\n')[0].trim().slice(0, 100);
          },
          enhancedDatabaseReporting: false,
        },
        '@opentelemetry/instrumentation-express': {
          enabled: true,
        },
      }),
    ],
  });

  sdk.start();

  log('info', 'otel_started', {
    message: 'OpenTelemetry SDK started — sending to Elastic Cloud',
    'otel.endpoint': ENDPOINT,
    'otel.service': process.env.OTEL_SERVICE_NAME || 'RCC-care-connect',
  });

  // Flush spans on graceful shutdown
  const shutdown = async (signal) => {
    log('info', 'otel_shutdown', { message: `Shutting down OTEL SDK on ${signal}` });
    try { await sdk.shutdown(); } catch (e) { /* ignore */ }
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));

  module.exports = { sdk };

} catch (err) {
  log('warn', 'otel_failed', {
    message: 'OTEL startup failed — continuing without APM',
    'error.message': err.message,
  });
  module.exports = {};
}
