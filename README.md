# 🏥 Rural Care Connect (RCC)

> A symptom-based telehealth and disease surveillance platform for elderly patients in geographically isolated and disadvantaged areas (GIDA) of the Philippines.

Built for the **Rural Care Connect Project** — a geriatric hybrid care initiative for remote island communities in El Nido, Palawan. Project partners include Ayala Foundation, Filipino Australian Health Professionals Inc. (FAHPi), and Harvard Medical School (affiliated).

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
![Stack](https://img.shields.io/badge/stack-React%20%7C%20Node.js%20%7C%20PostgreSQL%20%7C%20Docker-blue)
![AI](https://img.shields.io/badge/AI-Ollama%20%7C%20Claude-purple)
![Status](https://img.shields.io/badge/status-MVP%20Demo-orange)

---

## 📋 Table of Contents

- [Changelog](#changelog)
- [Overview](#overview)
- [Architecture](#architecture)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Configurable AI Provider](#-configurable-ai-provider)
- [Deployment — Local / Ubuntu](#-local--ubuntu-deployment)
- [Deployment — Google Cloud](#-google-cloud-platform-deployment)
- [HTTPS Setup](#https-certificate-setup)
- [Elastic Observability](#elastic-observability-otel)
- [Disease Surveillance](#disease-surveillance)
- [Demo Accounts](#demo-accounts)
- [Project Structure](#project-structure)
- [API Reference](#api-reference)
- [Security](#security)
- [Compliance](#compliance)
- [Production Roadmap](#production-roadmap)

---

## Changelog

### v2.0 — Surveillance Release
- **Symptom-based disease surveillance** — patients and CHWs report symptoms with barangay + sitio location. No diagnosis required.
- **AI hotspot detection** — configurable signal thresholds per disease (dengue, TB, measles, mumps, T2DM). Auto-creates alerts when thresholds crossed.
- **AI surveillance reports** — Gemma 4 / Claude generates structured 8-section DOH-aligned epidemiological briefs with individual CHW field notes injected.
- **Configurable AI provider** — admin can switch between Ollama (local, private) and Claude API (fast, cloud) from the Admin Dashboard with no restart.
- **Health metrics tracking** — BMI, obesity, lifestyle risk factors recorded by CHW per visit.
- **Role-aware surveillance tabs** — patients see symptom form only; CHW/clinician/admin see full dashboard.
- **30 rich seed reports** across 5 barangays pre-loaded to trigger hotspot alerts for demo.

### v1.0 — Telehealth Core
- JWT authentication with 4 roles (patient, chw, clinician, admin)
- Vitals tracking with offline CHW sync
- Teleconsultations with prescriptions
- AI pre-screening triage (bilingual Filipino/English) via Ollama
- OpenTelemetry → Elastic Cloud APM observability
- HTTPS with self-signed TLS, security headers, rate limiting
- RA 10173 compliant append-only audit log

---

## Overview

Rural Care Connect connects four user roles across a secure HTTPS interface:

| Role | Key capabilities |
|---|---|
| **Patient** | Health record, consultations, AI pre-screening, symptom self-reporting |
| **CHW** | Patient list, vitals entry, offline queue, symptom reporting from home visits, surveillance overview |
| **Clinician** | Consultations, diagnoses, prescriptions, surveillance dashboard, AI report generation |
| **Admin** | Dashboard, audit log, AI triage monitoring, disease surveillance, **configurable AI provider** |

The platform runs **fully on-premises** by default — AI inference via [Ollama](https://ollama.com) requires no external API and patient data never leaves the server. An optional Claude API integration is available for faster reporting.

---

## Architecture

```
Browser
  │
  ▼ HTTPS :3443
┌──────────────────────────────────────────┐
│  rcc_frontend (nginx)                    │
│  React SPA + proxies /api to backend     │
│  Port 3000 → redirects to HTTPS          │
│  Port 3443 → TLS termination             │
└───────────────┬──────────────────────────┘
                │ :4000
                ▼
┌──────────────────────────────────────────┐
│  rcc_backend (Node.js / Express)         │
│  JWT · RBAC · Audit log                  │
│  OpenTelemetry → Elastic Cloud           │
│  ┌─────────────────────────────────────┐ │
│  │  llm.js — Shared AI client         │ │
│  │  Routes to Ollama OR Claude        │ │
│  │  based on admin settings in DB     │ │
│  └─────────────────────────────────────┘ │
└──────┬────────────────────────┬──────────┘
       │                        │
       ▼ :5432                  ▼ :11434
┌─────────────┐      ┌──────────────────────┐
│  rcc_db     │      │  rcc_ollama          │
│ PostgreSQL  │      │  Gemma 4 E2B/E4B     │
│ 16-alpine   │      │  CPU inference       │
└─────────────┘      └──────────────────────┘
                              OR
                    ┌──────────────────────┐
                    │  Anthropic Claude API│
                    │  (when configured)   │
                    └──────────────────────┘
```

---

## Features

| Feature | Details |
|---|---|
| 🔐 JWT Auth + RBAC | Role-scoped access — every route enforces role whitelist |
| 📊 Vitals tracking | BP, glucose, HbA1c, weight — server-side range validation |
| 📡 Offline vitals sync | CHW queue works without signal, syncs on reconnect |
| 🩺 Teleconsultations | Book, join, document, prescribe in one flow |
| 🤖 AI pre-screening | 9-step bilingual triage (Filipino/English) |
| 🚨 Emergency bypass | 30+ keywords EN + Filipino — instant, no AI latency |
| 🦠 Symptom surveillance | Structured symptom reporting with barangay/sitio location |
| 📍 Hotspot detection | Configurable signal thresholds, auto-alert on threshold breach |
| 📋 AI surveillance report | 8-section DOH-aligned epidemiological brief with CHW field notes |
| ⚙️ **Configurable AI provider** | **Admin switches Ollama ↔ Claude API in-app, no restart needed** |
| ⚖️ Health metrics | BMI, obesity, lifestyle risk tracked per CHW visit |
| 📋 Audit log | Append-only RA 10173-compliant trail |
| 🔒 HTTPS | Self-signed TLS, HTTP→HTTPS redirect, security headers |
| 📈 Observability | OpenTelemetry → Elastic Cloud APM + structured ECS JSON logs |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, Recharts |
| Backend | Node.js 20, Express 4 |
| Database | PostgreSQL 16 |
| AI — local | Ollama + Gemma 4 E2B (7.2GB) or E4B (9.6GB) |
| AI — cloud | Anthropic Claude API (sonnet-4-6 / opus-4-6 / haiku-4-5) |
| Reverse proxy | nginx (TLS 1.2/1.3, rate limiting, JSON access logs) |
| Observability | OpenTelemetry SDK → Elastic Cloud APM |
| Containers | Docker + Docker Compose |

---

## ⚙️ Configurable AI Provider

RCC supports two AI backends for both triage and surveillance reports. The admin can switch between them live from the dashboard — no code change, no restart required.

### How to switch

1. Log in as **admin@demo.rcc**
2. Go to **Dashboard → ⚙️ LLM Settings** tab
3. Click **Ollama (Local)** or **Claude (Anthropic)**
4. Select the model from the dropdown
5. If using Claude, paste your `sk-ant-` API key
6. Click **Save settings**
7. Click **Test connection** to verify

Changes take effect on the next AI request (60-second settings cache).

### Provider comparison

| Feature | Ollama (Local) | Claude (API) |
|---|---|---|
| Speed — triage reply | ~30–60 seconds | ~3–8 seconds |
| Speed — surveillance report | ~3–5 minutes | ~15–30 seconds |
| Cost | Free (electricity only) | ~$0.003 per report |
| Data privacy | 100% on-server | Sent to Anthropic API |
| Report quality | Good (Gemma 4) | Excellent |
| Internet required | No — works offline | Yes |
| Best for | Production in GIDA | Demo / fast reporting |

### API key configuration

The Claude API key can be set two ways — whichever is present takes priority:

```bash
# Option A — environment variable (more secure, set in .env)
ANTHROPIC_API_KEY=sk-ant-api03-...

# Option B — admin UI (stored in DB, masked on read)
# Admin → LLM Settings → paste key → Save
```

If both are set, the DB value overrides the env var.

### Supported Claude models

| Model | Best for |
|---|---|
| `claude-sonnet-4-6` | Recommended — fast, smart, cost-effective |
| `claude-opus-4-6` | Highest quality, slower, higher cost |
| `claude-haiku-4-5` | Fastest, lightest, lowest cost |

### Supported Ollama models

| Model | RAM required | Best for |
|---|---|---|
| `gemma4:e2b` | 7.2GB | 12–16GB RAM servers |
| `gemma4:e4b` | 9.6GB | 16GB+ RAM (recommended) |
| `llama3.2:3b` | 2GB | Very low RAM, fastest CPU inference |

---

## 🖥️ Local / Ubuntu Deployment

### Prerequisites

- Ubuntu 20.04+ (kernel 6.8+ tested)
- Docker Engine + Docker Compose plugin
- OpenSSL (pre-installed on Ubuntu)
- **16GB RAM recommended** (`gemma4:e4b` uses ~9.6GB)
- Ports 3000, 3443, 4000, 5432, 11434 free

```bash
# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER && newgrp docker
```

### Steps

```bash
# 1. Clone
git clone https://github.com/mikecali/rural-care-connect.git
cd rural-care-connect

# 2. Generate TLS certificate — replace with your actual LAN IP
chmod +x generate-certs.sh
./generate-certs.sh 192.168.68.119

# 3. Configure (optional — app works without OTEL)
cp .env.example .env
# Edit .env with Elastic Cloud credentials

# 4. Start
docker compose up --build
# First run: Gemma 4 downloads (~9.6GB) — takes 10–15 min
# Subsequent starts: instant (cached in Docker volume)

# 5. Open
# https://192.168.68.119:3443
# Browser warns about self-signed cert → Advanced → Proceed
```

---

## ☁️ Google Cloud Platform Deployment

### Recommended machine types

| Use case | Machine | RAM | Disk | Cost/month |
|---|---|---|---|---|
| Demo | `n4-standard-4` | 16GB | pd-ssd 50GB | ~$97 |
| **Recommended** | **`n4-standard-8`** | **32GB** | **pd-ssd 50GB** | **~$195** |
| High-quality AI | `c4-standard-8` | 32GB | pd-ssd 50GB | ~$240 |

> ⚠️ **N4 requires `pd-ssd`** — `pd-balanced` is rejected with an error.
> ⚠️ **GCP Xeon 8581C has AMX extensions** that segfault with `ollama:latest` in Docker. Always pin `ollama:0.3.14` on GCP.

### Create VM and deploy

```bash
# Create VM
gcloud compute instances create rcc-server \
  --machine-type=n4-standard-8 \
  --image-family=ubuntu-2204-lts \
  --image-project=ubuntu-os-cloud \
  --boot-disk-size=50GB \
  --boot-disk-type=pd-ssd \
  --zone=asia-southeast1-a \
  --tags=http-server,https-server

# Open firewall
gcloud compute firewall-rules create rcc-allow \
  --allow tcp:3000,tcp:3443 \
  --target-tags=http-server,https-server

# SSH in
gcloud compute ssh rcc-server --zone=asia-southeast1-a

# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER && newgrp docker

# Clone and setup
git clone https://github.com/mikecali/rural-care-connect.git
cd rural-care-connect
./generate-certs.sh $(curl -s ifconfig.me)
```

### Critical: Pin Ollama version for GCP Xeon

```bash
sed -i 's|image: ollama/ollama:latest|image: ollama/ollama:0.3.14|' docker-compose.yml
docker compose up --build
```

Verify it loaded correctly (no AMX segfault):
```bash
docker logs rcc_ollama | grep "load_tensors"
# ✅ Good:  load_tensors:   CPU model buffer size =   618.98 MiB
# ❌ Bad:   load_tensors:   AMX model buffer size =  1953.78 MiB
```

---

## HTTPS Certificate Setup

```bash
# Automated (recommended)
./generate-certs.sh YOUR_IP

# Manual
mkdir -p nginx/certs
openssl req -x509 -nodes -newkey rsa:2048 \
  -keyout nginx/certs/server.key \
  -out    nginx/certs/server.crt \
  -days   825 \
  -subj   "/C=PH/ST=Palawan/L=El Nido/O=RuralCareConnect/CN=YOUR_IP" \
  -addext "subjectAltName=IP:YOUR_IP,IP:127.0.0.1"
```

> **Important:** AI surveillance reports take 3–5 minutes to generate with Ollama. Ensure `nginx/conf.d/rcc.conf` has `proxy_read_timeout 360s;` to avoid 504 timeouts. With Claude API this drops to ~20 seconds.

---

## Elastic Observability (OTEL)

```bash
# 1. Create .env
cat > .env << EOF
OTEL_EXPORTER_OTLP_ENDPOINT=https://YOUR-CLUSTER.ingest.REGION.aws.elastic-cloud.com:443
OTEL_EXPORTER_OTLP_HEADERS=Authorization=ApiKey YOUR_KEY==
OTEL_RESOURCE_ATTRIBUTES=service.name=RCC-care-connect,service.version=1.0.0,deployment.environment=production
EOF

# 2. Rebuild and restart backend
docker compose up --build backend

# 3. Verify
docker logs rcc_backend | grep otel
```

| Data | Kibana location |
|---|---|
| APM traces | Observability → APM → Services → `RCC-care-connect` |
| PostgreSQL spans | APM → Transactions → Dependencies |
| ECS structured logs | Logs → Stream → `service.name: RCC-care-connect` |
| Surveillance reports | Logs → filter `event.action: generate_surveillance_report` |
| AI provider used | Logs → `model_used` field on each report |

---

## Disease Surveillance

### Design principle

> Detection of disease can only be done with blood work. Reporting of **symptoms** by patients and CHWs is the key to gather early signal data. AI interprets patterns — it never states unconfirmed diagnoses as fact.

### How it works

1. **Patient** or **CHW** submits a symptom report with barangay + sitio location
2. Backend runs co-occurrence queries against configurable signal thresholds
3. When threshold crossed, a hotspot alert is created automatically
4. Admin or clinician triggers AI report generation
5. AI (Ollama or Claude) receives all symptom data + CHW field notes + hotspots
6. Produces structured 8-section DOH-aligned epidemiological brief
7. Report is saved and can be printed/downloaded as PDF

### Signal thresholds (configurable in `surveillance.js`)

| Signal | Required symptoms | Threshold | Window | Alert level | DOH notifiable |
|---|---|---|---|---|---|
| Dengue-like | fever + headache | ≥3 reports | 14 days | WARNING | Yes |
| Severe dengue | fever + rash + bleeding gums | ≥2 reports | 14 days | ALERT | Yes |
| TB-like | cough 2wks + night sweats | ≥2 reports | 30 days | WARNING | Yes |
| Measles-like | fever + rash + runny nose | ≥1 report | 14 days | ALERT | Yes |
| Mumps-like | jaw swelling + fever | ≥3 reports | 14 days | WATCH | Yes |
| Diabetes-related | excessive thirst + frequent urination | ≥5 reports | 30 days | WATCH | No |

---

## Demo Accounts

Password for all: **`Demo1234!`**

| Role | Email | What to demonstrate |
|---|---|---|
| Patient | `patient@demo.rcc` | Health record, AI pre-screening, symptom self-report form |
| CHW | `chw@demo.rcc` | Patient list, vitals, surveillance overview + symptom reporting |
| Clinician | `doctor@demo.rcc` | Consultations, surveillance dashboard, AI report generation |
| Admin | `admin@demo.rcc` | Dashboard, audit log, surveillance, **⚙️ LLM Settings** |

### Seed data — pre-loaded hotspots

30 symptom reports across 5 barangays designed to trigger multiple alerts:

| Barangay | Signal | Reports | Alert |
|---|---|---|---|
| Sibaltan / Sitio Buena Vista | Dengue-like (8 cases incl. 2 children with severe signs) | 8 | ⚠️ WARNING |
| Bacuit / Sitio Calamansian | Measles-like (Koplik spots noted in CHW observations) | 4 | 🔴 ALERT |
| El Nido Poblacion | TB-like (blood in sputum, crowded boarding house) | 5 | ⚠️ WARNING |
| Corong-Corong | NCD/diabetes cluster (undiagnosed T2DM symptoms) | 6 | 👁 WATCH |
| Lio | Mixed travel-related (dengue spillover suspected) | 4 | 👁 WATCH |

---

## Project Structure

```
rural-care-connect/
├── docker-compose.yml              # All 4 containers
├── generate-certs.sh               # TLS cert generator
├── ollama-entrypoint.sh            # Pulls AI model on first start
├── load-test.sh                    # Traffic generator for Elastic demos
├── .env.example                    # OTEL + Claude API key template
│
├── nginx/
│   ├── nginx.conf                  # Rate limiting zones
│   ├── certs/                      # ← git-ignored (generate locally)
│   └── conf.d/rcc.conf             # HTTPS, headers, proxy_read_timeout 360s
│
├── backend/
│   └── src/
│       ├── index.js                # Express app + all route registration
│       ├── otel.js                 # OpenTelemetry SDK
│       ├── lib/
│       │   └── llm.js              # ← NEW: Shared AI client (Ollama + Claude)
│       ├── db/
│       │   ├── init.sql            # Core schema + seed + app_settings table
│       │   └── surveillance.sql   # Surveillance schema + 30 seed reports
│       ├── middleware/
│       │   ├── auth.js             # JWT + RBAC
│       │   ├── audit.js            # Append-only audit logger
│       │   └── logger.js           # ECS structured JSON
│       └── routes/
│           ├── auth.js
│           ├── patients.js
│           ├── vitals.js
│           ├── consultations.js
│           ├── admin.js
│           ├── triage.js           # AI pre-screening → uses llm.js
│           ├── surveillance.js     # Symptom reports + hotspot detection + AI report → uses llm.js
│           └── settings.js         # ← NEW: Admin-only LLM provider config
│
└── frontend/
    └── src/
        ├── components/
        │   └── AppShell.jsx        # Sidebar + role-based page routing
        └── pages/
            ├── LoginPage.jsx
            ├── RegisterPage.jsx
            ├── PatientPortal.jsx
            ├── CHWPage.jsx
            ├── ClinicianPage.jsx
            ├── AdminDashboard.jsx  # ← UPDATED: + ⚙️ LLM Settings tab
            ├── TriagePage.jsx
            └── SurveillanceDashboard.jsx  # ← NEW: 4-tab surveillance UI
```

---

## API Reference

Base URL: `https://YOUR_IP:3443/api`

### Core

| Method | Path | Roles | Description |
|---|---|---|---|
| POST | `/auth/login` | Public | Login → JWT |
| POST | `/auth/register` | Public | Patient self-registration |
| GET | `/patients/me` | patient | Own record |
| GET | `/patients` | chw, clinician, admin | All patients |
| POST | `/vitals` | chw, clinician | Record vitals |
| GET | `/consultations` | all | Role-scoped list |
| POST | `/triage/chat` | patient, chw, clinician | AI pre-screening message |
| GET | `/triage/status` | all | AI readiness check |

### Surveillance

| Method | Path | Roles | Description |
|---|---|---|---|
| GET | `/surveillance/symptoms` | all | Master symptom list for UI |
| POST | `/surveillance/report-symptoms` | patient, chw, clinician | Submit symptom report |
| GET | `/surveillance/symptom-reports` | admin, clinician, chw | List reports |
| GET | `/surveillance/summary` | admin, clinician, chw | Stats + active hotspots |
| GET | `/surveillance/hotspots` | admin, clinician | Active hotspot alerts |
| POST | `/surveillance/generate-report` | admin, clinician | Trigger AI report generation |
| GET | `/surveillance/ai-reports` | admin, clinician | List saved AI reports |
| POST | `/surveillance/health-metrics` | chw, clinician | Record BMI/lifestyle data |

### Settings (admin only)

| Method | Path | Description |
|---|---|---|
| GET | `/settings` | Current LLM settings (API key masked) |
| PATCH | `/settings` | Update provider / model / API key |
| GET | `/settings/llm-status` | Live health check on active provider |

### Admin

| Method | Path | Description |
|---|---|---|
| GET | `/admin/stats` | Dashboard statistics |
| GET | `/admin/audit` | Audit log (filterable) |
| GET | `/admin/security` | Failed logins, off-hours access |
| GET | `/health` | Service health check |

---

## Security

- HTTPS / TLS 1.2+ with HSTS, X-Frame-Options DENY, X-Content-Type-Options, CSP
- HTTP → HTTPS redirect (port 3000 → 3443)
- JWT HS256 + RBAC — role verified on every protected route
- bcryptjs password hashing (cost factor 10)
- Append-only audit log — DB INSERT only, no UPDATE/DELETE possible
- Rate limiting — nginx: 10 req/min auth, 60 req/min API, 20 req/min triage
- IP addresses SHA-256 hashed before audit storage
- Claude API key masked on read (shows last 6 chars only, stored in DB)
- Emergency keyword bypass fires before AI model (instant, no latency)

### Production hardening required

- [ ] MFA via AWS Cognito (SMS OTP — Globe/Smart/DITO)
- [ ] AES-256-GCM column encryption on all SPI fields
- [ ] JWT 15-min expiry + refresh token rotation
- [ ] Let's Encrypt TLS for production domain

---

## Compliance

| Regulation | Implementation |
|---|---|
| **RA 10173** (Data Privacy Act) | Layered consent on registration, append-only audit, patient rights flows, IP hashing |
| **RA 6675** (Generics Act) | Generic drug name required on all prescriptions — 400 error if omitted |
| **DOH Telemedicine Guidelines** | Emergency disclaimer on all triage screens |
| **DOH PIDSR** | Surveillance AI report includes mandatory notification assessment table |
| **PhilHealth** | PIN collected at registration as SPI |

---

## Useful Commands

```bash
# All logs
docker compose logs -f

# Check current AI provider
docker exec rcc_db psql -U rcc_user -d rcc_demo \
  -c "SELECT key, value FROM app_settings WHERE key IN ('llm_provider','llm_model','claude_model');"

# Switch provider via DB (bypasses 60s cache — restart backend after)
docker exec rcc_db psql -U rcc_user -d rcc_demo \
  -c "UPDATE app_settings SET value = 'claude' WHERE key = 'llm_provider';"
docker restart rcc_backend

# Check active hotspots
docker exec rcc_db psql -U rcc_user -d rcc_demo \
  -c "SELECT barangay, sitio, signal_name, report_count, alert_level FROM hotspot_alerts WHERE is_active = TRUE;"

# Check symptom reports
docker exec rcc_db psql -U rcc_user -d rcc_demo \
  -c "SELECT barangay, symptoms, severity, reporter_role FROM symptom_reports ORDER BY reported_at DESC LIMIT 10;"

# Hot-patch backend file (no rebuild needed)
docker cp backend/src/routes/surveillance.js rcc_backend:/app/src/routes/surveillance.js
docker restart rcc_backend

# Generate load test traffic for Elastic
chmod +x load-test.sh && ./load-test.sh 20 https://YOUR_IP:3443

# Wipe DB and reseed
docker compose down -v && docker compose up --build
```

---

## Production Roadmap

### Phase 1 — Security
- [ ] AWS Cognito MFA (SMS OTP via Globe/Smart/DITO)
- [ ] AES-256-GCM column encryption on SPI fields
- [ ] JWT 15-min + refresh token rotation
- [ ] Let's Encrypt TLS for production domain

### Phase 2 — Philippine integrations
- [ ] PhilSys (PSA) patient identity verification
- [ ] PhilHealth eClaims API
- [ ] PRC Online clinician license verification
- [ ] DOH NEPHIS / PIDSR direct reporting integration

### Phase 3 — Clinical
- [ ] FHIR R4 resource mapping
- [ ] Electronic prescription with QR + digital signature
- [ ] Contact tracing module
- [ ] Lab result import (HL7)

### Phase 4 — Mobile
- [ ] React Native + Expo (iOS + Android)
- [ ] Expo SQLite offline vitals (replaces browser queue)
- [ ] Biometric authentication (Face ID / fingerprint)
- [ ] Push notifications for medication reminders

---

## Acknowledgements

**Project partners:** Ayala Foundation · Filipino Australian Health Professionals Inc. (FAHPi) · Harvard Medical School (affiliated)

**AI models:**
- [Gemma 4](https://ollama.com/library/gemma4) by Google, via Ollama — runs fully on-device
- [Claude](https://www.anthropic.com) by Anthropic — optional cloud API for faster generation

---

## Disclaimer

Demo MVP — **not certified for clinical use**. All patient and symptom data is synthetic.

AI-generated surveillance reports are based on symptom patterns only. No AI output constitutes a confirmed diagnosis. Clinical assessment and laboratory testing are required before any disease can be confirmed or notified to DOH.

**NOT an emergency service.** For emergencies, call El Nido Community Hospital or dial **911**.

---

## Licence

MIT — see [LICENSE](LICENSE)

---

*Built with ❤️ for remote healthcare access in Philippines.*
