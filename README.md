# 🏥 Rural Care Connect

> A hybrid telehealth platform for elderly patients (60+) with Type 2 Diabetes Mellitus (T2DM) and Hypertension in geographically isolated and disadvantaged areas (GIDA) of the Philippines.

Built for the **Rural Care Connect Project** — a geriatric care initiative targeting remote island communities in El Nido, Palawan.

---

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Deployment Options](#deployment-options)
  - [Local / Ubuntu](#-local--ubuntu-deployment)
  - [Google Cloud Platform](#-google-cloud-platform-gcp-deployment)
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

Rural Care Connect connects four user roles:

- **Patients** — view health records, book teleconsultations, AI pre-screening
- **Community Health Workers (CHWs)** — record vitals offline, sync on reconnect
- **Clinicians** — manage consultations, diagnoses, prescriptions
- **Administrators** — audit log, security monitoring, AI triage tracking

The AI pre-screening assistant runs **fully local** via [Ollama](https://ollama.com) + `llama3.2:3b` — no external AI API required.

---

## Features

| Feature | Description |
|---|---|
| 🔐 JWT Auth + RBAC | Role-scoped access: patient / chw / clinician / admin |
| 📊 Vitals Tracking | BP, glucose, HbA1c, weight with server-side range validation |
| 📡 Offline Sync | CHW vitals queue works without signal, syncs automatically |
| 🩺 Teleconsultations | Book, join, document, prescribe in one flow |
| 🤖 AI Pre-Screening | 9-step bilingual interview (Filipino/English) before each consult |
| 🚨 Emergency Detection | Instant keyword bypass — 30+ phrases in EN + Filipino |
| 📋 Audit Log | Append-only RA 10173-compliant trail |
| 🔒 HTTPS | Self-signed TLS, auto HTTP→HTTPS redirect, security headers |
| 📈 Observability | OpenTelemetry traces + structured JSON logs → Elastic Cloud |
| 🛡️ Security Dashboard | Failed logins, off-hours access, triage emergency tracking |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, Recharts |
| Backend | Node.js 20, Express 4 |
| Database | PostgreSQL 16 |
| AI Model | Ollama + llama3.2:3b (CPU, ~2GB RAM) |
| Reverse Proxy | nginx (TLS, rate limiting, JSON access logs) |
| Observability | OpenTelemetry → Elastic Cloud APM |
| Container | Docker + Docker Compose |

---

## Deployment Options

---

## 🖥️ Local / Ubuntu Deployment

### Prerequisites

- Ubuntu 20.04+
- Docker Engine + Docker Compose plugin
- OpenSSL (pre-installed on Ubuntu)
- **Minimum 12GB RAM** (Ollama uses 5GB)
- Ports 3000, 3443, 4000, 5432, 11434 free

```bash
# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker

# Verify
docker --version
docker compose version
```

### Step 1 — Clone

```bash
git clone https://github.com/mikecali/rural-care-connect.git
cd rural-care-connect
```

### Step 2 — Generate TLS certificate

> ⚠️ Replace the IP with your machine's actual LAN IP (`ip addr show` to find it).

```bash
chmod +x generate-certs.sh
./generate-certs.sh 192.168.68.119
```

Or manually:

```bash
mkdir -p nginx/certs

openssl req -x509 -nodes -newkey rsa:2048 \
  -keyout nginx/certs/server.key \
  -out    nginx/certs/server.crt \
  -days   825 \
  -subj   "/C=PH/ST=Palawan/L=El Nido/O=RuralCareConnect/CN=192.168.68.119" \
  -addext "subjectAltName=IP:192.168.68.119,IP:127.0.0.1"

ls -la nginx/certs/
# server.crt  server.key
```

### Step 3 — Start

```bash
docker compose up --build
```

> **First run:** Ollama downloads `llama3.2:3b` (~2GB). Takes 5–8 min. Subsequent starts are instant.

### Step 4 — Open

```
https://192.168.68.119:3443
```

Browser warns about self-signed cert → **Advanced → Proceed**.  
HTTP on port 3000 auto-redirects to HTTPS.

### Local docker-compose.yml (Ollama config)

```yaml
ollama:
  image: ollama/ollama:latest    # latest works fine on standard x86 CPUs
  mem_limit: 5g
  environment:
    - OLLAMA_NUM_THREADS=6
    - OLLAMA_LLM_LIBRARY=cpu_avx2
```

---

## ☁️ Google Cloud Platform (GCP) Deployment

### Recommended machine type

| Use case | Machine type | RAM | vCPUs | Cost/month |
|---|---|---|---|---|
| Demo / pilot | `n4-standard-4` | 16GB | 4 | ~$97 |
| **Recommended** | **`n4-standard-8`** | **32GB** | **8** | **~$195** |
| Better AI speed | `c4-standard-8` | 32GB | 8 | ~$240 |

> ⚠️ N4 machines require **`pd-ssd`** disk type — `pd-balanced` will be rejected.

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

# Open firewall ports
gcloud compute firewall-rules create rcc-allow \
  --allow tcp:3000,tcp:3443,tcp:4000 \
  --target-tags=http-server,https-server
```

### Step 1 — SSH into VM and install Docker

```bash
gcloud compute ssh rcc-server --zone=asia-southeast1-a

# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker
```

### Step 2 — Clone

```bash
git clone https://github.com/mikecali/rural-care-connect.git
cd rural-care-connect
```

### Step 3 — Generate TLS certificate

Get your VM's external IP first:
```bash
gcloud compute instances describe rcc-server \
  --zone=asia-southeast1-a \
  --format="get(networkInterfaces[0].accessConfigs[0].natIP)"
```

Then generate the cert:
```bash
chmod +x generate-certs.sh
./generate-certs.sh YOUR_GCP_EXTERNAL_IP
```

Or manually:
```bash
mkdir -p nginx/certs

openssl req -x509 -nodes -newkey rsa:2048 \
  -keyout nginx/certs/server.key \
  -out    nginx/certs/server.crt \
  -days   825 \
  -subj   "/C=PH/ST=NCR/L=Manila/O=RuralCareConnect/CN=YOUR_GCP_EXTERNAL_IP" \
  -addext "subjectAltName=IP:YOUR_GCP_EXTERNAL_IP,IP:127.0.0.1"
```

### Step 4 — ⚠️ Critical: Fix Ollama for GCP Xeon CPUs

GCP Xeon Platinum CPUs (8581C and similar) have **AMX (Advanced Matrix Extensions)** hardware that causes a segfault inside Docker containers with the latest Ollama image.

**Pin Ollama to version 0.3.14** which uses AVX2 CPU inference without AMX:

Edit `docker-compose.yml`:
```yaml
ollama:
  image: ollama/ollama:0.3.14    # ← pin this — do NOT use latest on GCP
  mem_limit: 8g                  # increase from 5g — GCP has 32GB
  environment:
    - OLLAMA_NUM_PARALLEL=1
    - OLLAMA_NOPRUNE=true
    - OLLAMA_NUM_THREADS=8       # use all 8 vCPUs on n4-standard-8
    - OLLAMA_LLM_LIBRARY=cpu_avx2
```

Quick sed command to apply the change:
```bash
sed -i 's|image: ollama/ollama:latest|image: ollama/ollama:0.3.14|' docker-compose.yml
sed -i 's/mem_limit: 5g/mem_limit: 8g/' docker-compose.yml
sed -i 's/OLLAMA_NUM_THREADS=6/OLLAMA_NUM_THREADS=8/' docker-compose.yml
```

Verify the changes:
```bash
grep -E "image: ollama|mem_limit|NUM_THREADS" docker-compose.yml
```

### Step 5 — Start

```bash
docker compose up --build
```

### Step 6 — Open

```
https://YOUR_GCP_EXTERNAL_IP:3443
```

### Verify Ollama is working correctly

After startup, check logs for this pattern (no AMX line = working):

```bash
docker logs rcc_ollama | grep "load_tensors"
```

✅ **Good** — AVX2 only:
```
load_tensors:   CPU model buffer size =   618.98 MiB
```

❌ **Bad** — AMX present (will segfault):
```
load_tensors:   AMX model buffer size =  1953.78 MiB
load_tensors:   CPU model buffer size =   308.90 MiB
```

### GCP Troubleshooting

**Segfault on model load:**
```bash
# Confirm you're on 0.3.14
docker logs rcc_ollama | grep "version"
# Should show: version 0.3.14

# If still on latest, force remove and repull
docker compose stop ollama
docker rm rcc_ollama
docker rmi ollama/ollama:latest
docker compose up -d ollama
```

**pd-balanced disk error when changing machine type:**
```bash
# Migrate disk to pd-ssd first, then change machine type
# Or use n2-standard-8 which accepts pd-balanced
sed -i 's/n4-standard-8/n2-standard-8/' your-gcloud-command
```

**Port not accessible:**
```bash
# Check GCP firewall rules
gcloud compute firewall-rules list | grep rcc

# Add if missing
gcloud compute firewall-rules create rcc-https \
  --allow tcp:3443 \
  --target-tags=https-server
```

---

## HTTPS Setup

Both deployments use nginx with a self-signed TLS certificate.

```bash
# Automated (recommended)
./generate-certs.sh YOUR_IP

# Manual
mkdir -p nginx/certs
openssl req -x509 -nodes -newkey rsa:2048 \
  -keyout nginx/certs/server.key \
  -out    nginx/certs/server.crt \
  -days   825 \
  -subj   "/CN=YOUR_IP" \
  -addext "subjectAltName=IP:YOUR_IP"
```

For production with a domain name, replace with Let's Encrypt via Certbot.

---

## Elastic Observability (OTEL)

### Setup

```bash
# 1. Create .env
cat > .env << EOF
OTEL_EXPORTER_OTLP_ENDPOINT=https://YOUR-CLUSTER.ingest.REGION.aws.elastic-cloud.com:443
OTEL_EXPORTER_OTLP_HEADERS=Authorization=ApiKey YOUR_KEY==
OTEL_RESOURCE_ATTRIBUTES=service.name=RCC-care-connect,service.version=1.0.0,deployment.environment=production
EOF

# 2. Rebuild backend
docker compose up --build backend

# 3. Verify OTEL started
docker logs rcc_backend | grep otel
```

### What ships to Elastic

| Data | Kibana location |
|---|---|
| APM traces | Observability → APM → Services → `RCC-care-connect` |
| PostgreSQL spans | APM → Transactions → Dependencies |
| Structured logs | Logs → Stream → `service.name: RCC-care-connect` |
| Slow requests | Logs → filter `rcc.slow_request: true` |
| AI triage calls | Logs → filter `rcc.ai_request: true` |

---

## Demo Accounts

Password for all: **`Demo1234!`**

| Role | Email | Access |
|---|---|---|
| Patient | `patient@demo.rcc` | Own record, vitals, consultations, AI screening |
| CHW | `chw@demo.rcc` | All patients, vitals entry, offline queue |
| Clinician | `doctor@demo.rcc` | Consultations, diagnoses, prescriptions |
| Admin | `admin@demo.rcc` | Dashboard, audit log, AI triage monitoring |

---

## Project Structure

```
rural-care-connect/
├── docker-compose.yml
├── generate-certs.sh         ← TLS cert generator
├── ollama-entrypoint.sh      ← model auto-download
├── load-test.sh              ← traffic generator
├── .env.example
├── nginx/
│   ├── nginx.conf
│   ├── certs/                ← git-ignored
│   └── conf.d/rcc.conf
├── backend/
│   └── src/
│       ├── index.js
│       ├── otel.js           ← OpenTelemetry SDK
│       ├── db/init.sql       ← schema + seed data
│       ├── middleware/
│       │   ├── auth.js       ← JWT + RBAC
│       │   ├── audit.js      ← append-only logger
│       │   └── logger.js     ← structured JSON (ECS)
│       └── routes/
│           ├── auth.js
│           ├── patients.js
│           ├── vitals.js
│           ├── consultations.js
│           ├── admin.js
│           └── triage.js     ← AI pre-screening
└── frontend/
    └── src/
        └── pages/
            ├── PatientPortal.jsx
            ├── CHWPage.jsx
            ├── ClinicianPage.jsx
            ├── AdminDashboard.jsx
            └── TriagePage.jsx    ← AI chat interface
```

---

## API Reference

Base URL: `https://<IP>:3443/api`

| Method | Path | Roles | Description |
|---|---|---|---|
| POST | `/auth/login` | Public | Login → JWT |
| POST | `/auth/register` | Public | Patient registration |
| GET | `/patients/me` | patient | Own record |
| GET | `/patients` | chw, clinician, admin | All patients |
| POST | `/vitals` | chw, clinician | Record vitals |
| GET | `/consultations` | all | Role-scoped list |
| POST | `/consultations` | patient, clinician, admin | Book consult |
| POST | `/triage/chat` | patient, chw, clinician | AI pre-screening |
| GET | `/triage/status` | all | AI readiness check |
| GET | `/admin/stats` | admin | Dashboard stats |
| GET | `/admin/audit` | admin | Audit log |
| GET | `/admin/security` | admin | Security report |
| GET | `/health` | Public | Health check |
| GET | `/ready` | Public | DB readiness probe |

---

## Security

- HTTPS / TLS 1.2+ — nginx terminates, strong cipher suite
- HTTP → HTTPS redirect on port 3000
- Security headers — HSTS, X-Frame-Options DENY, X-Content-Type-Options, CSP
- JWT HS256 + RBAC — role checked on every protected route
- bcryptjs cost factor 10
- Append-only audit log — DB role has INSERT only, no UPDATE/DELETE
- Rate limiting — 10 req/min auth, 60 req/min API, 20 req/min triage
- IP addresses SHA-256 hashed before audit storage
- Emergency keyword bypass — fires before AI, instant response

---

## Compliance

| Regulation | Implementation |
|---|---|
| **RA 10173** (Data Privacy Act) | Layered consent, append-only audit, patient rights |
| **RA 6675** (Generics Act) | Generic drug name required — 400 if omitted |
| **DOH Telemedicine** | Emergency disclaimer on all triage screens |
| **PhilHealth** | PIN collected at registration as SPI |

---

## Load Testing

```bash
chmod +x load-test.sh

# 20 rounds across all 4 roles
./load-test.sh 20 https://YOUR_IP:3443
```

Or run inline:
```bash
SERVER="https://YOUR_IP:3443"
CURL="/usr/bin/curl"
TOKEN_ADMIN=$($CURL -sk -X POST "$SERVER/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@demo.rcc","password":"Demo1234!"}' \
  | grep -o '"token":"[^"]*' | cut -d'"' -f4)

for i in $(seq 1 30); do
  $CURL -sk -H "Authorization: Bearer $TOKEN_ADMIN" \
    "$SERVER/api/admin/stats" -o /dev/null
  echo "Round $i done"
  sleep 1
done
```

---

## Useful Commands

```bash
# All logs
docker compose logs -f

# Backend structured logs
docker logs rcc_backend -f

# Count log lines in last 5 min
docker logs rcc_backend --since 5m 2>&1 | grep -c "@timestamp"

# Connect to DB
docker exec -it rcc_db psql -U rcc_user -d rcc_demo

# Recent audit events
docker exec rcc_db psql -U rcc_user -d rcc_demo \
  -c "SELECT action, actor_role, outcome, occurred_at FROM audit_events ORDER BY occurred_at DESC LIMIT 20;"

# Check AI model
docker exec rcc_ollama ollama list

# Hot-patch backend (no rebuild)
docker cp backend/src/routes/triage.js rcc_backend:/app/src/routes/triage.js
docker restart rcc_backend

# Wipe DB and reseed
docker compose down -v && docker compose up --build
```

---

## Production Roadmap

- [ ] AWS Cognito MFA (SMS OTP via Globe/Smart/DITO)
- [ ] AES-256-GCM column encryption on all SPI fields
- [ ] JWT 15-min expiry + refresh token rotation
- [ ] PhilSys / PhilHealth eClaims / PRC API integrations
- [ ] FHIR R4 resource mapping
- [ ] React Native mobile app (Expo)
- [ ] NPC registration (National Privacy Commission)
- [ ] Let's Encrypt TLS for production domain

---

## Acknowledgements

Built as a demo for the **Rural Care Connect Project**, a geriatric hybrid care initiative for GIDA communities in El Nido, Palawan, Philippines.

**Project partners:** Ayala Foundation · Filipino Australian Health Professionals Inc. (FAHPi) · Harvard Medical School (affiliated)

---

## Disclaimer

Demo MVP — not certified for clinical use. All patient data is synthetic.  
**NOT an emergency service.** For emergencies call El Nido Community Hospital or 911.

## Licence

MIT — see [LICENSE](LICENSE)
