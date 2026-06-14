-- Rural Care Connect Demo DB
-- All SPI fields marked with comment [SPI] - in prod these would be AES-256 encrypted at app layer

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── USERS (auth table) ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,         -- bcrypt
  role VARCHAR(20) NOT NULL CHECK (role IN ('patient','chw','clinician','admin')),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── PATIENTS ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  full_name VARCHAR(255) NOT NULL,     -- [SPI] in prod: encrypted
  date_of_birth DATE NOT NULL,         -- [SPI]
  mobile VARCHAR(20) NOT NULL,         -- [SPI]
  philhealth_no VARCHAR(50),           -- [SPI]
  address TEXT,                        -- [PD]
  barangay VARCHAR(100),
  municipality VARCHAR(100) DEFAULT 'El Nido',
  province VARCHAR(100) DEFAULT 'Palawan',
  conditions TEXT[],                   -- e.g. ['T2DM','HTN']
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── PRACTITIONERS (clinicians + CHWs) ────────────────────────────────
CREATE TABLE IF NOT EXISTS practitioners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  full_name VARCHAR(255) NOT NULL,
  role_type VARCHAR(30) NOT NULL,      -- 'clinician','chw','nurse','midwife'
  prc_license VARCHAR(50),
  specialty VARCHAR(100),
  is_verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── VITALS ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vitals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
  recorded_by UUID REFERENCES users(id),
  systolic_bp INTEGER,                 -- [SPI]
  diastolic_bp INTEGER,                -- [SPI]
  blood_glucose NUMERIC(5,1),          -- [SPI] mmol/L
  weight_kg NUMERIC(5,1),
  hba1c NUMERIC(4,1),                  -- [SPI] %
  notes TEXT,                          -- [SPI]
  sync_status VARCHAR(20) DEFAULT 'synced' CHECK (sync_status IN ('pending','syncing','synced','conflict')),
  measured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── CONSULTATIONS ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS consultations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
  practitioner_id UUID REFERENCES practitioners(id),
  chief_complaint TEXT,                -- [SPI]
  diagnosis TEXT,                      -- [SPI]
  treatment_plan TEXT,                 -- [SPI]
  status VARCHAR(20) DEFAULT 'scheduled' CHECK (status IN ('scheduled','in_progress','completed','cancelled')),
  consult_type VARCHAR(20) DEFAULT 'teleconsult' CHECK (consult_type IN ('in_person','teleconsult')),
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── PRESCRIPTIONS ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS prescriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultation_id UUID REFERENCES consultations(id) ON DELETE CASCADE,
  drug_generic_name VARCHAR(255) NOT NULL, -- RA 6675: generic name required [SPI]
  dosage VARCHAR(100),                 -- [SPI]
  frequency VARCHAR(100),
  quantity INTEGER,
  instructions TEXT,
  valid_until DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── CONSENTS ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
  consent_type VARCHAR(50) NOT NULL,   -- 'terms','data_privacy','treatment','data_sharing','research','marketing'
  consent_version VARCHAR(20) DEFAULT 'v1.0',
  granted BOOLEAN NOT NULL,
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  ip_hash VARCHAR(64),                 -- hashed for privacy
  device_hint VARCHAR(100)
);

-- ── AUDIT LOG ────────────────────────────────────────────────────────
-- Append-only: app role has INSERT only, no UPDATE/DELETE
CREATE TABLE IF NOT EXISTS audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID,
  actor_role VARCHAR(30),
  action VARCHAR(50) NOT NULL,         -- 'login','view_record','record_vitals','export_data' etc
  resource_type VARCHAR(50),
  resource_id UUID,
  outcome VARCHAR(10) DEFAULT 'success' CHECK (outcome IN ('success','failure')),
  ip_hash VARCHAR(64),
  occurred_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── SEED DATA ────────────────────────────────────────────────────────
