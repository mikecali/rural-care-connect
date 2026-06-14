// backend/src/middleware/logger.js
// Structured JSON request logger — each line is a valid JSON object
// picked up by Elastic Agent / Filebeat / OTEL collector automatically.
// Fields align with Elastic Common Schema (ECS) where possible.

const crypto = require('crypto');

function structuredLogger() {
  return (req, res, next) => {
    const startMs = Date.now();
    const requestId = req.headers['x-request-id'] || crypto.randomUUID();

    // Attach request ID to req so route handlers can log it
    req.requestId = requestId;
    res.setHeader('X-Request-ID', requestId);

    // Capture response details after it finishes
    res.on('finish', () => {
      const durationMs = Date.now() - startMs;

      // Never log auth headers or bodies — could contain passwords / tokens
      const isSensitivePath = req.path.includes('/auth/');

      const logEntry = {
        '@timestamp': new Date().toISOString(),
        'log.level': res.statusCode >= 500 ? 'error'
                   : res.statusCode >= 400 ? 'warn'
                   : 'info',
        'service.name': 'rcc-backend',
        'service.version': '1.0.0',
        'event.category': 'web',
        'event.type': 'access',
        'http.request.method': req.method,
        'url.path': req.path,
        'url.query': isSensitivePath ? '[REDACTED]' : req.query,
        'http.response.status_code': res.statusCode,
        'http.response.bytes': parseInt(res.getHeader('content-length') || '0') || undefined,
        'event.duration_ms': durationMs,
        'client.ip': req.headers['x-real-ip'] || req.ip,
        'user.id': req.user?.sub || undefined,
        'user.roles': req.user?.role ? [req.user.role] : undefined,
        'trace.id': requestId,
        // Flag slow requests for alerting
        'rcc.slow_request': durationMs > 5000,
        'rcc.ai_request': req.path.includes('/triage/'),
      };

      // Remove undefined fields
      Object.keys(logEntry).forEach(k => logEntry[k] === undefined && delete logEntry[k]);

      // Write to stdout — Docker captures this, Elastic Agent ships it
      process.stdout.write(JSON.stringify(logEntry) + '\n');
    });

    next();
  };
}

// Application event logger — call this from route handlers for business events
function logEvent({ level = 'info', event, userId, role, detail = {} }) {
  const entry = {
    '@timestamp': new Date().toISOString(),
    'log.level': level,
    'service.name': 'rcc-backend',
    'event.category': 'application',
    'event.action': event,
    'user.id': userId || undefined,
    'user.roles': role ? [role] : undefined,
    ...detail,
  };
  Object.keys(entry).forEach(k => entry[k] === undefined && delete entry[k]);
  process.stdout.write(JSON.stringify(entry) + '\n');
}

module.exports = { structuredLogger, logEvent };
