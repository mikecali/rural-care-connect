require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { structuredLogger, logEvent } = require('./middleware/logger');

const authRoutes         = require('./routes/auth');
const patientRoutes      = require('./routes/patients');
const vitalsRoutes       = require('./routes/vitals');
const consultationRoutes = require('./routes/consultations');
const adminRoutes        = require('./routes/admin');
const triageRoutes       = require('./routes/triage');

const app  = express();
const PORT = process.env.PORT || 4000;

// ── Middleware ────────────────────────────────────────────────────────
app.use(cors({ origin: '*' })); // Lock down in production
app.use(express.json({ limit: '1mb' }));
app.use(structuredLogger()); // Structured JSON request log on every route

// Trust proxy headers from nginx (needed for real client IPs)
app.set('trust proxy', 1);

// ── Health / readiness endpoints ──────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'rcc-backend',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptime_seconds: Math.floor(process.uptime()),
  });
});

// Kubernetes/ECS-style readiness probe
app.get('/ready', async (req, res) => {
  try {
    const { pool } = require('./db/pool');
    await pool.query('SELECT 1');
    res.json({ status: 'ready', db: 'connected' });
  } catch (e) {
    res.status(503).json({ status: 'not_ready', db: 'disconnected', error: e.message });
  }
});

// ── Routes ────────────────────────────────────────────────────────────
app.use('/api/auth',          authRoutes);
app.use('/api/patients',      patientRoutes);
app.use('/api/vitals',        vitalsRoutes);
app.use('/api/consultations', consultationRoutes);
app.use('/api/admin',         adminRoutes);
app.use('/api/triage',        triageRoutes);

// ── 404 ───────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Not found', path: req.path });
});

// ── Global error handler ──────────────────────────────────────────────
app.use((err, req, res, next) => {
  logEvent({
    level: 'error',
    event: 'unhandled_error',
    userId: req.user?.sub,
    role: req.user?.role,
    detail: {
      'error.message': err.message,
      'error.stack': err.stack?.split('\n')[0],
      'url.path': req.path,
      'http.request.method': req.method,
    },
  });
  res.status(500).json({ error: 'Internal server error', requestId: req.requestId });
});

// ── Start ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  logEvent({ level: 'info', event: 'server_started', detail: {
    'server.port': PORT,
    'ollama.url': process.env.OLLAMA_URL || 'http://localhost:11434',
    'ollama.model': process.env.OLLAMA_MODEL || 'llama3.2:3b',
    'node.version': process.version,
  }});

  console.log(`🏥 RCC API :${PORT}`);
  console.log(`   Logins: patient@demo.rcc | chw@demo.rcc | doctor@demo.rcc | admin@demo.rcc`);
  console.log(`   Password: Demo1234!`);
});
