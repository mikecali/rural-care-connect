// backend/src/routes/settings.js
// Admin-only settings management — LLM provider switching
const router = require('express').Router();
const { pool } = require('../db/pool');
const { authMiddleware } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');

const CLAUDE_MODELS = [
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 — fast, smart (recommended)' },
  { id: 'claude-opus-4-6',   label: 'Claude Opus 4.6 — most capable, slower' },
  { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 — fastest, lightest' },
];

const OLLAMA_MODELS = [
  { id: 'gemma4:e2b',    label: 'Gemma 4 E2B — 7.2GB, recommended for 16GB RAM' },
  { id: 'gemma4:e4b',    label: 'Gemma 4 E4B — 9.6GB, better quality' },
  { id: 'llama3.2:3b',   label: 'Llama 3.2 3B — 2GB, fastest CPU inference' },
];

// ── GET /api/settings ─────────────────────────────────────────
router.get('/', authMiddleware(['admin']), async (req, res) => {
  const result = await pool.query(
    `SELECT key, value, description, updated_at FROM app_settings ORDER BY key`
  );

  const settings = Object.fromEntries(result.rows.map(r => [r.key, r]));

  // Mask API key — only show last 6 chars
  if (settings.claude_api_key?.value) {
    const key = settings.claude_api_key.value;
    settings.claude_api_key.value = key.length > 6
      ? '••••••••' + key.slice(-6)
      : '••••••••';
    settings.claude_api_key.is_set = true;
  } else {
    settings.claude_api_key = {
      ...settings.claude_api_key,
      value: '',
      is_set: false,
      env_key_set: !!process.env.ANTHROPIC_API_KEY,
    };
  }

  res.json({
    settings,
    claude_models:  CLAUDE_MODELS,
    ollama_models:  OLLAMA_MODELS,
    current_provider: settings.llm_provider?.value || 'ollama',
    env_api_key_set: !!process.env.ANTHROPIC_API_KEY,
  });
});

// ── PATCH /api/settings ───────────────────────────────────────
router.patch('/', authMiddleware(['admin']), async (req, res) => {
  const { llm_provider, llm_model, claude_api_key, claude_model } = req.body;

  const updates = [];

  if (llm_provider) {
    if (!['ollama', 'claude'].includes(llm_provider))
      return res.status(400).json({ error: 'llm_provider must be ollama or claude' });
    updates.push({ key: 'llm_provider', value: llm_provider });
  }

  if (llm_model) {
    updates.push({ key: 'llm_model', value: llm_model });
  }

  if (claude_model) {
    const valid = CLAUDE_MODELS.map(m => m.id);
    if (!valid.includes(claude_model))
      return res.status(400).json({ error: `Invalid claude_model. Valid: ${valid.join(', ')}` });
    updates.push({ key: 'claude_model', value: claude_model });
  }

  // API key — only update if explicitly provided and non-empty
  if (claude_api_key && claude_api_key !== '••••••••') {
    if (!claude_api_key.startsWith('sk-ant-'))
      return res.status(400).json({ error: 'Invalid Claude API key format (must start with sk-ant-)' });
    updates.push({ key: 'claude_api_key', value: claude_api_key });
  }

  if (updates.length === 0)
    return res.status(400).json({ error: 'No valid settings provided' });

  for (const u of updates) {
    await pool.query(
      `INSERT INTO app_settings (key, value, updated_by, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_by = $3, updated_at = NOW()`,
      [u.key, u.value, req.user.sub]
    );
  }

  await auditLog({
    actorId: req.user.sub, actorRole: 'admin',
    action: 'update_llm_settings',
    resourceType: 'app_settings',
    ip: req.ip,
  });

  res.json({ success: true, updated: updates.map(u => u.key) });
});

// ── GET /api/settings/llm-status ─────────────────────────────
// Health check on the active LLM provider
router.get('/llm-status', authMiddleware(['admin']), async (req, res) => {
  const result = await pool.query(
    `SELECT key, value FROM app_settings WHERE key IN ('llm_provider','llm_model','claude_model','claude_api_key')`
  );
  const s = Object.fromEntries(result.rows.map(r => [r.key, r.value]));
  const provider = s.llm_provider || 'ollama';

  if (provider === 'ollama') {
    try {
      const OLLAMA_URL = process.env.OLLAMA_URL || 'http://ollama:11434';
      const r = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(5000) });
      const data = await r.json();
      const models = (data.models || []).map(m => m.name);
      const activeModel = s.llm_model || process.env.OLLAMA_MODEL || 'gemma4:e2b';
      res.json({
        provider: 'ollama',
        status: 'connected',
        active_model: activeModel,
        model_loaded: models.some(m => m.startsWith(activeModel.split(':')[0])),
        available_models: models,
      });
    } catch (e) {
      res.json({ provider: 'ollama', status: 'error', error: e.message });
    }
  } else {
    // Test Claude API key
    const apiKey = s.claude_api_key || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.json({ provider: 'claude', status: 'no_key', error: 'No API key configured' });
    }
    try {
      const r = await fetch('https://api.anthropic.com/v1/models', {
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        signal: AbortSignal.timeout(5000),
      });
      res.json({
        provider: 'claude',
        status: r.ok ? 'connected' : 'error',
        active_model: s.claude_model || 'claude-sonnet-4-6',
        http_status: r.status,
      });
    } catch (e) {
      res.json({ provider: 'claude', status: 'error', error: e.message });
    }
  }
});

module.exports = router;
