const router = require('express').Router();
const { pool } = require('../db/pool');
const { authMiddleware } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');

// GET /api/consultations - clinician sees all their consults; patient sees own
router.get('/', authMiddleware(['clinician', 'admin', 'patient']), async (req, res) => {
  let query, params;
  if (req.user.role === 'patient') {
    query = `SELECT c.*, p.full_name as patient_name, pr.full_name as practitioner_name
             FROM consultations c
             JOIN patients p ON c.patient_id = p.id
             JOIN practitioners pr ON c.practitioner_id = pr.id
             WHERE p.user_id = $1 ORDER BY c.scheduled_at DESC`;
    params = [req.user.sub];
  } else if (req.user.role === 'clinician') {
    query = `SELECT c.*, p.full_name as patient_name, pr.full_name as practitioner_name
             FROM consultations c
             JOIN patients p ON c.patient_id = p.id
             JOIN practitioners pr ON c.practitioner_id = pr.id
             WHERE pr.user_id = $1 ORDER BY c.scheduled_at DESC`;
    params = [req.user.sub];
  } else {
    query = `SELECT c.*, p.full_name as patient_name, pr.full_name as practitioner_name
             FROM consultations c
             JOIN patients p ON c.patient_id = p.id
             JOIN practitioners pr ON c.practitioner_id = pr.id
             ORDER BY c.scheduled_at DESC`;
    params = [];
  }
  const result = await pool.query(query, params);
  await auditLog({ actorId: req.user.sub, actorRole: req.user.role, action: 'list_consultations', resourceType: 'consultation', ip: req.ip });
  res.json(result.rows);
});

// GET /api/consultations/:id with prescriptions
router.get('/:id', authMiddleware(['clinician', 'admin', 'patient']), async (req, res) => {
  const cResult = await pool.query(
    `SELECT c.*, p.full_name as patient_name, p.date_of_birth, p.conditions, pr.full_name as practitioner_name, pr.specialty, pr.prc_license
     FROM consultations c
     JOIN patients p ON c.patient_id = p.id
     JOIN practitioners pr ON c.practitioner_id = pr.id
     WHERE c.id = $1`,
    [req.params.id]
  );
  if (!cResult.rows.length) return res.status(404).json({ error: 'Not found' });

  const rxResult = await pool.query('SELECT * FROM prescriptions WHERE consultation_id = $1', [req.params.id]);
  await auditLog({ actorId: req.user.sub, actorRole: req.user.role, action: 'view_consultation', resourceType: 'consultation', resourceId: req.params.id, ip: req.ip });
  res.json({ ...cResult.rows[0], prescriptions: rxResult.rows });
});

// POST /api/consultations - schedule (patients can self-book)
router.post('/', authMiddleware(['clinician', 'admin', 'patient']), async (req, res) => {
  let { patientId, practitionerId, chiefComplaint, consultType, scheduledAt } = req.body;
  if (!practitionerId) return res.status(400).json({ error: 'practitionerId required' });

  // If the caller is a patient, always use their own patient record (ignore any patientId in body)
  if (req.user.role === 'patient') {
    const own = await pool.query('SELECT id FROM patients WHERE user_id = $1', [req.user.sub]);
    if (!own.rows.length) return res.status(404).json({ error: 'Patient record not found for this account' });
    patientId = own.rows[0].id;
  }

  if (!patientId) return res.status(400).json({ error: 'patientId required' });

  const result = await pool.query(
    `INSERT INTO consultations (patient_id, practitioner_id, chief_complaint, consult_type, scheduled_at, status)
     VALUES ($1, $2, $3, $4, $5, 'scheduled') RETURNING *`,
    [patientId, practitionerId, chiefComplaint || null, consultType || 'teleconsult', scheduledAt || new Date()]
  );
  await auditLog({ actorId: req.user.sub, actorRole: req.user.role, action: 'create_consultation', resourceType: 'consultation', resourceId: result.rows[0].id, ip: req.ip });
  res.status(201).json(result.rows[0]);
});

// PATCH /api/consultations/:id - update notes/diagnosis (clinician)
router.patch('/:id', authMiddleware(['clinician']), async (req, res) => {
  const { diagnosis, treatmentPlan, status, chiefComplaint } = req.body;
  const result = await pool.query(
    `UPDATE consultations SET
       diagnosis = COALESCE($1, diagnosis),
       treatment_plan = COALESCE($2, treatment_plan),
       status = COALESCE($3, status),
       chief_complaint = COALESCE($4, chief_complaint),
       ended_at = CASE WHEN $3 = 'completed' THEN NOW() ELSE ended_at END
     WHERE id = $5 RETURNING *`,
    [diagnosis || null, treatmentPlan || null, status || null, chiefComplaint || null, req.params.id]
  );
  await auditLog({ actorId: req.user.sub, actorRole: req.user.role, action: 'update_consultation', resourceType: 'consultation', resourceId: req.params.id, ip: req.ip });
  res.json(result.rows[0]);
});

// POST /api/consultations/:id/prescriptions
router.post('/:id/prescriptions', authMiddleware(['clinician']), async (req, res) => {
  const { drugGenericName, dosage, frequency, quantity, instructions, validUntil } = req.body;
  if (!drugGenericName) return res.status(400).json({ error: 'Generic drug name required (RA 6675)' });

  const result = await pool.query(
    `INSERT INTO prescriptions (consultation_id, drug_generic_name, dosage, frequency, quantity, instructions, valid_until)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [req.params.id, drugGenericName, dosage, frequency, quantity, instructions, validUntil || null]
  );
  await auditLog({ actorId: req.user.sub, actorRole: req.user.role, action: 'create_prescription', resourceType: 'prescription', resourceId: result.rows[0].id, ip: req.ip });
  res.status(201).json(result.rows[0]);
});

module.exports = router;
