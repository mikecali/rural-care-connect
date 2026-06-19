// backend/src/lib/llm.js
// Unified LLM client — routes to Ollama or Claude based on admin settings
// Used by both triage.js and surveillance.js

const { pool } = require('../db/pool');

// Cache settings for 60 seconds to avoid DB hit on every request
let settingsCache = null;
let cacheExpiry   = 0;

async function getLLMSettings() {
  if (settingsCache && Date.now() < cacheExpiry) return settingsCache;

  try {
    const result = await pool.query(
      `SELECT key, value FROM app_settings
       WHERE key IN ('llm_provider','llm_model','claude_api_key','claude_model')`
    );
    const s = Object.fromEntries(result.rows.map(r => [r.key, r.value]));
    settingsCache = s;
    cacheExpiry   = Date.now() + 60_000;
    return s;
  } catch {
    // DB not ready yet — fall back to env vars
    return {};
  }
}

// Invalidate cache when settings change
function invalidateCache() {
  settingsCache = null;
  cacheExpiry   = 0;
}

// ── Main chat function ────────────────────────────────────────
// messages: [{ role: 'system'|'user'|'assistant', content: string }]
// options: { temperature, maxTokens }
async function llmChat(messages, options = {}) {
  const settings  = await getLLMSettings();
  const provider  = settings.llm_provider || process.env.LLM_PROVIDER || 'ollama';
  const temp      = options.temperature ?? 0.2;
  const maxTokens = options.maxTokens ?? 1000;

  if (provider === 'claude') {
    return callClaude(messages, settings, temp, maxTokens);
  }
  return callOllama(messages, settings, temp, maxTokens);
}

// ── Ollama ────────────────────────────────────────────────────
async function callOllama(messages, settings, temperature, maxTokens) {
  const OLLAMA_URL = process.env.OLLAMA_URL || 'http://ollama:11434';
  const model      = settings.llm_model || process.env.OLLAMA_MODEL || 'gemma4:e2b';

  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      stream:  false,
      options: { temperature, num_predict: maxTokens },
      messages,
    }),
  });

  if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
  const data = await res.json();

  return {
    provider: 'ollama',
    model,
    content:  data.message?.content?.trim() || '',
    usage: {
      input_tokens:  data.prompt_eval_count || 0,
      output_tokens: data.eval_count || 0,
    },
  };
}

// ── Claude ────────────────────────────────────────────────────
async function callClaude(messages, settings, temperature, maxTokens) {
  const apiKey = settings.claude_api_key || process.env.ANTHROPIC_API_KEY;
  const model  = settings.claude_model || 'claude-sonnet-4-6';

  if (!apiKey) throw new Error('No Claude API key configured. Set in Admin → Settings or ANTHROPIC_API_KEY env var.');

  // Separate system message from conversation
  let system = '';
  const chatMessages = [];
  for (const m of messages) {
    if (m.role === 'system') {
      system = m.content;
    } else {
      chatMessages.push({ role: m.role, content: m.content });
    }
  }

  const body = {
    model,
    max_tokens: maxTokens,
    temperature,
    messages: chatMessages,
  };
  if (system) body.system = system;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method:  'POST',
    headers: {
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
      'content-type':      'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Claude API ${res.status}: ${err.error?.message || res.statusText}`);
  }

  const data = await res.json();
  return {
    provider: 'claude',
    model,
    content:  data.content?.[0]?.text?.trim() || '',
    usage:    data.usage || {},
  };
}

module.exports = { llmChat, getLLMSettings, invalidateCache };
