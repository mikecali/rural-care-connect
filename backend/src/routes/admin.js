const router = require('express').Router();
const { pool } = require('../db/pool');
const { authMiddleware } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');

// ── GET /api/admin/stats ──────────────────────────────────────────────
router.get('/stats', authMiddleware(['admin']), async (req, res) => {
  const [patients, consultations, vitals, users, conditions, recentAudit, authEvents, triageEvents] = await Promise.all([
    pool.query('SELECT COUNT(*) FROM patients'),
    pool.query('SELECT status, COUNT(*) FROM consultations GROUP BY status'),
    pool.query(`SELECT COUNT(*) FROM vitals WHERE measured_at > NOW() - INTERVAL '7 days'`),
    pool.query('SELECT role, COUNT(*) FROM users GROUP BY role'),
    pool.query(`SELECT unnest(conditions) as condition, COUNT(*) FROM patients GROUP BY condition ORDER BY COUNT(*) DESC`),
    pool.query(`SELECT ae.*, u.email FROM audit_events ae LEFT JOIN users u ON ae.actor_id = u.id ORDER BY ae.occurred_at DESC LIMIT 20`),
    pool.query(`SELECT outcome, COUNT(*) FROM audit_events WHERE action = 'login' AND occurred_at > NOW() - INTERVAL '24 hours' GROUP BY outcome`),
    pool.query(`SELECT action, COUNT(*) FROM audit_events WHERE action IN ('triage_chat','triage_summary_generated','triage_emergency_detected') AND occurred_at > NOW() - INTERVAL '7 days' GROUP BY action`),
  ]);

  await auditLog({ actorId: req.user.sub, actorRole: 'admin', action: 'view_admin_stats', ip: req.ip });

  res.json({
    // Original fields — kept for frontend compatibility
    totalPatients:         parseInt(patients.rows[0].count),
    consultationsByStatus: Object.fromEntries(consultations.rows.map(r => [r.status, parseInt(r.count)])),
    vitalsLast7Days:       parseInt(vitals.rows[0].count),
    usersByRole:           Object.fromEntries(users.rows.map(r => [r.role, parseInt(r.count)])),
    topConditions:         conditions.rows.map(r => ({ condition: r.condition, count: parseInt(r.count) })),
    recentAuditEvents:     recentAudit.rows,
    // New fields for enhanced monitoring
    authStats: {
      last24h: Object.fromEntries(authEvents.rows.map(r => [r.outcome, parseInt(r.count)])),
    },
    triageStats: Object.fromEntries(triageEvents.rows.map(r => [r.action, parseInt(r.count)])),
  });
});

// ── GET /api/admin/audit — returns array (frontend compatible) ────────
router.get('/audit', authMiddleware(['admin']), async (req, res) => {
  const limit  = Math.min(parseInt(req.query.limit  || '100'), 500);
  const offset = parseInt(req.query.offset || '0');
  const role   = req.query.role   || null;
  const action = req.query.action || null;

  const conditions = [];
  const params     = [];
  let   p          = 1;

  if (role)   { conditions.push(`ae.actor_role = $${p++}`); params.push(role); }
  if (action) { conditions.push(`ae.action = $${p++}`);     params.push(action); }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  const result = await pool.query(
    `SELECT ae.*, u.email
     FROM audit_events ae
     LEFT JOIN users u ON ae.actor_id = u.id
     ${where}
     ORDER BY ae.occurred_at DESC
     LIMIT $${p++} OFFSET $${p++}`,
    [...params, limit, offset]
  );

  // Return plain array — compatible with existing frontend
  res.json(result.rows);
});

// ── GET /api/admin/patients ───────────────────────────────────────────
router.get('/patients', authMiddleware(['admin']), async (req, res) => {
  const result = await pool.query(`
    SELECT p.*, u.email, u.is_active,
      (SELECT COUNT(*) FROM vitals v WHERE v.patient_id = p.id)               AS vitals_count,
      (SELECT MAX(measured_at) FROM vitals v WHERE v.patient_id = p.id)       AS last_vitals,
      (SELECT COUNT(*) FROM consultations c WHERE c.patient_id = p.id)        AS consult_count,
      (SELECT MAX(created_at) FROM consultations c WHERE c.patient_id = p.id) AS last_consult
    FROM patients p
    LEFT JOIN users u ON p.user_id = u.id
    ORDER BY p.full_name
  `);
  res.json(result.rows);
});

// ── GET /api/admin/activity — rolling activity feed ───────────────────
router.get('/activity', authMiddleware(['admin']), async (req, res) => {
  const hours = Math.min(parseInt(req.query.hours || '24'), 168);
  const result = await pool.query(`
    SELECT ae.id, ae.action, ae.actor_role, ae.outcome,
           ae.resource_type, ae.occurred_at,
           u.email,
           EXTRACT(EPOCH FROM (NOW() - ae.occurred_at))::int AS seconds_ago
    FROM audit_events ae
    LEFT JOIN users u ON ae.actor_id = u.id
    WHERE ae.occurred_at > NOW() - ($1 || ' hours')::INTERVAL
    ORDER BY ae.occurred_at DESC LIMIT 200
  `, [hours]);

  const summary = result.rows.reduce((acc, r) => {
    acc[r.action] = (acc[r.action] || 0) + 1;
    return acc;
  }, {});

  res.json({ hours, summary, events: result.rows });
});

// ── GET /api/admin/security ───────────────────────────────────────────
router.get('/security', authMiddleware(['admin']), async (req, res) => {
  const [failedLogins, offHoursAccess, triageEmergencies] = await Promise.all([
    pool.query(`
      SELECT ip_hash, COUNT(*) as attempts, MAX(occurred_at) as last_attempt
      FROM audit_events
      WHERE action = 'login' AND outcome = 'failure'
        AND occurred_at > NOW() - INTERVAL '24 hours'
      GROUP BY ip_hash HAVING COUNT(*) >= 3
      ORDER BY attempts DESC`),
    pool.query(`
      SELECT ae.action, ae.actor_role, u.email, ae.occurred_at,
             EXTRACT(HOUR FROM ae.occurred_at AT TIME ZONE 'Asia/Manila') AS hour_pst
      FROM audit_events ae LEFT JOIN users u ON ae.actor_id = u.id
      WHERE ae.occurred_at > NOW() - INTERVAL '7 days'
        AND ae.outcome = 'success'
        AND (EXTRACT(HOUR FROM ae.occurred_at AT TIME ZONE 'Asia/Manila') < 6
             OR EXTRACT(HOUR FROM ae.occurred_at AT TIME ZONE 'Asia/Manila') > 22)
      ORDER BY ae.occurred_at DESC LIMIT 50`),
    pool.query(`
      SELECT ae.actor_role, u.email, ae.occurred_at
      FROM audit_events ae LEFT JOIN users u ON ae.actor_id = u.id
      WHERE ae.action = 'triage_emergency_detected'
        AND ae.occurred_at > NOW() - INTERVAL '7 days'
      ORDER BY ae.occurred_at DESC`),
  ]);

  await auditLog({ actorId: req.user.sub, actorRole: 'admin', action: 'view_security_report', ip: req.ip });

  res.json({
    generated_at: new Date().toISOString(),
    alerts: {
      failed_login_clusters:  failedLogins.rows,
      off_hours_access:       offHoursAccess.rows,
      triage_emergencies_7d:  triageEmergencies.rows,
    },
    risk_score: Math.min(100,
      (failedLogins.rows.length * 10) +
      (offHoursAccess.rows.length * 2) +
      (triageEmergencies.rows.length * 5)
    ),
  });
});

module.exports = router;
