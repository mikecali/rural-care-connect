const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../db/pool');
const { JWT_SECRET } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1 AND is_active = TRUE', [email]);
    const user = result.rows[0];
    if (!user) {
      await auditLog({ action: 'login', outcome: 'failure', ip: req.ip });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      await auditLog({ actorId: user.id, actorRole: user.role, action: 'login', outcome: 'failure', ip: req.ip });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { sub: user.id, role: user.role, email: user.email },
      JWT_SECRET,
      { expiresIn: '8h' } // Relaxed for demo; prod = 15min
    );

    await auditLog({ actorId: user.id, actorRole: user.role, action: 'login', outcome: 'success', ip: req.ip });

    res.json({ token, role: user.role, userId: user.id, email: user.email });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/register (patient self-registration)
router.post('/register', async (req, res) => {
  const { email, password, fullName, dateOfBirth, mobile, philhealthNo, barangay, conditions } = req.body;
  if (!email || !password || !fullName || !dateOfBirth || !mobile) {
    return res.status(400).json({ error: 'Required fields missing' });
  }
  try {
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length) return res.status(409).json({ error: 'Email already registered' });

    const hash = await bcrypt.hash(password, 10);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const userRes = await client.query(
        'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id',
        [email, hash, 'patient']
      );
      const userId = userRes.rows[0].id;
      const patientRes = await client.query(
        `INSERT INTO patients (user_id, full_name, date_of_birth, mobile, philhealth_no, barangay, conditions)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [userId, fullName, dateOfBirth, mobile, philhealthNo || null, barangay || null, conditions || []]
      );
      // Record registration consent automatically
      await client.query(
        `INSERT INTO consents (patient_id, consent_type, granted) VALUES ($1, 'terms', TRUE), ($1, 'data_privacy', TRUE)`,
        [patientRes.rows[0].id]
      );
      await client.query('COMMIT');
      await auditLog({ actorId: userId, actorRole: 'patient', action: 'register', outcome: 'success', ip: req.ip });
      res.status(201).json({ message: 'Registered successfully', patientId: patientRes.rows[0].id });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

module.exports = router;
