// surveillance.js — Symptom-based disease surveillance
// Logic: patients + CHWs report symptoms with location.
// AI interprets clusters — no diagnosis required.

const router = require('express').Router();
const { llmChat } = require('../lib/llm');
const { pool } = require('../db/pool');
const { authMiddleware } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');

const OLLAMA_URL   = process.env.OLLAMA_URL   || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'gemma4:e2b';

// ── Master symptom list (for UI dropdowns) ─────────────────────
const SYMPTOM_GROUPS = {
  'Fever & temperature': ['fever','chills','night_sweats'],
  'Head & face':         ['headache','jaw_swelling','neck_swelling','red_eyes','runny_nose','mouth_sores'],
  'Skin':                ['rash','yellowing_skin','bleeding_gums','slow_healing_wounds'],
  'Respiratory':         ['cough_2weeks','shortness_of_breath_exertion','rapid_breathing','blood_in_sputum'],
  'Digestive':           ['nausea','vomiting','abdominal_pain','diarrhoea','persistent_vomiting'],
  'Musculoskeletal':     ['joint_pain','back_pain','eye_pain','difficulty_chewing'],
  'Metabolic / NCD':     ['excessive_thirst','frequent_urination','unexplained_fatigue','blurred_vision','tingling_feet','weight_loss'],
  'Cardiovascular':      ['high_bp_reported','palpitations'],
  'General':             ['fatigue','loss_of_appetite','body_weakness'],
};

// ── Detect hotspots against signal definitions ─────────────────
async function detectHotspots(days = 14) {
  const signals = await pool.query(
    `SELECT * FROM symptom_signals WHERE is_active = TRUE`
  );

  const detected = [];

  for (const sig of signals.rows) {
    // Find reports within window that contain ALL required symptoms
    const result = await pool.query(`
      SELECT barangay, sitio,
             COUNT(*) as count,
             array_agg(DISTINCT unnest) as matched_symptoms
      FROM symptom_reports,
           LATERAL unnest(symptoms)
      WHERE reported_at > NOW() - ($1 || ' days')::INTERVAL
        AND symptoms @> $2
        AND is_resolved = FALSE
      GROUP BY barangay, sitio
      HAVING COUNT(*) >= $3`,
      [days, sig.required_symptoms, sig.min_reports]
    );

    for (const row of result.rows) {
      detected.push({
        signal_id:          sig.id,
        signal_name:        sig.signal_name,
        possible_condition: sig.possible_condition,
        barangay:           row.barangay,
        sitio:              row.sitio || null,
        report_count:       parseInt(row.count),
        threshold:          sig.min_reports,
        window_days:        sig.window_days,
        alert_level:        sig.alert_level,
        doh_notifiable:     sig.doh_notifiable,
      });

      // Upsert alert record
      await pool.query(`
        INSERT INTO hotspot_alerts
          (signal_id, signal_name, possible_condition, barangay, sitio,
           report_count, threshold, window_days, alert_level, matching_symptoms)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        ON CONFLICT DO NOTHING`,
        [sig.id, sig.signal_name, sig.possible_condition,
         row.barangay, row.sitio || null,
         parseInt(row.count), sig.min_reports, sig.window_days,
         sig.alert_level, sig.required_symptoms]
      );
    }
  }

  return detected;
}

// ── GET /api/surveillance/symptoms (master list) ───────────────
router.get('/symptoms', authMiddleware(['patient','chw','clinician','admin']), (req, res) => {
  res.json(SYMPTOM_GROUPS);
});

