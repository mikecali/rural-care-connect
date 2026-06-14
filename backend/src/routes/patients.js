const router = require('express').Router();
const { pool } = require('../db/pool');
const { authMiddleware } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');

// GET /api/patients - list (clinician, chw, admin)
router.get('/', authMiddleware(['clinician', 'chw', 'admin']), async (req, res) => {
  const { search } = req.query;
  let query = `SELECT p.*, u.email FROM patients p LEFT JOIN users u ON p.user_id = u.id ORDER BY p.full_name`;
  const params = [];
  if (search) {
    query = `SELECT p.*, u.email FROM patients p LEFT JOIN users u ON p.user_id = u.id
             WHERE p.full_name ILIKE $1 OR p.barangay ILIKE $1 ORDER BY p.full_name`;
    params.push(`%${search}%`);
  }
  const result = await pool.query(query, params);
  await auditLog({ actorId: req.user.sub, actorRole: req.user.role, action: 'list_patients', resourceType: 'patient', ip: req.ip });
  res.json(result.rows);
});

// GET /api/patients/me - patient views own record
router.get('/me', authMiddleware(['patient']), async (req, res) => {
  const result = await pool.query(
    'SELECT p.* FROM patients p WHERE p.user_id = $1', [req.user.sub]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'Patient record not found' });
  await auditLog({ actorId: req.user.sub, actorRole: 'patient', action: 'view_own_record', resourceType: 'patient', resourceId: result.rows[0].id, ip: req.ip });
  res.json(result.rows[0]);
});

// GET /api/patients/:id
router.get('/:id', authMiddleware(['clinician', 'chw', 'admin']), async (req, res) => {
  const result = await pool.query('SELECT p.*, u.email FROM patients p LEFT JOIN users u ON p.user_id = u.id WHERE p.id = $1', [req.params.id]);
  if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
  await auditLog({ actorId: req.user.sub, actorRole: req.user.role, action: 'view_patient', resourceType: 'patient', resourceId: req.params.id, ip: req.ip });
  res.json(result.rows[0]);
});

module.exports = router;
