const { pool } = require('../db/pool');
const crypto = require('crypto');

async function auditLog({ actorId, actorRole, action, resourceType, resourceId, outcome = 'success', ip }) {
  const ipHash = ip ? crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16) : null;
  try {
    await pool.query(
      `INSERT INTO audit_events (actor_id, actor_role, action, resource_type, resource_id, outcome, ip_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [actorId || null, actorRole || null, action, resourceType || null, resourceId || null, outcome, ipHash]
    );
  } catch (e) {
    // Audit failure must never break the main request
    console.error('Audit log error:', e.message);
  }
}

module.exports = { auditLog };