// ── POST /api/surveillance/report-symptoms ─────────────────────
// Core entry point — patient or CHW submits symptom report
router.post('/report-symptoms', authMiddleware(['patient','chw','clinician']), async (req, res) => {
  const {
    patientId, barangay, sitio, symptoms,
    onsetDate, durationDays, severity,
    temperatureC, isChild, hasTravelHistory, travelLocation,
    source, notes
  } = req.body;

  if (!barangay) return res.status(400).json({ error: 'barangay is required' });
  if (!symptoms || !symptoms.length) return res.status(400).json({ error: 'at least one symptom required' });
  if (!onsetDate) return res.status(400).json({ error: 'onset_date is required' });

  // Resolve barangay from patient record if not provided (patient self-report)
  let finalBarangay = barangay;
  let finalPatientId = patientId;

  if (!finalPatientId && req.user.role === 'patient') {
    const p = await pool.query(
      `SELECT id, barangay FROM patients WHERE user_id = $1`, [req.user.sub]
    );
    if (p.rows[0]) {
      finalPatientId = p.rows[0].id;
      if (!finalBarangay) finalBarangay = p.rows[0].barangay;
    }
  }

  const result = await pool.query(`
    INSERT INTO symptom_reports
      (patient_id, reporter_id, reporter_role, barangay, sitio, symptoms,
       onset_date, duration_days, severity, temperature_c, is_child,
       has_travel_history, travel_location, source, notes)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
    RETURNING *`,
    [finalPatientId || null, req.user.sub, req.user.role,
     finalBarangay, sitio || null, symptoms,
     onsetDate, durationDays || null, severity || 'mild',
     temperatureC || null, isChild || false,
     hasTravelHistory || false, travelLocation || null,
     source || 'app', notes || null]
  );

  await auditLog({
    actorId: req.user.sub, actorRole: req.user.role,
    action: 'submit_symptom_report',
    resourceType: 'symptom_report',
    resourceId: result.rows[0].id,
    ip: req.ip
  });

  // Run hotspot check asynchronously (don't block response)
  detectHotspots(14).catch(e => console.error('Hotspot check error:', e.message));

  res.status(201).json(result.rows[0]);
});

// ── GET /api/surveillance/reports (symptom report list) ────────
router.get('/symptom-reports', authMiddleware(['admin','clinician','chw']), async (req, res) => {
  const days = parseInt(req.query.days || '30');
  const barangay = req.query.barangay || null;
  const params = [days];
  let where = `WHERE sr.reported_at > NOW() - ($1 || ' days')::INTERVAL`;
  if (barangay) { where += ` AND sr.barangay = $2`; params.push(barangay); }

  const result = await pool.query(`
    SELECT sr.*, p.full_name as patient_name, u.email as reporter_email
    FROM symptom_reports sr
    LEFT JOIN patients p ON sr.patient_id = p.id
    LEFT JOIN users u ON sr.reporter_id = u.id
    ${where}
    ORDER BY sr.reported_at DESC
    LIMIT 200`, params);

  res.json(result.rows);
});

