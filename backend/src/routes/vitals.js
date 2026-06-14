const router = require('express').Router();
const { pool } = require('../db/pool');
const { authMiddleware } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');

// GET /api/vitals/patient/:patientId
router.get('/patient/:patientId', authMiddleware(['clinician', 'chw', 'admin', 'patient']), async (req, res) => {
  const { patientId } = req.params;

  // Patients can only see their own vitals
  if (req.user.role === 'patient') {
    const owns = await pool.query('SELECT id FROM patients WHERE user_id = $1 AND id = $2', [req.user.sub, patientId]);
    if (!owns.rows.length) return res.status(403).json({ error: 'Access denied' });
  }

  const result = await pool.query(
    `SELECT v.*, u.email as recorded_by_email
     FROM vitals v
     LEFT JOIN users u ON v.recorded_by = u.id
     WHERE v.patient_id = $1
     ORDER BY v.measured_at DESC`,
    [patientId]
  );
  await auditLog({ actorId: req.user.sub, actorRole: req.user.role, action: 'view_vitals', resourceType: 'vitals', ip: req.ip });
  res.json(result.rows);
});

// POST /api/vitals - CHW records vitals
router.post('/', authMiddleware(['chw', 'clinician']), async (req, res) => {
  const { patientId, systolicBp, diastolicBp, bloodGlucose, weightKg, hba1c, notes, measuredAt } = req.body;
  if (!patientId) return res.status(400).json({ error: 'patientId required' });

  // Validate ranges
  if (systolicBp && (systolicBp < 60 || systolicBp > 300)) return res.status(400).json({ error: 'Systolic BP out of range (60-300)' });
  if (diastolicBp && (diastolicBp < 40 || diastolicBp > 200)) return res.status(400).json({ error: 'Diastolic BP out of range (40-200)' });
  if (bloodGlucose && (bloodGlucose < 1 || bloodGlucose > 35)) return res.status(400).json({ error: 'Blood glucose out of range (1-35 mmol/L)' });

  const result = await pool.query(
    `INSERT INTO vitals (patient_id, recorded_by, systolic_bp, diastolic_bp, blood_glucose, weight_kg, hba1c, notes, measured_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [patientId, req.user.sub, systolicBp || null, diastolicBp || null, bloodGlucose || null, weightKg || null, hba1c || null, notes || null, measuredAt || new Date()]
  );

  await auditLog({ actorId: req.user.sub, actorRole: req.user.role, action: 'record_vitals', resourceType: 'vitals', resourceId: result.rows[0].id, ip: req.ip });
  res.status(201).json(result.rows[0]);
});

module.exports = router;
