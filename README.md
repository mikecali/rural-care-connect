# 🏥 Rural Care Connect

> A hybrid telehealth platform for elderly patients with Type 2 Diabetes Mellitus (T2DM) and Hypertension in geographically isolated and disadvantaged areas (GIDA) of the Philippines.

Built as an MVP demo for the **Rural Care Connect Project** — a Harvard Medical School-affiliated geriatric care initiative targeting elderly residents (60+) in remote island communities.

---

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [HTTPS Setup](#https-setup)
- [Elastic Observability (OTEL)](#elastic-observability-otel)
- [Demo Accounts](#demo-accounts)
- [Project Structure](#project-structure)
- [API Reference](#api-reference)
- [Security](#security)
- [Compliance](#compliance)
- [Load Testing](#load-testing)
- [Production Roadmap](#production-roadmap)

---

## Overview

Rural Care Connect is a **containerised, offline-capable telehealth app** that connects:

- **Patients** — view health records, book teleconsultations, use AI pre-screening
- **Community Health Workers (CHWs)** — record vitals during home visits, works offline
- **Clinicians** — manage consultations, write diagnoses, issue prescriptions
- **Administrators** — monitor platform activity, audit logs, AI triage tracking

The app includes an **AI pre-screening assistant** powered by [Ollama](https://ollama.com) running `llama3.2:3b` locally — no external AI API required. The AI conducts a 9-step structured interview in Filipino or English before each teleconsultation.

---

## Features

| Feature | Description |
|---|---|
| 🔐 JWT Authentication | Role-based access control (patient / chw / clinician / admin) |
| 📊 Vitals Tracking | CHW records BP, glucose, HbA1c, weight with range validation |
| 📡 Offline Sync | Vitals queue works without signal, syncs on reconnect |
| 🩺 Teleconsultations | Book, join, document, and prescribe from a single flow |
| 🤖 AI Pre-Screening | 9-step bilingual interview (Filipino/English) before each consult |
| 🚨 Emergency Detection | Instant bypass — 30+ emergency keywords in EN + Filipino |
| 📋 Audit Log | Append-only RA 10173-compliant audit trail |
| 🔒 HTTPS | Self-signed TLS with auto HTTP→HTTPS redirect |
| 📈 Observability | OpenTelemetry traces + structured JSON logs → Elastic Cloud |
| 🛡️ Security Dashboard | Failed login detection, off-hours access, triage emergency tracking |

---

## Architecture

```
Browser
  │
  ▼ HTTPS :3443
┌─────────────────────────────┐
│  rcc_frontend (nginx)       │  ← Serves React SPA + proxies /api
│  Port 3000 (HTTP redirect)  │
│  Port 3443 (HTTPS)          │
└────────────┬────────────────┘
             │ :4000 (internal)
             ▼
┌─────────────────────────────┐
│  rcc_backend (Node.js)      │  ← Express API, JWT, RBAC, Audit
│  OTEL → Elastic Cloud       │
└──────┬──────────────────────┘
       │                    │
       ▼ :5432              ▼ :11434
┌──────────────┐    ┌───────────────────┐
│  rcc_db      │    │  rcc_ollama       │
│  PostgreSQL  │    │  llama3.2:3b      │
│  16-alpine   │    │  CPU inference    │
└──────────────┘    └───────────────────┘
```

All containers run in a single Docker Compose network. No cloud services required for core functionality.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, Recharts, React Router |
| Backend | Node.js 20, Express 4 |
| Database | PostgreSQL 16 |
| AI Model | Ollama + llama3.2:3b (runs on CPU, ~2GB RAM) |
| Reverse Proxy | nginx (TLS termination, API proxy, rate limiting) |
| Observability | OpenTelemetry SDK → Elastic Cloud APM |
| Container | Docker + Docker Compose |

---

## Prerequisites

- **Docker** and **Docker Compose** (Docker Desktop or Engine + Compose plugin)
- **OpenSSL** (for TLS certificate generation — pre-installed on Ubuntu/macOS)
- **12GB RAM minimum** (Ollama uses 5GB, rest for other containers)
- Ports **3000**, **3443**, **4000**, **5432**, **11434** available

### Check Docker is ready

```bash
docker --version
docker compose version
```

---

## Quick Start

### 1. Clone the repository

```bash
git clone https://github.com/YOUR_USERNAME/rural-care-connect.git
cd rural-care-connect
```

### 2. Generate TLS certificate (required for HTTPS)

> ⚠️ Replace `192.168.68.119` with your server's actual IP address.

```bash
chmod +x generate-certs.sh
./generate-certs.sh 192.168.68.119
```

This creates `nginx/certs/server.crt` and `nginx/certs/server.key`.  
The certificate is valid for 825 days and includes the IP as a SubjectAltName (required by modern browsers).

You can verify the cert was created:

```bash
ls -la nginx/certs/
# server.crt  server.key
```

### 3. Configure environment (optional — for Elastic OTEL)

```bash
cp .env.example .env
# Edit .env with your Elastic Cloud credentials
```

If you skip this, the app works normally — OTEL is disabled silently.

### 4. Start all containers

```bash
docker compose up --build
```

First run takes **5–8 minutes** — Ollama downloads the `llama3.2:3b` model (~2GB). Subsequent starts are instant as the model is cached in a Docker volume.

### 5. Open the app

```
https://YOUR_SERVER_IP:3443
```

> **Browser security warning:** Click **Advanced → Proceed** (expected for self-signed certs in demo).

HTTP automatically redirects to HTTPS:
```
http://YOUR_SERVER_IP:3000  →  https://YOUR_SERVER_IP:3443
```

---

## HTTPS Setup

The app uses TLS via nginx. A self-signed certificate is appropriate for demo and internal use.

### Generate certificate for a specific IP

```bash
./generate-certs.sh 192.168.68.119
```

### Generate certificate manually (alternative)

```bash
mkdir -p nginx/certs

openssl req -x509 -nodes -newkey rsa:2048 \
  -keyout nginx/certs/server.key \
  -out    nginx/certs/server.crt \
  -days   825 \
  -subj   "/C=PH/ST=Palawan/L=El Nido/O=RuralCareConnect/CN=192.168.68.119" \
  -addext "subjectAltName=IP:192.168.68.119,IP:127.0.0.1"
```

### For production (Let's Encrypt)

Replace the self-signed cert with a Let's Encrypt certificate using [Certbot](https://certbot.eff.org/) and mount the certs at the same paths in `docker-compose.yml`.

---

## Elastic Observability (OTEL)

The backend ships **OpenTelemetry traces and metrics** to Elastic Cloud.

### Setup

1. Get your OTEL endpoint from **Elastic Cloud → Kibana → Observability → Add data → OpenTelemetry**

2. Create a `.env` file:

```bash
# .env — never commit this file
OTEL_EXPORTER_OTLP_ENDPOINT=https://YOUR-CLUSTER.ingest.REGION.aws.elastic-cloud.com:443
OTEL_EXPORTER_OTLP_HEADERS=Authorization=ApiKey YOUR_API_KEY==
OTEL_RESOURCE_ATTRIBUTES=service.name=RCC-care-connect,service.version=1.0.0,deployment.environment=production
```

3. Rebuild the backend:

```bash
docker compose up --build backend
```

4. Verify OTEL started:

```bash
docker logs rcc_backend | grep otel
# {"event.action":"otel_started","otel.endpoint":"https://..."}
```

### What gets sent to Elastic

| Data | Where in Kibana |
|---|---|
| APM traces (Express routes) | Observability → APM → Services → `RCC-care-connect` |
| PostgreSQL query spans | APM → Transactions → Dependencies |
| Structured JSON logs | Logs → Stream → filter `service.name: RCC-care-connect` |
| Container metrics | Infrastructure → Containers (via Elastic Agent) |

### What Elastic sees in traces

- Every `/api/*` route as a named transaction
- PostgreSQL as an auto-detected dependency
- `user.id`, `user.roles`, `http.response.status_code`, `event.duration_ms` in every log line
- `rcc.ai_request: true` flag on all triage calls
- `rcc.slow_request: true` flag on responses > 5 seconds

---

## Demo Accounts

All accounts use password: **`Demo1234!`**

| Role | Email | Access |
|---|---|---|
| **Patient** | `patient@demo.rcc` | Own health record, vitals, teleconsultations, AI pre-screening |
| **CHW** | `chw@demo.rcc` | All patients, vitals entry, offline queue |
| **Clinician** | `doctor@demo.rcc` | Consultations, diagnoses, prescriptions |
| **Admin** | `admin@demo.rcc` | Dashboard, audit log, AI triage monitoring, security report |

### Seed data included

- 3 patients (Maria Santos, Jose Reyes, Lourdes Cruz) with T2DM/HTN/CIHD
- 1 verified clinician (Dr. Ricardo Mendoza, PRC-MD-2019-12345)
- 4 vitals records across patients
- 1 completed teleconsultation with 2 prescriptions
- Consent records for each patient

---

## Project Structure

```
rural-care-connect/
├── docker-compose.yml          # Orchestrates all 4 containers
├── generate-certs.sh           # TLS certificate generator
├── ollama-entrypoint.sh        # Pulls AI model on first start
├── load-test.sh                # Traffic generator for Elastic demos
├── setup-elastic.sh            # Elastic Agent installer
├── .env.example                # OTEL config template
├── .gitignore
│
├── nginx/
│   ├── nginx.conf              # Rate limiting zones
│   ├── certs/                  # TLS certs (git-ignored)
│   │   ├── server.crt
│   │   └── server.key
│   └── conf.d/
│       └── rcc.conf            # HTTPS server, security headers, JSON logs
│
├── backend/
│   ├── Dockerfile
│   ├── package.json
│   └── src/
│       ├── index.js            # Express app, middleware, health endpoints
│       ├── otel.js             # OpenTelemetry SDK initialisation
│       ├── db/
│       │   ├── pool.js         # PostgreSQL connection pool
│       │   └── init.sql        # Schema + seed data
│       ├── middleware/
│       │   ├── auth.js         # JWT verification + RBAC
│       │   ├── audit.js        # Append-only audit logger
│       │   └── logger.js       # Structured JSON request logger (ECS)
│       └── routes/
│           ├── auth.js         # Login, register
│           ├── patients.js     # Patient CRUD
│           ├── vitals.js       # CHW vitals entry + validation
│           ├── consultations.js # Consults + prescriptions
│           ├── admin.js        # Stats, audit, security, activity
│           └── triage.js       # AI pre-screening (Ollama)
│
└── frontend/
    ├── Dockerfile              # Multi-stage: Vite build → nginx
    ├── nginx.conf              # Legacy (overridden by volume mount)
    ├── vite.config.js
    ├── package.json
    └── src/
        ├── main.jsx
        ├── App.jsx
        ├── styles.css
        ├── api/client.js       # Fetch wrapper with JWT headers
        ├── context/
        │   └── AuthContext.jsx # Login state
        ├── components/
        │   └── AppShell.jsx    # Sidebar + role-based navigation
        └── pages/
            ├── LoginPage.jsx       # Login + role quick-fill tiles
            ├── RegisterPage.jsx    # 2-step patient registration (RA 10173)
            ├── PatientPortal.jsx   # Vitals, chart, consultations, booking
            ├── CHWPage.jsx         # Patient list, vitals entry, offline queue
            ├── ClinicianPage.jsx   # Consultation management, prescriptions
            ├── AdminDashboard.jsx  # Stats, audit log, AI triage tab
            └── TriagePage.jsx      # AI pre-screening chat interface
```

---

## API Reference

### Base URL

```
https://YOUR_IP:3443/api
```

### Authentication

```
Authorization: Bearer <JWT>
```

### Endpoints

| Method | Path | Roles | Description |
|---|---|---|---|
| `POST` | `/auth/login` | Public | Login, returns JWT |
| `POST` | `/auth/register` | Public | Patient self-registration |
| `GET` | `/patients` | chw, clinician, admin | List all patients |
| `GET` | `/patients/me` | patient | Own patient record |
| `GET` | `/vitals/patient/:id` | all | Vitals for a patient |
| `POST` | `/vitals` | chw, clinician | Record new vitals |
| `GET` | `/consultations` | all | List consultations (role-scoped) |
| `POST` | `/consultations` | patient, clinician, admin | Book consultation |
| `PATCH` | `/consultations/:id` | clinician | Update diagnosis/plan |
| `POST` | `/consultations/:id/prescriptions` | clinician | Add prescription |
| `POST` | `/triage/chat` | patient, chw, clinician | AI pre-screening message |
| `GET` | `/triage/status` | all | Check AI model readiness |
| `GET` | `/admin/stats` | admin | Dashboard statistics |
| `GET` | `/admin/audit` | admin | Audit log (filterable) |
| `GET` | `/admin/patients` | admin | Full patient list with metrics |
| `GET` | `/admin/activity` | admin | Rolling activity feed |
| `GET` | `/admin/security` | admin | Failed logins, off-hours access |
| `GET` | `/health` | Public | Service health check |
| `GET` | `/ready` | Public | DB readiness probe |

---

## Security

### Implemented in this demo

- **HTTPS / TLS 1.2+** — nginx terminates TLS, strong cipher suite
- **HTTP → HTTPS redirect** — port 3000 redirects to 3443
- **Security headers** — HSTS, X-Frame-Options DENY, X-Content-Type-Options, CSP, Referrer-Policy
- **JWT authentication** — HS256, 8h expiry, role claim on every token
- **RBAC** — every route enforces role whitelist via middleware
- **bcryptjs** — cost factor 10, passwords never stored plaintext
- **Append-only audit log** — DB role has INSERT only on `audit_events`
- **Input validation** — vitals range checks server-side (systolic 60–300, glucose 1–35 mmol/L)
- **IP hashing** — client IPs SHA-256 hashed before audit storage
- **Rate limiting** — nginx zones: 10 req/min auth, 60 req/min API, 20 req/min triage
- **Request ID tracing** — `X-Request-ID` header correlates nginx + backend + Elastic logs
- **Emergency bypass** — 30+ EN/Filipino keywords checked before AI model (instant, no latency)

### Production additions required

- [ ] MFA (SMS OTP via Globe/Smart) — AWS Cognito recommended
- [ ] AES-256-GCM column-level encryption on all `[SPI]` fields
- [ ] JWT expiry → 15 minutes + refresh token rotation
- [ ] PRC license API verification for clinician accounts
- [ ] NPC registration (National Privacy Commission, Philippines)
- [ ] AWS KMS for key management
- [ ] CloudTrail + GuardDuty for immutable audit trail

---

## Compliance

| Regulation | Implementation |
|---|---|
| **RA 10173** (Data Privacy Act) | Layered consent on registration, consent rows with version + timestamp, append-only audit log, patient rights flows |
| **RA 6675** (Generics Act) | `drug_generic_name` required on all prescriptions — API returns 400 if omitted |
| **DOH Telemedicine Guidelines** | Emergency disclaimer on every triage screen and booking modal |
| **PhilHealth** | PIN collected at registration, stored as SPI |

---

## Useful Commands

```bash
# View all container logs
docker compose logs -f

# View backend logs only (structured JSON)
docker logs rcc_backend -f

# View structured logs pretty-printed
docker logs rcc_backend -f | python3 -m json.tool

# Connect to database
docker exec -it rcc_db psql -U rcc_user -d rcc_demo

# Query recent audit events
docker exec rcc_db psql -U rcc_user -d rcc_demo \
  -c "SELECT action, actor_role, outcome, occurred_at FROM audit_events ORDER BY occurred_at DESC LIMIT 20;"

# Check AI model is loaded
docker exec rcc_ollama ollama list

# Pull AI model manually (if auto-pull fails)
docker exec rcc_ollama ollama pull llama3.2:3b

# Hot-patch a backend file (no full rebuild)
docker cp backend/src/routes/triage.js rcc_backend:/app/src/routes/triage.js
docker restart rcc_backend

# Wipe database and reseed (destructive)
docker compose down -v && docker compose up --build

# Stop all containers
docker compose down
```

---

## Load Testing

Generate realistic traffic across all user roles:

```bash
chmod +x load-test.sh

# Run 20 rounds (~400 requests)
./load-test.sh 20 https://192.168.68.119:3443
```

Per round: patient reads, CHW vitals writes (random BP/glucose), clinician queries, admin dashboard + security + audit calls, plus intentional failed login every 5th round.

Results appear in Elastic APM within 2–3 minutes.

---

## Production Roadmap

### Phase 1 — Security hardening
- [ ] AWS Cognito for MFA (SMS OTP via Globe/Smart/DITO)
- [ ] AES-256-GCM column encryption on all SPI fields
- [ ] JWT 15-min expiry + device-bound refresh tokens
- [ ] TLS certificate via Let's Encrypt or ACM

### Phase 2 — Philippine integrations
- [ ] PhilSys (PSA) — patient identity verification
- [ ] PhilHealth eClaims API — consultation billing
- [ ] PRC Online — practitioner license verification
- [ ] DDB s2 license validation for controlled substances

### Phase 3 — Clinical features
- [ ] FHIR R4 resource mapping (Patient, Encounter, Observation, MedicationRequest)
- [ ] HL7 lab result import
- [ ] Electronic prescription with QR code and digital signature
- [ ] DOH NEPHIS integration for reportable disease surveillance

### Phase 4 — Native mobile
- [ ] React Native + Expo (iOS + Android)
- [ ] Expo SQLite for offline vitals (replaces localStorage queue)
- [ ] Biometric authentication (Face ID / fingerprint)
- [ ] Certificate pinning
- [ ] Push notifications for medication reminders (SNS)

---

## Acknowledgements

This project was developed as a demo for the **Rural Care Connect Project**, a geriatric hybrid care initiative for GIDA communities in El Nido, Palawan, Philippines.

**Project partners:** Ayala Foundation · Filipino Australian Health Professionals Inc. (FAHPi) · Harvard Medical School (affiliated)

**AI model:** [llama3.2:3b](https://ollama.com/library/llama3.2) via [Ollama](https://ollama.com) — runs fully on-device, no data leaves the server.

---

## Disclaimer

This application is a **demo MVP** intended for development and demonstration purposes. It is **not certified for clinical use**. All patient data in the demo is synthetic.

For emergencies, always contact **El Nido Community Hospital** or call **911**.

This is **NOT** an emergency service.

---

## Licence

MIT — see [LICENSE](LICENSE)
