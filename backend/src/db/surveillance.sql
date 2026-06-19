-- =============================================================
-- Rural Care Connect — Symptom-Based Surveillance Schema v2
-- Richer seed data for meaningful AI hotspot analysis
-- =============================================================

-- ── Symptom reports ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS symptom_reports (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id    UUID REFERENCES patients(id) ON DELETE SET NULL,
  reporter_id   UUID REFERENCES users(id),
  reporter_role VARCHAR(20) NOT NULL
    CHECK (reporter_role IN ('patient','chw','clinician')),
  barangay      VARCHAR(100) NOT NULL,
  sitio         VARCHAR(100),
  municipality  VARCHAR(100) DEFAULT 'El Nido',
  symptoms      TEXT[] NOT NULL,
  onset_date    DATE NOT NULL,
  duration_days INTEGER,
  severity      VARCHAR(20) DEFAULT 'mild'
    CHECK (severity IN ('mild','moderate','severe')),
  temperature_c NUMERIC(4,1),
  is_child      BOOLEAN DEFAULT FALSE,
  has_travel_history BOOLEAN DEFAULT FALSE,
  travel_location VARCHAR(200),
  source        VARCHAR(20) DEFAULT 'app'
    CHECK (source IN ('app','triage_chat','home_visit')),
  triage_session_id UUID,
  notes         TEXT,
  is_resolved   BOOLEAN DEFAULT FALSE,
  resolved_at   TIMESTAMPTZ,
  reported_at   TIMESTAMPTZ DEFAULT NOW(),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sr_barangay   ON symptom_reports(barangay);
CREATE INDEX IF NOT EXISTS idx_sr_symptoms   ON symptom_reports USING GIN(symptoms);
CREATE INDEX IF NOT EXISTS idx_sr_onset      ON symptom_reports(onset_date);
CREATE INDEX IF NOT EXISTS idx_sr_reporter   ON symptom_reports(reporter_role);
CREATE INDEX IF NOT EXISTS idx_sr_created    ON symptom_reports(created_at);
CREATE INDEX IF NOT EXISTS idx_sr_patient    ON symptom_reports(patient_id);

-- ── Symptom signal definitions ────────────────────────────────
CREATE TABLE IF NOT EXISTS symptom_signals (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_name      VARCHAR(100) NOT NULL,
  possible_condition VARCHAR(100) NOT NULL,
  required_symptoms TEXT[] NOT NULL,
  supporting_symptoms TEXT[],
  min_reports      INTEGER NOT NULL DEFAULT 3,
  window_days      INTEGER NOT NULL DEFAULT 14,
  alert_level      VARCHAR(20) DEFAULT 'watch'
    CHECK (alert_level IN ('watch','warning','alert')),
  is_active        BOOLEAN DEFAULT TRUE,
  doh_notifiable   BOOLEAN DEFAULT FALSE,
  notes            TEXT
);

INSERT INTO symptom_signals
  (signal_name, possible_condition, required_symptoms, supporting_symptoms, min_reports, window_days, alert_level, doh_notifiable)
VALUES
  ('Dengue-like fever',
   'Dengue (unconfirmed — clinical assessment needed)',
   ARRAY['fever','headache'],
   ARRAY['rash','joint_pain','eye_pain','nausea','vomiting','bleeding_gums'],
   3, 14, 'warning', TRUE),

  ('Severe dengue signal',
   'Severe dengue / DHF (unconfirmed — urgent assessment needed)',
   ARRAY['fever','rash','bleeding_gums'],
   ARRAY['abdominal_pain','persistent_vomiting','rapid_breathing'],
   2, 14, 'alert', TRUE),

  ('TB-like respiratory illness',
   'Pulmonary TB (unconfirmed — sputum test recommended)',
   ARRAY['cough_2weeks','night_sweats'],
   ARRAY['weight_loss','fatigue','blood_in_sputum','fever'],
   2, 30, 'warning', TRUE),

  ('Measles-like illness',
   'Measles (unconfirmed — isolation and assessment needed)',
   ARRAY['fever','rash','runny_nose'],
   ARRAY['red_eyes','cough','mouth_sores'],
   1, 14, 'alert', TRUE),

  ('Mumps-like illness',
   'Mumps (unconfirmed — assessment needed)',
   ARRAY['jaw_swelling','fever'],
   ARRAY['difficulty_chewing','neck_swelling','headache'],
   3, 14, 'watch', TRUE),

  ('Diabetes-related symptoms',
   'T2DM / pre-diabetes (unconfirmed — blood glucose test recommended)',
   ARRAY['excessive_thirst','frequent_urination'],
   ARRAY['unexplained_fatigue','blurred_vision','slow_healing_wounds','tingling_feet'],
   5, 30, 'watch', FALSE),

  ('Obesity / metabolic risk cluster',
   'Obesity and metabolic risk (BMI assessment recommended)',
   ARRAY['fatigue','shortness_of_breath_exertion'],
   ARRAY['joint_pain','back_pain','excessive_thirst','high_bp_reported'],
   5, 30, 'watch', FALSE)
ON CONFLICT DO NOTHING;

-- ── Hotspot alerts ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hotspot_alerts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id        UUID REFERENCES symptom_signals(id),
  signal_name      VARCHAR(100) NOT NULL,
  possible_condition VARCHAR(100) NOT NULL,
  barangay         VARCHAR(100) NOT NULL,
  sitio            VARCHAR(100),
  report_count     INTEGER NOT NULL,
  threshold        INTEGER NOT NULL,
  window_days      INTEGER NOT NULL,
  alert_level      VARCHAR(20) NOT NULL,
  matching_symptoms TEXT[],
  is_active        BOOLEAN DEFAULT TRUE,
  first_detected   TIMESTAMPTZ DEFAULT NOW(),
  last_updated     TIMESTAMPTZ DEFAULT NOW(),
  resolved_at      TIMESTAMPTZ,
  resolved_by      UUID REFERENCES users(id),
  resolution_notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_ha_active    ON hotspot_alerts(is_active);
CREATE INDEX IF NOT EXISTS idx_ha_barangay  ON hotspot_alerts(barangay);
CREATE INDEX IF NOT EXISTS idx_ha_signal    ON hotspot_alerts(signal_id);

-- ── AI surveillance reports ───────────────────────────────────
CREATE TABLE IF NOT EXISTS surveillance_reports (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  generated_by    UUID REFERENCES users(id),
  trigger_type    VARCHAR(20) NOT NULL
    CHECK (trigger_type IN ('manual','scheduled','threshold')),
  period_days     INTEGER NOT NULL DEFAULT 30,
  barangay_filter TEXT[],
  ai_summary      TEXT NOT NULL,
  hotspots_identified JSONB,
  possible_conditions JSONB,
  recommendations JSONB,
  alert_level     VARCHAR(20) DEFAULT 'normal'
    CHECK (alert_level IN ('normal','watch','warning','alert')),
  total_reports   INTEGER,
  unique_patients INTEGER,
  barangays_affected INTEGER,
  stats_snapshot  JSONB,
  model_used      VARCHAR(50),
  generated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── Health metrics ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS health_metrics (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id        UUID REFERENCES patients(id) ON DELETE CASCADE,
  recorded_by       UUID REFERENCES users(id),
  height_cm         NUMERIC(5,1),
  weight_kg         NUMERIC(5,1),
  bmi               NUMERIC(4,1),
  bmi_category      VARCHAR(20),
  waist_cm          NUMERIC(5,1),
  diet_quality      VARCHAR(20),
  activity_level    VARCHAR(20),
  smoker            BOOLEAN,
  alcohol_use       VARCHAR(20),
  barangay          VARCHAR(100),
  sitio             VARCHAR(100),
  assessed_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hm_patient   ON health_metrics(patient_id);
CREATE INDEX IF NOT EXISTS idx_hm_barangay  ON health_metrics(barangay);
CREATE INDEX IF NOT EXISTS idx_hm_date      ON health_metrics(assessed_at);

-- =============================================================
-- RICH SEED DATA — 30 symptom reports across 4 barangays
-- Designed to trigger dengue hotspot in Sibaltan + TB signal
-- in El Nido Poblacion + NCD cluster in Corong-Corong
-- =============================================================

INSERT INTO symptom_reports
  (patient_id, reporter_id, reporter_role, barangay, sitio, symptoms,
   onset_date, duration_days, severity, temperature_c, is_child,
   has_travel_history, travel_location, source, notes)
VALUES

-- ── SIBALTAN CLUSTER — Dengue-like (8 reports, 14 days) ──────
-- Designed to trigger "warning" hotspot alert
('b0000000-0000-0000-0000-000000000001',
 'a0000000-0000-0000-0000-000000000002', 'chw',
 'Sibaltan', 'Sitio Buena Vista',
 ARRAY['fever','headache','joint_pain','eye_pain'],
 CURRENT_DATE - 12, 12, 'moderate', 38.9, FALSE, FALSE, NULL,
 'home_visit', 'Patient reports fever started suddenly 12 days ago. Joint pain severe, difficulty walking.'),

('b0000000-0000-0000-0000-000000000002',
 'a0000000-0000-0000-0000-000000000002', 'chw',
 'Sibaltan', 'Sitio Buena Vista',
 ARRAY['fever','rash','headache','nausea','joint_pain'],
 CURRENT_DATE - 10, 10, 'moderate', 39.1, FALSE, FALSE, NULL,
 'home_visit', 'Rash appeared day 3 of fever. Patient is neighbour of case 1.'),

(NULL,
 'a0000000-0000-0000-0000-000000000002', 'chw',
 'Sibaltan', 'Sitio Buena Vista',
 ARRAY['fever','headache','bleeding_gums','joint_pain'],
 CURRENT_DATE - 9, 9, 'severe', 39.4, FALSE, FALSE, NULL,
 'home_visit', 'CONCERN: bleeding gums noted. Same household as 2nd case. Referred to clinic.'),

(NULL,
 'a0000000-0000-0000-0000-000000000002', 'chw',
 'Sibaltan', 'Sitio Buena Vista',
 ARRAY['fever','rash','nausea','vomiting','abdominal_pain'],
 CURRENT_DATE - 8, 8, 'severe', 39.8, TRUE, FALSE, NULL,
 'home_visit', 'Child, 8 years old. Vomiting for 2 days. Parents report stagnant water near house.'),

(NULL,
 'a0000000-0000-0000-0000-000000000002', 'chw',
 'Sibaltan', 'Sitio Malamig',
 ARRAY['fever','headache','joint_pain','eye_pain','rash'],
 CURRENT_DATE - 7, 7, 'moderate', 38.7, FALSE, FALSE, NULL,
 'home_visit', 'Classic dengue presentation. Patient works near mangrove area with mosquito breeding sites.'),

(NULL,
 'a0000000-0000-0000-0000-000000000002', 'chw',
 'Sibaltan', 'Sitio Malamig',
 ARRAY['fever','headache','joint_pain','fatigue'],
 CURRENT_DATE - 6, 6, 'mild', 38.2, FALSE, FALSE, NULL,
 'home_visit', 'Neighbour of case 5. Milder presentation. Drinking lots of water.'),

(NULL,
 'a0000000-0000-0000-0000-000000000001', 'patient',
 'Sibaltan', NULL,
 ARRAY['fever','headache','rash','nausea'],
 CURRENT_DATE - 5, 5, 'moderate', 38.8, FALSE, FALSE, NULL,
 'app', 'Self-reported via app. Same barangay as cluster.'),

(NULL,
 'a0000000-0000-0000-0000-000000000002', 'chw',
 'Sibaltan', 'Sitio Buena Vista',
 ARRAY['fever','bleeding_gums','persistent_vomiting','abdominal_pain'],
 CURRENT_DATE - 3, 3, 'severe', 40.1, TRUE, FALSE, NULL,
 'home_visit', 'URGENT: Child 6yo, severe dengue warning signs. Referred to El Nido Community Hospital immediately.'),

-- ── EL NIDO POBLACION — TB-like signal (4 reports, 30 days) ──
(NULL,
 'a0000000-0000-0000-0000-000000000002', 'chw',
 'El Nido Poblacion', NULL,
 ARRAY['cough_2weeks','night_sweats','weight_loss','fatigue'],
 CURRENT_DATE - 28, 28, 'moderate', 37.8, FALSE, FALSE, NULL,
 'home_visit', 'Productive cough for 4 weeks. Night sweats every night. Lost approximately 5kg. Lives in crowded boarding house.'),

(NULL,
 'a0000000-0000-0000-0000-000000000002', 'chw',
 'El Nido Poblacion', NULL,
 ARRAY['cough_2weeks','night_sweats','blood_in_sputum','fever'],
 CURRENT_DATE - 21, 21, 'severe', 38.3, FALSE, FALSE, NULL,
 'home_visit', 'CONCERN: blood-tinged sputum. Shares room with 4 others. Contact of first TB-like case in poblacion.'),

(NULL,
 'a0000000-0000-0000-0000-000000000002', 'chw',
 'El Nido Poblacion', 'Sitio Masikap',
 ARRAY['cough_2weeks','fatigue','weight_loss','loss_of_appetite'],
 CURRENT_DATE - 14, 14, 'mild', 37.4, FALSE, FALSE, NULL,
 'home_visit', 'Chronic cough, milder. Works at same site as 2nd case. Referred for sputum test.'),

('b0000000-0000-0000-0000-000000000002',
 'a0000000-0000-0000-0000-000000000002', 'chw',
 'El Nido Poblacion', NULL,
 ARRAY['cough_2weeks','night_sweats','fatigue','fever'],
 CURRENT_DATE - 7, 7, 'moderate', 38.1, FALSE, FALSE, NULL,
 'home_visit', '4th case this month in Poblacion with TB-like symptoms. All in close proximity.'),

-- ── CORONG-CORONG — Diabetes/NCD cluster (6 reports) ─────────
('b0000000-0000-0000-0000-000000000003',
 'a0000000-0000-0000-0000-000000000001', 'patient',
 'Corong-Corong', NULL,
 ARRAY['excessive_thirst','frequent_urination','unexplained_fatigue','blurred_vision'],
 CURRENT_DATE - 20, 20, 'mild', NULL, FALSE, FALSE, NULL,
 'app', 'Known T2DM patient. HbA1c was 8.9% last check. Drinking 4-5L water daily. Vision blurry last 2 weeks.'),

(NULL,
 'a0000000-0000-0000-0000-000000000002', 'chw',
 'Corong-Corong', 'Sitio Balayong',
 ARRAY['excessive_thirst','frequent_urination','unexplained_fatigue','slow_healing_wounds'],
 CURRENT_DATE - 18, 18, 'mild', NULL, FALSE, FALSE, NULL,
 'home_visit', 'Patient unaware of diabetes. Wound on foot not healing for 3 weeks. Strong family history of diabetes.'),

(NULL,
 'a0000000-0000-0000-0000-000000000002', 'chw',
 'Corong-Corong', 'Sitio Balayong',
 ARRAY['excessive_thirst','frequent_urination','tingling_feet','fatigue'],
 CURRENT_DATE - 15, 15, 'mild', NULL, FALSE, FALSE, NULL,
 'home_visit', 'Neighbour of previous case. Tingling and numbness in feet. Never had blood glucose tested.'),

(NULL,
 'a0000000-0000-0000-0000-000000000002', 'chw',
 'Corong-Corong', NULL,
 ARRAY['unexplained_fatigue','blurred_vision','high_bp_reported','shortness_of_breath_exertion'],
 CURRENT_DATE - 10, 10, 'moderate', NULL, FALSE, FALSE, NULL,
 'home_visit', 'BP measured 158/96 at home visit. BMI approximately 31. Sedentary lifestyle, diet high in white rice.'),

(NULL,
 'a0000000-0000-0000-0000-000000000002', 'chw',
 'Corong-Corong', 'Sitio Balayong',
 ARRAY['excessive_thirst','frequent_urination','fatigue','loss_of_appetite'],
 CURRENT_DATE - 8, 8, 'mild', NULL, FALSE, TRUE, 'Coron, Palawan',
 'home_visit', 'Returned from Coron 3 weeks ago. NCD risk assessment needed. No prior testing.'),

(NULL,
 'a0000000-0000-0000-0000-000000000001', 'patient',
 'Corong-Corong', NULL,
 ARRAY['excessive_thirst','frequent_urination','blurred_vision','tingling_feet','slow_healing_wounds'],
 CURRENT_DATE - 5, 5, 'moderate', NULL, FALSE, FALSE, NULL,
 'app', '5 NCD symptoms reported. Self-reported via app after seeing health poster. Requesting blood glucose test.'),

-- ── LIO — Mixed/Travel-related (4 reports) ────────────────────
(NULL,
 'a0000000-0000-0000-0000-000000000002', 'chw',
 'Lio', NULL,
 ARRAY['fever','headache','rash','joint_pain'],
 CURRENT_DATE - 6, 6, 'moderate', 38.6, FALSE, TRUE, 'Puerto Princesa',
 'home_visit', 'Returned from Puerto Princesa 8 days ago. Dengue-like symptoms. Works in tourism.'),

(NULL,
 'a0000000-0000-0000-0000-000000000002', 'chw',
 'Lio', NULL,
 ARRAY['fever','nausea','vomiting','diarrhoea','abdominal_pain'],
 CURRENT_DATE - 4, 4, 'moderate', 38.4, FALSE, TRUE, 'Manila',
 'home_visit', 'Returned from Manila 5 days ago. GI symptoms. Works at resort.'),

(NULL,
 'a0000000-0000-0000-0000-000000000002', 'chw',
 'Lio', 'Sitio Airport',
 ARRAY['fever','headache','joint_pain'],
 CURRENT_DATE - 3, 3, 'mild', 37.9, FALSE, FALSE, NULL,
 'home_visit', 'Airport area. 3rd fever+headache+joint pain in Lio this week. Possible spillover from Sibaltan cluster.'),

(NULL,
 'a0000000-0000-0000-0000-000000000001', 'patient',
 'Lio', NULL,
 ARRAY['fever','rash','headache'],
 CURRENT_DATE - 2, 2, 'mild', 38.1, FALSE, FALSE, NULL,
 'app', 'Self-reported. Tourist area. 2-day illness.'),

-- ── BACUIT — Measles signal (3 reports — threshold met) ───────
(NULL,
 'a0000000-0000-0000-0000-000000000002', 'chw',
 'Bacuit', 'Sitio Calamansian',
 ARRAY['fever','rash','runny_nose','red_eyes'],
 CURRENT_DATE - 9, 9, 'moderate', 38.9, TRUE, FALSE, NULL,
 'home_visit', 'Child 4yo. Koplik spots observed in mouth. Classic measles presentation. Vaccination status unknown.'),

(NULL,
 'a0000000-0000-0000-0000-000000000002', 'chw',
 'Bacuit', 'Sitio Calamansian',
 ARRAY['fever','rash','cough','runny_nose','red_eyes'],
 CURRENT_DATE - 7, 7, 'moderate', 39.2, TRUE, FALSE, NULL,
 'home_visit', 'Sibling of first case, 7yo. Same household. Koplik spots also present. School contacted.'),

(NULL,
 'a0000000-0000-0000-0000-000000000002', 'chw',
 'Bacuit', 'Sitio Calamansian',
 ARRAY['fever','rash','runny_nose','mouth_sores','cough'],
 CURRENT_DATE - 5, 5, 'moderate', 39.0, TRUE, FALSE, NULL,
 'home_visit', 'Classmate of 2nd case, 6yo. 3 measles-like cases in same sitio in 9 days. ALERT.'),

-- ── Additional recent reports to enrich trend data ────────────
(NULL,
 'a0000000-0000-0000-0000-000000000002', 'chw',
 'Sibaltan', 'Sitio Buena Vista',
 ARRAY['fever','headache','fatigue'],
 CURRENT_DATE - 1, 1, 'mild', 37.8, FALSE, FALSE, NULL,
 'home_visit', 'New fever case in same sitio as dengue cluster. Monitoring closely.'),

(NULL,
 'a0000000-0000-0000-0000-000000000002', 'chw',
 'El Nido Poblacion', 'Sitio Masikap',
 ARRAY['cough_2weeks','fatigue','night_sweats'],
 CURRENT_DATE - 2, 2, 'mild', 37.5, FALSE, FALSE, NULL,
 'home_visit', '5th TB-like case in Poblacion. All within 500m radius. Sputum testing urgently needed.'),

(NULL,
 'a0000000-0000-0000-0000-000000000002', 'chw',
 'Bacuit', 'Sitio Calamansian',
 ARRAY['fever','rash','runny_nose'],
 CURRENT_DATE - 2, 2, 'mild', 38.5, TRUE, FALSE, NULL,
 'home_visit', '4th child in Calamansian with rash+fever. School closure being considered.'),

(NULL,
 'a0000000-0000-0000-0000-000000000001', 'patient',
 'Corong-Corong', NULL,
 ARRAY['high_bp_reported','fatigue','shortness_of_breath_exertion','blurred_vision'],
 CURRENT_DATE - 1, 1, 'moderate', NULL, FALSE, FALSE, NULL,
 'app', 'BP 165/98 self-measured. Feeling very tired. 2nd hypertension-related report from Corong-Corong this week.')

ON CONFLICT DO NOTHING;

-- ── Health metrics seed ───────────────────────────────────────
INSERT INTO health_metrics
  (patient_id, recorded_by, height_cm, weight_kg, bmi, bmi_category,
   waist_cm, diet_quality, activity_level, smoker, alcohol_use, barangay, assessed_at)
VALUES
  ('b0000000-0000-0000-0000-000000000001',
   'a0000000-0000-0000-0000-000000000002',
   155, 72.0, 30.0, 'obese', 95.0, 'poor', 'sedentary', FALSE, 'none',
   'Sibaltan', NOW() - INTERVAL '5 days'),

  ('b0000000-0000-0000-0000-000000000002',
   'a0000000-0000-0000-0000-000000000002',
   165, 70.1, 25.8, 'overweight', 88.0, 'fair', 'light', FALSE, 'occasional',
   'El Nido Poblacion', NOW() - INTERVAL '10 days'),

  ('b0000000-0000-0000-0000-000000000003',
   'a0000000-0000-0000-0000-000000000002',
   150, 72.3, 32.1, 'obese', 102.0, 'poor', 'sedentary', FALSE, 'none',
   'Corong-Corong', NOW() - INTERVAL '3 days'),

  -- Additional unregistered assessments
  (NULL, 'a0000000-0000-0000-0000-000000000002',
   158, 68.0, 27.2, 'overweight', 90.0, 'fair', 'sedentary', TRUE, 'regular',
   'Corong-Corong', NOW() - INTERVAL '7 days'),

  (NULL, 'a0000000-0000-0000-0000-000000000002',
   162, 85.0, 32.4, 'obese', 106.0, 'poor', 'sedentary', FALSE, 'occasional',
   'Corong-Corong', NOW() - INTERVAL '4 days'),

  (NULL, 'a0000000-0000-0000-0000-000000000002',
   170, 62.0, 21.5, 'normal', 78.0, 'good', 'moderate', FALSE, 'none',
   'Sibaltan', NOW() - INTERVAL '6 days'),

  (NULL, 'a0000000-0000-0000-0000-000000000002',
   155, 80.0, 33.3, 'obese', 108.0, 'poor', 'sedentary', FALSE, 'none',
   'Lio', NOW() - INTERVAL '8 days')
ON CONFLICT DO NOTHING;

