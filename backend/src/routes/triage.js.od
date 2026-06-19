const router = require('express').Router();
const { pool } = require('../db/pool');
const { authMiddleware } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2:3b';

// ── Real El Nido emergency contacts ──────────────────────────────────
const EMERGENCY_CONTACTS = `El Nido Community Hospital: (048) 719-4040 | El Nido Emergency/Police: 911 | El Nido Municipal Health Office: (048) 719-4033 | Barangay Health Emergency: 0917-888-8888`;

// ── Emergency keywords (EN + Filipino) ───────────────────────────────
const EMERGENCY_KEYWORDS = [
  'chest pain','chest tightness','heart attack','cannot breathe',"can't breathe",
  'cant breathe','difficulty breathing','not breathing','shortness of breath',
  'stroke','face drooping','arm weakness','sudden confusion','sudden severe headache',
  'loss of consciousness','fainted','unconscious','no pulse','seizure','convulsion',
  'severe bleeding','coughing blood','vomiting blood','collapsed','collapse',
  'blurred vision','sudden loss of vision','paralyzed','paralysed',
  'sakit sa dibdib','hirap huminga','hindi makahinga','nahimatay',
  'nawalan ng malay','hindi makakilos','matinding sakit ng ulo',
  'malabo ang paningin','nanginginig at nagpapawis',
];

function detectEmergency(text) {
  const lower = text.toLowerCase();
  return EMERGENCY_KEYWORDS.find(kw => lower.includes(kw)) || null;
}

// ── System prompt — exact version provided by project team ───────────
const SYSTEM_PROMPT = `You are a medical pre-screening assistant for Rural Care Connect, screening elderly patients (60+) with T2DM and/or Hypertension in El Nido, Palawan. You are NOT a doctor. Ask ONE question at a time.

EMERGENCY — Stop immediately and say the emergency message if patient reports: chest pain, difficulty breathing, sudden weakness/numbness on one side, sudden severe headache, blurred/lost vision, loss of consciousness, confusion, BP >180/120 with symptoms, or blood sugar <3.9 mmol/L with dizziness/sweating.

Emergency message: "Ito ay isang emergency. Mangyaring tumawag agad sa El Nido Community Hospital. Huwag mag-antay para sa online konsultasyon." (This is an emergency. Please call El Nido Community Hospital immediately. Do not wait for the online consultation.)

RULES: Speak simply. Not an emergency service. No medical advice or diagnoses. Match language to patient preference (Filipino or English).

STEPS (ask one item at a time, in order):
1. Language preference — ask Filipino or English?
2. Identification — full name, age, barangay, registered patient?
3. Chief complaint — main reason for today's consultation (record in patient's own words)
4. Vitals — did a BHW take vitals today? If yes: BP, blood glucose, heart rate, weight
5. Symptoms (past 7 days) — headache/dizziness, chest pain/palpitations, shortness of breath, swollen feet/legs, nausea/vomiting, increased thirst/urination, blurred vision, wounds not healing, other concerns
6. Medications — taking regularly? missed doses? enough supply? side effects?
7. Lifestyle — diet changes? light activity? falls/injuries? sleep quality? feeling sad/worried/stressed?
8. Support — caregiver at home? concerns about food, transport, or medicine supply?
9. Summary — output this block for the doctor:

[PRE-SCREENING SUMMARY]
Name: | Age: | Barangay: | Registered:
Chief complaint:
Vitals: BP | BG | HR | Weight
Symptoms:
Medications: Adherent Y/N | Missed doses: | Supply OK Y/N | Side effects:
Lifestyle:
Psychosocial:
Support/caregiver:
Social concerns:
⚠ Flagged for doctor:

Close with: "Thank you. Your information has been recorded. The doctor will review this before your consultation. Please wait for your turn."

Begin with Step 1.`;