-- Passwords are all: Demo1234! (bcrypt hashed)
INSERT INTO users (id, email, password_hash, role) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'patient@demo.rcc',   '$2a$10$8BqcQGaLwqHYBl2wZwOkY.bxSg6eYC3zm7v6L9dAT0ym5K71gWF/i', 'patient'),
  ('a0000000-0000-0000-0000-000000000002', 'chw@demo.rcc',       '$2a$10$8BqcQGaLwqHYBl2wZwOkY.bxSg6eYC3zm7v6L9dAT0ym5K71gWF/i', 'chw'),
  ('a0000000-0000-0000-0000-000000000003', 'doctor@demo.rcc',    '$2a$10$8BqcQGaLwqHYBl2wZwOkY.bxSg6eYC3zm7v6L9dAT0ym5K71gWF/i', 'clinician'),
  ('a0000000-0000-0000-0000-000000000004', 'admin@demo.rcc',     '$2a$10$8BqcQGaLwqHYBl2wZwOkY.bxSg6eYC3zm7v6L9dAT0ym5K71gWF/i', 'admin')
ON CONFLICT DO NOTHING;

INSERT INTO patients (id, user_id, full_name, date_of_birth, mobile, philhealth_no, barangay, conditions) VALUES
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
   'Maria Santos', '1952-03-15', '+63-917-555-0001', 'PH-12345678', 'Sibaltan', ARRAY['T2DM','HTN']),
  ('b0000000-0000-0000-0000-000000000002', NULL,
   'Jose Reyes', '1948-07-22', '+63-917-555-0002', 'PH-23456789', 'El Nido Poblacion', ARRAY['HTN','CIHD']),
  ('b0000000-0000-0000-0000-000000000003', NULL,
   'Lourdes Cruz', '1955-11-08', '+63-917-555-0003', 'PH-34567890', 'Corong-Corong', ARRAY['T2DM'])
ON CONFLICT DO NOTHING;

INSERT INTO practitioners (id, user_id, full_name, role_type, prc_license, specialty, is_verified) VALUES
  ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002',
   'Ana Dela Cruz', 'chw', NULL, 'Community Health', TRUE),
  ('c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000003',
   'Dr. Ricardo Mendoza', 'clinician', 'PRC-MD-2019-12345', 'Internal Medicine / Geriatrics', TRUE)
ON CONFLICT DO NOTHING;

-- Sample vitals
INSERT INTO vitals (patient_id, recorded_by, systolic_bp, diastolic_bp, blood_glucose, weight_kg, hba1c, notes, measured_at) VALUES
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 148, 92, 8.2, 62.5, 7.8, 'Reported mild headache. Medication adherence good.', NOW() - INTERVAL '7 days'),
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 142, 88, 7.6, 62.0, NULL, 'BP improving. Continue current meds.', NOW() - INTERVAL '3 days'),
  ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', 165, 98, NULL, 70.1, NULL, 'Missed meds 2 days. Counselled on adherence.', NOW() - INTERVAL '5 days'),
  ('b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000002', 130, 82, 10.4, 58.3, 8.9, 'Glucose elevated. Dietary review needed.', NOW() - INTERVAL '2 days');

-- Sample consultation
INSERT INTO consultations (id, patient_id, practitioner_id, chief_complaint, diagnosis, treatment_plan, status, consult_type, scheduled_at) VALUES
  ('d0000000-0000-0000-0000-000000000001',
   'b0000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-000000000002',
   'Follow-up on blood pressure control and diabetes management',
   'Hypertension Stage 2, Type 2 Diabetes Mellitus - suboptimal control',
   'Increase Amlodipine to 10mg OD. Continue Metformin 500mg BID. Low-salt diet reinforcement.',
   'completed', 'teleconsult',
   NOW() - INTERVAL '3 days')
ON CONFLICT DO NOTHING;

INSERT INTO prescriptions (consultation_id, drug_generic_name, dosage, frequency, quantity, instructions, valid_until) VALUES
  ('d0000000-0000-0000-0000-000000000001', 'Amlodipine', '10mg', 'Once daily (OD)', 30, 'Take in the morning with or without food.', NOW() + INTERVAL '30 days'),
  ('d0000000-0000-0000-0000-000000000001', 'Metformin', '500mg', 'Twice daily (BID)', 60, 'Take with meals to reduce GI side effects.', NOW() + INTERVAL '30 days');

-- Sample consents
INSERT INTO consents (patient_id, consent_type, granted) VALUES
  ('b0000000-0000-0000-0000-000000000001', 'terms', TRUE),
  ('b0000000-0000-0000-0000-000000000001', 'data_privacy', TRUE),
  ('b0000000-0000-0000-0000-000000000001', 'treatment', TRUE);