// ── GET /api/surveillance/summary ─────────────────────────────
router.get('/summary', authMiddleware(['admin','clinician','chw']), async (req, res) => {
  const days = parseInt(req.query.days || '30');

  const [
    totalReports, byBarangay, topSymptoms, bySeverity,
    hotspots, byRole, recentReports, healthStats
  ] = await Promise.all([

    pool.query(`SELECT COUNT(*) FROM symptom_reports
      WHERE reported_at > NOW() - ($1 || ' days')::INTERVAL`, [days]),

    pool.query(`SELECT barangay, sitio, COUNT(*) as count
      FROM symptom_reports
      WHERE reported_at > NOW() - ($1 || ' days')::INTERVAL
      GROUP BY barangay, sitio
      ORDER BY count DESC LIMIT 15`, [days]),

    pool.query(`SELECT unnest(symptoms) as symptom, COUNT(*) as count
      FROM symptom_reports
      WHERE reported_at > NOW() - ($1 || ' days')::INTERVAL
      GROUP BY symptom ORDER BY count DESC LIMIT 15`, [days]),

    pool.query(`SELECT severity, COUNT(*) as count
      FROM symptom_reports
      WHERE reported_at > NOW() - ($1 || ' days')::INTERVAL
      GROUP BY severity`, [days]),

    pool.query(`SELECT * FROM hotspot_alerts
      WHERE is_active = TRUE
      ORDER BY first_detected DESC`),

    pool.query(`SELECT reporter_role, COUNT(*) as count
      FROM symptom_reports
      WHERE reported_at > NOW() - ($1 || ' days')::INTERVAL
      GROUP BY reporter_role`, [days]),

    pool.query(`SELECT sr.barangay, sr.sitio, sr.symptoms, sr.severity,
        sr.onset_date, sr.reporter_role, p.full_name as patient_name,
        sr.reported_at
      FROM symptom_reports sr
      LEFT JOIN patients p ON sr.patient_id = p.id
      WHERE sr.reported_at > NOW() - INTERVAL '7 days'
      ORDER BY sr.reported_at DESC LIMIT 20`),

    pool.query(`SELECT bmi_category, COUNT(*) as count,
        ROUND(AVG(bmi)::numeric,1) as avg_bmi
      FROM health_metrics
      WHERE assessed_at > NOW() - INTERVAL '365 days'
        AND bmi_category IS NOT NULL
      GROUP BY bmi_category`),
  ]);

  // Run hotspot detection
  const detectedHotspots = await detectHotspots(days);

  await auditLog({
    actorId: req.user.sub, actorRole: req.user.role,
    action: 'view_surveillance_summary', ip: req.ip
  });

  res.json({
    period_days:        days,
    total_reports:      parseInt(totalReports.rows[0].count),
    by_barangay:        byBarangay.rows,
    top_symptoms:       topSymptoms.rows,
    by_severity:        bySeverity.rows,
    by_reporter_role:   byRole.rows,
    active_hotspots:    hotspots.rows,
    detected_hotspots:  detectedHotspots,
    recent_reports:     recentReports.rows,
    health_metrics:     healthStats.rows,
    generated_at:       new Date().toISOString(),
  });
});

// ── GET /api/surveillance/hotspots ────────────────────────────
router.get('/hotspots', authMiddleware(['admin','clinician']), async (req, res) => {
  const days = parseInt(req.query.days || '14');
  const hotspots = await detectHotspots(days);
  res.json({ hotspots, days, generated_at: new Date().toISOString() });
});

// ── PATCH /api/surveillance/hotspots/:id/resolve ─────────────
router.patch('/hotspots/:id/resolve', authMiddleware(['admin','clinician']), async (req, res) => {
  const { notes } = req.body;
  const result = await pool.query(`
    UPDATE hotspot_alerts SET
      is_active = FALSE,
      resolved_at = NOW(),
      resolved_by = $1,
      resolution_notes = $2
    WHERE id = $3 RETURNING *`,
    [req.user.sub, notes || null, req.params.id]);
  res.json(result.rows[0]);
});