// ── POST /api/triage/chat ─────────────────────────────────────────────
router.post('/chat', authMiddleware(['patient', 'chw', 'clinician']), async (req, res) => {
  const { message, history = [] } = req.body;

  if (!message || message.trim().length === 0) return res.status(400).json({ error: 'Message required' });
  if (message.length > 1000) return res.status(400).json({ error: 'Message too long (max 1000 chars)' });

  // ── Emergency keyword check — always runs before AI ──────────────
  const emergencyTrigger = detectEmergency(message);
  if (emergencyTrigger) {
    await auditLog({ actorId: req.user.sub, actorRole: req.user.role, action: 'triage_emergency_detected', resourceType: 'triage', outcome: 'success', ip: req.ip });
    return res.json({
      reply: `🚨 **Ito ay isang emergency. Tumawag agad sa:**\n\n📞 **El Nido Community Hospital: (048) 719-4040**\n📞 **Emergency/911**\n📞 **Municipal Health Office: (048) 719-4033**\n\nHuwag mag-antay ng online konsultasyon. Pumunta o tumawag agad.\n\n---\n🚨 **This is an emergency. Call immediately:**\n\n📞 **El Nido Community Hospital: (048) 719-4040**\n📞 **Emergency: 911**\n📞 **Municipal Health Office: (048) 719-4033**\n\nDo not wait for the online consultation. Go or call now.`,
      isEmergency: true,
      emergencyTrigger,
    });
  }

  // ── Load patient context (brief — keeps token count low) ─────────
  let patientNote = '';
  try {
    if (req.user.role === 'patient') {
      const pr = await pool.query('SELECT * FROM patients WHERE user_id = $1', [req.user.sub]);
      const pt = pr.rows[0];
      if (pt) {
        const age = Math.floor((Date.now() - new Date(pt.date_of_birth)) / (1000*60*60*24*365.25));
        const vr = await pool.query('SELECT * FROM vitals WHERE patient_id = $1 ORDER BY measured_at DESC LIMIT 1', [pt.id]);
        const vt = vr.rows[0];
        // Keep this note VERY short — every extra token costs ~70ms on CPU
        patientNote = ` [Record: ${pt.full_name}, ${age}y, ${pt.barangay||'unknown'}, ${(pt.conditions||[]).join('/')||'no conditions'}${vt?`, last BP ${vt.systolic_bp}/${vt.diastolic_bp}, glucose ${vt.blood_glucose}`:''} — confirm with patient]`;
      }
    }
  } catch (e) { console.error('Context load error:', e.message); }

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT + patientNote },
    ...history.slice(-16), // Limit history to 16 turns (~8 exchanges) to cap context window
    { role: 'user', content: message },
  ];

  try {
    const ollamaRes = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        stream: false,
        options: {
          temperature: 0.2,
          num_predict: 250,   // Short replies — model asks ONE question at a time
          top_p: 0.9,
          repeat_penalty: 1.1,
        },
        messages,
      }),
    });

    if (!ollamaRes.ok) throw new Error(`Ollama ${ollamaRes.status}`);
    const data = await ollamaRes.json();
    const reply = (data.message?.content || '').trim();
    const isSummary = reply.includes('[PRE-SCREENING SUMMARY]');

    await auditLog({ actorId: req.user.sub, actorRole: req.user.role, action: isSummary ? 'triage_summary_generated' : 'triage_chat', resourceType: 'triage', outcome: 'success', ip: req.ip });

    res.json({ reply, isSummary, isEmergency: false });

  } catch (err) {
    console.error('Triage chat error:', err.message);
    res.status(500).json({ error: 'Hindi nakuha ang sagot ng AI. Subukan ulit. / Could not get AI response. Please try again.' });
  }
});

// ── GET /api/triage/status ────────────────────────────────────────────
router.get('/status', authMiddleware(['patient', 'chw', 'clinician', 'admin']), async (req, res) => {
  try {
    const r = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(3000) });
    const data = await r.json();
    const models = data.models || [];
    const modelReady = models.some(m => m.name.startsWith(OLLAMA_MODEL.split(':')[0]));
    res.json({ status: modelReady ? 'ready' : 'loading', model: OLLAMA_MODEL });
  } catch {
    res.json({ status: 'unavailable', model: OLLAMA_MODEL });
  }
});

module.exports = router;