// ── POST /api/surveillance/generate-report ────────────────────
router.post('/generate-report', authMiddleware(['admin','clinician']), async (req, res) => {
  const { days = 30, barangays } = req.body;

  // Gather all data for AI
  const [
    totalReports, byBarangay, topSymptoms, bySeverity,
    hotspots, byRole, travelHistory, healthStats
  ] = await Promise.all([
    pool.query(`SELECT COUNT(*),
        COUNT(DISTINCT patient_id) as unique_patients,
        COUNT(DISTINCT barangay) as barangays_affected
      FROM symptom_reports
      WHERE reported_at > NOW() - ($1 || ' days')::INTERVAL`, [days]),

    pool.query(`SELECT barangay, sitio, COUNT(*) as count,
        array_agg(DISTINCT unnest) as all_symptoms
      FROM symptom_reports, LATERAL unnest(symptoms)
      WHERE reported_at > NOW() - ($1 || ' days')::INTERVAL
      GROUP BY barangay, sitio
      ORDER BY count DESC LIMIT 10`, [days]),

    pool.query(`SELECT unnest(symptoms) as symptom, COUNT(*) as count
      FROM symptom_reports
      WHERE reported_at > NOW() - ($1 || ' days')::INTERVAL
      GROUP BY symptom ORDER BY count DESC LIMIT 10`, [days]),

    pool.query(`SELECT severity, COUNT(*) as count
      FROM symptom_reports
      WHERE reported_at > NOW() - ($1 || ' days')::INTERVAL
      GROUP BY severity`, [days]),

    pool.query(`SELECT * FROM hotspot_alerts WHERE is_active = TRUE`),

    pool.query(`SELECT reporter_role, COUNT(*) as count
      FROM symptom_reports
      WHERE reported_at > NOW() - ($1 || ' days')::INTERVAL
      GROUP BY reporter_role`, [days]),

    pool.query(`SELECT COUNT(*) FROM symptom_reports
      WHERE has_travel_history = TRUE
        AND reported_at > NOW() - ($1 || ' days')::INTERVAL`, [days]),

    pool.query(`SELECT bmi_category, COUNT(*) as count
      FROM health_metrics WHERE bmi_category IS NOT NULL
      GROUP BY bmi_category`),
  ]);

  const detectedHotspots = await detectHotspots(days);

  const totalCount   = parseInt(totalReports.rows[0].count);
  const uniquePts    = parseInt(totalReports.rows[0].unique_patients);
  const barangayCnt  = parseInt(totalReports.rows[0].barangays_affected);
  const alertLevel   = detectedHotspots.some(h => h.alert_level === 'alert') ? 'alert'
                     : detectedHotspots.some(h => h.alert_level === 'warning') ? 'warning'
                     : detectedHotspots.length > 0 ? 'watch' : 'normal';

  // Fetch individual case notes for richer AI context
  const caseNotes = await pool.query(`
    SELECT barangay, sitio, symptoms, severity, temperature_c,
           onset_date, duration_days, has_travel_history, travel_location,
           reporter_role, notes, is_child
    FROM symptom_reports
    WHERE reported_at > NOW() - ($1 || ' days')::INTERVAL
      AND notes IS NOT NULL
    ORDER BY severity DESC, reported_at DESC
    LIMIT 15`, [days]);

  // Build structured syndromic surveillance prompt
  const travelCount = parseInt(totalReports.rows[0]?.count || 0);
  const severeCount = bySeverity.rows.find(r => r.severity === 'severe')?.count || 0;
  const childReports = caseNotes.rows.filter(r => r.is_child).length;

  const prompt = `# Role and Objective
You are an expert AI clinical epidemiologist specializing in syndromic surveillance for the Philippines DOH. Analyze the symptom surveillance data below and produce a structured public health intelligence report for El Nido, Palawan.

CRITICAL: All data is based on SYMPTOM REPORTS ONLY — no laboratory confirmation. Never state unconfirmed diagnoses as fact. Use language like "consistent with", "possible", "unconfirmed", "requires clinical assessment".

---

# SURVEILLANCE DATA — Last ${days} days

## Activity Summary
| Metric | Value |
|--------|-------|
| Total symptom reports | ${totalCount} |
| Unique patients | ${uniquePts} |
| Barangays affected | ${barangayCnt} |
| Reports with travel history | ${travelCount} |
| Severe cases | ${severeCount} |
| Reports involving children | ${childReports} |
| CHW field reports | ${byRole.rows.find(r => r.reporter_role === 'chw')?.count || 0} |
| Patient self-reports | ${byRole.rows.find(r => r.reporter_role === 'patient')?.count || 0} |

## Top Symptom Frequencies
${topSymptoms.rows.slice(0, 10).map(s => `- ${s.symptom.replace(/_/g, ' ')}: ${s.count} reports`).join('\n')}

## Severity Distribution
${bySeverity.rows.map(r => `- ${r.severity}: ${r.count} cases`).join('\n')}

## Geographic Distribution (Barangay / Sitio)
${byBarangay.rows.slice(0, 8).map(b => `- ${b.barangay}${b.sitio ? ' / ' + b.sitio : ''}: ${b.count} reports — symptoms: ${(b.all_symptoms || []).slice(0, 4).join(', ')}`).join('\n')}

## Detected Symptom Hotspots (${detectedHotspots.length})
${detectedHotspots.length > 0
  ? detectedHotspots.map(h => `- **${h.barangay}${h.sitio ? '/' + h.sitio : ''}**: ${h.report_count} reports in ${h.window_days} days — Possible: "${h.possible_condition}" — Signal level: ${h.alert_level.toUpperCase()}`).join('\n')
  : 'No hotspots detected above threshold'}

## Individual Case Notes (CHW Field Observations)
${caseNotes.rows.map((r, i) => `Case ${i+1}: ${r.barangay}${r.sitio ? '/' + r.sitio : ''} | ${r.reporter_role} | Onset: ${r.onset_date ? new Date(r.onset_date).toLocaleDateString('en-PH') : 'unknown'} | ${r.duration_days || '?'}d | Severity: ${r.severity} | Temp: ${r.temperature_c ? r.temperature_c + '°C' : 'NR'} | Child: ${r.is_child ? 'Yes' : 'No'} | Travel: ${r.has_travel_history ? r.travel_location || 'Yes' : 'No'} | Symptoms: ${(r.symptoms || []).join(', ').replace(/_/g, ' ')} | Note: "${r.notes || ''}"`).join('\n')}

## Health / NCD Metrics
${healthStats.rows.map(r => `- ${r.bmi_category}: ${r.count} patients (avg BMI: ${r.avg_bmi})`).join('\n')}

---

# OUTPUT REQUIRED

Write the following sections in order. Be specific — reference actual barangay names, symptom counts, and case notes in your analysis.

## 1. Executive Summary
3 sentences maximum. State alert level (NORMAL / WATCH / WARNING / ALERT), total reports, top signals detected, and highest-risk locations.

## 2. Syndromic Signal Analysis
For each detected hotspot, extract structured epidemiological data:
- **Signal**: Name the symptom cluster
- **Location**: Barangay / sitio
- **Case count**: Number of reports
- **Symptom profile**: List key symptoms seen
- **Severity**: Distribution of mild/moderate/severe
- **Special concerns**: Children involved? Travel history? Clustering pattern?
- **Possible condition**: State as unconfirmed, recommend clinical assessment
- **Recommended test**: What should clinicians order if they see these patients?

## 3. Geographic Hotspot Map (Text)
List each barangay with report count, dominant symptom cluster, and risk tier (HIGH / MEDIUM / LOW). Note any geographic spread or apparent transmission corridors.

## 4. Epidemiological Risk Assessment
Assess: Is this sporadic or clustered? Is there evidence of person-to-person transmission? Are children disproportionately affected? Is travel history a factor?

## 5. NCD and Metabolic Burden
Analyse the diabetes/obesity/hypertension symptom data separately. What does the BMI data show? What proportion of the population may have undiagnosed diabetes or hypertension?

## 6. Immediate Response Actions
Number 1–6. Be specific: name barangays, name symptoms, name tests, name who should act.

## 7. CHW Field Priorities This Week
3 bullet points. Specific, actionable, named locations.

## 8. DOH PIDSR Notification Assessment
Table format: Disease | Signal threshold met? | If confirmed, mandatory notification? | Priority

Keep total length under 900 words. Use markdown formatting. Be specific and data-driven.`;

  let aiSummary, hotspotsSummary, recommendations, modelUsed = process.env.OLLAMA_MODEL || "gemma4:e4b";
  try {
    const llmResult = await llmChat([
      { role: 'system', content: 'You are a senior epidemiologist for the Philippines DOH. You write evidence-based public health reports. You never state unconfirmed diagnoses as facts.' },
      { role: 'user', content: prompt },
    ], { temperature: 0.2, maxTokens: 2000 });
    aiSummary = llmResult.content || 'Report generation failed.';
    modelUsed = llmResult.model || modelUsed;

    const recMatch = aiSummary.match(/## Recommended Immediate Actions([\s\S]*?)(?=##|$)/);
    recommendations = recMatch ? recMatch[1].trim().split('\n').filter(l => l.trim()) : [];

    hotspotsSummary = detectedHotspots.map(h => ({
      location:  `${h.barangay}${h.sitio ? ' / ' + h.sitio : ''}`,
      condition: h.possible_condition,
      count:     h.report_count,
      level:     h.alert_level,
    }));

  } catch (err) {
    console.error('Surveillance AI error:', err.message);
    aiSummary = `Unable to generate AI analysis at this time.\n\nManual summary: ${totalCount} symptom reports in the last ${days} days across ${barangayCnt} barangays. ${detectedHotspots.length} potential hotspot(s) detected. Clinical review recommended for highlighted locations.`;
    recommendations = ['Review symptom reports manually', 'Visit barangays with highest report counts'];
    hotspotsSummary = detectedHotspots;
  }

  const saved = await pool.query(`
    INSERT INTO surveillance_reports
      (generated_by, trigger_type, period_days,
       ai_summary, hotspots_identified, possible_conditions, recommendations,
       alert_level, total_reports, unique_patients, barangays_affected,
       stats_snapshot, model_used)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [req.user.sub, 'manual', days,
     aiSummary, JSON.stringify(hotspotsSummary),
     JSON.stringify(detectedHotspots.map(h => h.possible_condition)),
     JSON.stringify(recommendations), alertLevel,
     totalCount, uniquePts, barangayCnt,
     JSON.stringify({ by_barangay: byBarangay.rows, top_symptoms: topSymptoms.rows }),
     modelUsed]);

  await auditLog({
    actorId: req.user.sub, actorRole: req.user.role,
    action: 'generate_surveillance_report',
    resourceType: 'surveillance_report',
    resourceId: saved.rows[0].id,
    ip: req.ip
  });

  res.json({ report: saved.rows[0], hotspots: detectedHotspots });
});

// ── GET /api/surveillance/ai-reports ─────────────────────────
router.get('/ai-reports', authMiddleware(['admin','clinician']), async (req, res) => {
  const result = await pool.query(`
    SELECT sr.*, u.email as generated_by_email
    FROM surveillance_reports sr
    LEFT JOIN users u ON sr.generated_by = u.id
    ORDER BY sr.generated_at DESC LIMIT 20`);
  res.json(result.rows);
});

// ── GET /api/surveillance/ai-reports/:id ─────────────────────
router.get('/ai-reports/:id', authMiddleware(['admin','clinician']), async (req, res) => {
  const r = await pool.query(
    `SELECT sr.*, u.email as generated_by_email
     FROM surveillance_reports sr
     LEFT JOIN users u ON sr.generated_by = u.id
     WHERE sr.id = $1`, [req.params.id]);
  if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
  res.json(r.rows[0]);
});

// ── POST /api/surveillance/health-metrics ────────────────────
router.post('/health-metrics', authMiddleware(['chw','clinician']), async (req, res) => {
  const { patientId, heightCm, weightKg, waistCm, dietQuality,
          activityLevel, smoker, alcoholUse, barangay, sitio } = req.body;
  if (!patientId) return res.status(400).json({ error: 'patientId required' });

  let bmi = null, bmiCat = null;
  if (heightCm && weightKg) {
    bmi = parseFloat((weightKg / Math.pow(heightCm / 100, 2)).toFixed(1));
    bmiCat = bmi < 18.5 ? 'underweight' : bmi < 25 ? 'normal' : bmi < 30 ? 'overweight' : 'obese';
  }

  // Get patient barangay if not provided
  let finalBarangay = barangay;
  if (!finalBarangay) {
    const p = await pool.query('SELECT barangay FROM patients WHERE id = $1', [patientId]);
    finalBarangay = p.rows[0]?.barangay;
  }

  const result = await pool.query(`
    INSERT INTO health_metrics
      (patient_id, recorded_by, height_cm, weight_kg, bmi, bmi_category,
       waist_cm, diet_quality, activity_level, smoker, alcohol_use, barangay, sitio)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [patientId, req.user.sub, heightCm||null, weightKg||null, bmi, bmiCat,
     waistCm||null, dietQuality||null, activityLevel||null,
     smoker||null, alcoholUse||null, finalBarangay||null, sitio||null]);

  await auditLog({
    actorId: req.user.sub, actorRole: req.user.role,
    action: 'record_health_metrics',
    resourceType: 'health_metrics',
    resourceId: result.rows[0].id,
    ip: req.ip
  });
  res.status(201).json(result.rows[0]);
});

module.exports = router;
