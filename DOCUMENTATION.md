# Rural Care Connect — Technical Documentation

**Version:** 1.0 (MVP Demo)
**Last updated:** June 2026
**Deployment:** Docker · Local / Ubuntu
**Project:** Geriatric hybrid care — El Nido, Palawan (GIDA)

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [System Architecture](#2-system-architecture)
3. [Container Architecture](#3-container-architecture)
4. [Database Schema](#4-database-schema)
5. [API Reference](#5-api-reference)
6. [Authentication & RBAC Flow](#6-authentication--rbac-flow)
7. [User Flows](#7-user-flows)
   - 7.1 [Patient Registration](#71-patient-registration)
   - 7.2 [Patient Login](#72-patient-login)
   - 7.3 [CHW Vitals Entry (with Offline Sync)](#73-chw-vitals-entry-with-offline-sync)
   - 7.4 [Teleconsultation Booking](#74-teleconsultation-booking)
   - 7.5 [Clinician Consultation Flow](#75-clinician-consultation-flow)
8. [Security Model](#8-security-model)
9. [Audit Trail](#9-audit-trail)
10. [Compliance Alignment](#10-compliance-alignment)
11. [Local Setup Guide](#11-local-setup-guide)
12. [Production Readiness Checklist](#12-production-readiness-checklist)

---

## 1. Project Overview

**Rural Care Connect** is a hybrid healthcare platform targeting elderly patients (≥60 years) with Type 2 Diabetes Mellitus (T2DM), Hypertension (HTN), and Chronic Ischaemic Heart Disease (CIHD) living in geographically isolated and disadvantaged areas (GIDA) of El Nido, Palawan, Philippines.

The MVP provides four core user roles and flows:

| Role | Primary function |
|------|-----------------|
| **Patient** | View own health records, vitals history, book & join teleconsultations |
| **Community Health Worker (CHW)** | Record patient vitals during home visits; works offline |
| **Clinician** | Manage consultations, write diagnoses, prescribe medications |
| **Admin** | Monitor platform health, view audit log, manage users |

### Technology stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite, Recharts, React Router |
| Backend | Node.js 20, Express 4 |
| Database | PostgreSQL 16 |
| Auth | JWT (jsonwebtoken) + bcryptjs |
| Container | Docker + Docker Compose |
| Reverse proxy | nginx (serves SPA + proxies `/api`) |

---

## 2. System Architecture

```mermaid
graph TB
    subgraph Clients["👥 Clients (Browser)"]
        P[Patient]
        C[CHW]
        CL[Clinician]
        A[Admin]
    end

    subgraph Docker["🐳 Docker Compose Network"]
        direction TB

        subgraph FE["rcc_frontend — nginx :3000"]
            SPA[React SPA\nVite build]
            NX[nginx reverse proxy]
        end

        subgraph BE["rcc_backend — Node.js :4000"]
            EX[Express App]
            MW[JWT Middleware\n+ RBAC]
            AL[Audit Logger]
            subgraph Routes["Route Handlers"]
                R1[/auth]
                R2[/patients]
                R3[/vitals]
                R4[/consultations]
                R5[/admin]
            end
        end

        subgraph DB["rcc_db — PostgreSQL :5432"]
            PG[(PostgreSQL 16)]
        end
    end

    P & C & CL & A -->|HTTPS :3000| NX
    NX -->|Static files| SPA
    NX -->|/api proxy| EX
    EX --> MW --> Routes
    Routes --> AL
    Routes --> PG
    AL --> PG
```

---

## 3. Container Architecture

```mermaid
graph LR
    subgraph Host["Ubuntu Host Machine"]
        Port3000["Port 3000\n(public)"]
        Port4000["Port 4000\n(public)"]
        Port5432["Port 5432\n(local)"]
        Vol[("pgdata\nDocker volume\nPostgres data")]
    end

    subgraph Compose["docker-compose.yml"]
        direction TB

        FE["rcc_frontend\nnginx:alpine\nServes React build\nProxies /api → backend"]
        BE["rcc_backend\nnode:20-alpine\nExpress API\nHot-reloadable via volume"]
        DB["rcc_db\npostgres:16-alpine\nInit via init.sql\nHealthcheck: pg_isready"]
    end

    Port3000 --> FE
    Port4000 --> BE
    Port5432 --> DB
    DB --- Vol
    FE -->|"depends_on: backend"| BE
    BE -->|"depends_on: db\n(condition: healthy)"| DB

    style FE fill:#e3f0ff,stroke:#1565c0
    style BE fill:#e8f5ee,stroke:#1a7a4a
    style DB fill:#fff3e0,stroke:#e65100
```

### Build pipeline

```mermaid
flowchart LR
    subgraph Frontend Build ["Frontend — Multi-stage Dockerfile"]
        A[node:20-alpine\nBuilder stage] -->|npm run build| B[dist/ folder\nminified assets]
        B --> C[nginx:alpine\nServe stage]
    end
    subgraph Backend Build ["Backend Dockerfile"]
        D[node:20-alpine] -->|npm install| E[Express app\nready]
    end
    subgraph DB Init ["Database"]
        F[postgres:16-alpine] -->|"init.sql\n(schema + seed)"| G[Tables created\nDemo data seeded]
    end
```

---

## 4. Database Schema

```mermaid
erDiagram
    USERS ||--o| PATIENTS : "has"
    USERS ||--o| PRACTITIONERS : "has"
    PATIENTS ||--o{ VITALS : "has many"
    PATIENTS ||--o{ CONSULTATIONS : "books"
    PATIENTS ||--o{ CONSENTS : "grants"
    PATIENTS ||--o{ MEDICATIONS : "takes"
    PRACTITIONERS ||--o{ CONSULTATIONS : "conducts"
    CONSULTATIONS ||--o{ PRESCRIPTIONS : "produces"

    USERS {
        uuid id PK
        string email UK
        string password_hash
        string role
        bool is_active
        timestamptz created_at
    }

    PATIENTS {
        uuid id PK
        uuid user_id FK
        string full_name
        date date_of_birth
        string mobile
        string philhealth_no
        string address
        string barangay
        string municipality
        string province
        text[] conditions
        timestamptz created_at
    }

    PRACTITIONERS {
        uuid id PK
        uuid user_id FK
        string full_name
        string role_type
        string prc_license
        string specialty
        bool is_verified
        timestamptz created_at
    }

    VITALS {
        uuid id PK
        uuid patient_id FK
        uuid recorded_by FK
        int systolic_bp
        int diastolic_bp
        numeric blood_glucose
        numeric weight_kg
        numeric hba1c
        text notes
        string sync_status
        timestamptz measured_at
        timestamptz created_at
    }

    CONSULTATIONS {
        uuid id PK
        uuid patient_id FK
        uuid practitioner_id FK
        text chief_complaint
        text diagnosis
        text treatment_plan
        string status
        string consult_type
        timestamptz scheduled_at
        timestamptz started_at
        timestamptz ended_at
        timestamptz created_at
    }

    PRESCRIPTIONS {
        uuid id PK
        uuid consultation_id FK
        string drug_generic_name
        string dosage
        string frequency
        int quantity
        text instructions
        date valid_until
        timestamptz created_at
    }

    CONSENTS {
        uuid id PK
        uuid patient_id FK
        string consent_type
        string consent_version
        bool granted
        timestamptz granted_at
        timestamptz revoked_at
        string ip_hash
        string device_hint
    }

    MEDICATIONS {
        uuid id PK
        uuid patient_id FK
        string drug_name
        string dosage
        string reminder_time
        bool is_active
    }
```

> **SPI fields** (Sensitive Personal Information under RA 10173): `full_name`, `date_of_birth`, `mobile`, `philhealth_no`, `blood_glucose`, `systolic_bp`, `diastolic_bp`, `hba1c`, `diagnosis`, `chief_complaint`, `treatment_plan`, `drug_generic_name`, `dosage`. In production these are AES-256-GCM encrypted at the application layer before write.

---

## 5. API Reference

### Base URL
```
http://localhost:3000/api   (via nginx proxy)
http://localhost:4000/api   (direct to backend)
```

### Authentication
All protected routes require:
```
Authorization: Bearer <JWT>
```

### Endpoints

#### Auth — `/api/auth`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/login` | None | Login, returns JWT + role |
| `POST` | `/register` | None | Patient self-registration |

#### Patients — `/api/patients`

| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| `GET` | `/` | clinician, chw, admin | List all patients (supports `?search=`) |
| `GET` | `/me` | patient | Patient views own record |
| `GET` | `/:id` | clinician, chw, admin | Get single patient |

#### Vitals — `/api/vitals`

| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| `GET` | `/patient/:id` | all (patient sees own only) | List vitals for a patient |
| `POST` | `/` | chw, clinician | Record new vitals entry |

**Vital validation ranges:**

| Field | Min | Max | Unit |
|-------|-----|-----|------|
| Systolic BP | 60 | 300 | mmHg |
| Diastolic BP | 40 | 200 | mmHg |
| Blood glucose | 1.0 | 35.0 | mmol/L |

#### Consultations — `/api/consultations`

| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| `GET` | `/` | patient, clinician, admin | List consultations (scoped by role) |
| `GET` | `/:id` | patient, clinician, admin | Get consultation + prescriptions |
| `POST` | `/` | patient, clinician, admin | Book new consultation |
| `PATCH` | `/:id` | clinician | Update diagnosis, plan, status |
| `POST` | `/:id/prescriptions` | clinician | Add prescription (RA 6675: generic name required) |

#### Admin — `/api/admin`

| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| `GET` | `/stats` | admin | Dashboard stats + recent audit events |
| `GET` | `/audit` | admin | Full audit log (last 50–100 events) |
| `GET` | `/patients` | admin | All patients with vitals counts |

---

## 6. Authentication & RBAC Flow

```mermaid
sequenceDiagram
    actor U as User (Browser)
    participant FE as React App
    participant NX as nginx
    participant BE as Express API
    participant DB as PostgreSQL

    U->>FE: Enter email + password
    FE->>NX: POST /api/auth/login
    NX->>BE: Proxy to :4000
    BE->>DB: SELECT user WHERE email = ?
    DB-->>BE: User row + password_hash
    BE->>BE: bcrypt.compare(password, hash)

    alt Invalid credentials
        BE-->>FE: 401 Unauthorized
        FE-->>U: Show error message
    else Valid credentials
        BE->>BE: jwt.sign({sub, role, email}, secret, 8h)
        BE->>DB: INSERT audit_events (login, success)
        BE-->>FE: {token, role, userId, email}
        FE->>FE: Store in localStorage
        FE-->>U: Redirect to role dashboard
    end
```

### RBAC permission matrix

```mermaid
graph TD
    subgraph Roles
        PT[patient]
        CW[chw]
        CL[clinician]
        AD[admin]
    end

    subgraph Resources
        OWN[Own records\n/patients/me\n/vitals own\n/consultations own]
        ALL_P[All patients\n/patients\n/admin/patients]
        VITAL_W[Write vitals\nPOST /vitals]
        CONSULT_W[Write consultations\nPATCH /consultations\nPOST /prescriptions]
        AUDIT[Audit log\n/admin/audit\n/admin/stats]
    end

    PT -->|✅ allowed| OWN
    PT -->|✅ self-book| CONSULT_W
    CW -->|✅ allowed| ALL_P
    CW -->|✅ allowed| VITAL_W
    CL -->|✅ allowed| ALL_P
    CL -->|✅ allowed| VITAL_W
    CL -->|✅ allowed| CONSULT_W
    AD -->|✅ allowed| ALL_P
    AD -->|✅ allowed| AUDIT

    PT -.-x|❌ denied| ALL_P
    PT -.-x|❌ denied| AUDIT
    CW -.-x|❌ denied| CONSULT_W
    CW -.-x|❌ denied| AUDIT
```

---

## 7. User Flows

### 7.1 Patient Registration

```mermaid
flowchart TD
    A([Open app]) --> B[Click Create account]
    B --> C[Step 1: Personal details\nName · DOB · Mobile\nBarangay · PhilHealth No.\nConditions T2DM/HTN/CIHD]
    C --> D{Validate}
    D -->|Age < 18| E[Error: Must be 18+]
    D -->|Mobile format wrong| F[Error: +63XXXXXXXXXX]
    D -->|Valid| G[Step 2: Account credentials\nEmail · Password · Confirm]
    G --> H{Validate\npassword}
    H -->|< 8 chars| I[Error: Too short]
    H -->|No uppercase| J[Error: Add uppercase]
    H -->|Mismatch| K[Error: Passwords differ]
    H -->|Valid| L[Show RA 10173\nData Privacy Consent]
    L --> M[POST /api/auth/register]
    M --> N{Email\nalready exists?}
    N -->|Yes| O[Error: Email taken]
    N -->|No| P[Create user + patient records\nInsert consent rows\nTransaction commit]
    P --> Q([✅ Account created\nRedirect to login])

    style Q fill:#e8f5ee,stroke:#1a7a4a
    style E fill:#ffebee,stroke:#c62828
    style F fill:#ffebee,stroke:#c62828
    style I fill:#ffebee,stroke:#c62828
    style J fill:#ffebee,stroke:#c62828
    style K fill:#ffebee,stroke:#c62828
    style O fill:#ffebee,stroke:#c62828
```

### 7.2 Patient Login

```mermaid
flowchart TD
    A([Login page]) --> B{Use quick-fill\ntile or type?}
    B -->|Click role tile\nPatient/CHW/Clinician/Admin| C[Auto-fill email\nPassword still blank]
    B -->|Type manually| D[Enter email + password]
    C --> D
    D --> E[POST /api/auth/login]
    E --> F{Auth result}
    F -->|401| G[Show error]
    F -->|200| H[Store JWT in localStorage]
    H --> I{Role?}
    I -->|patient| J[Patient Portal\nMy Health Record]
    I -->|chw| K[CHW Dashboard\nPatient list]
    I -->|clinician| L[Clinician Dashboard\nConsultations]
    I -->|admin| M[Admin Dashboard\nStats + audit]

    style J fill:#e3f0ff,stroke:#1565c0
    style K fill:#e8f5ee,stroke:#1a7a4a
    style L fill:#f3e5f5,stroke:#7b1fa2
    style M fill:#fff3e0,stroke:#e65100
```

### 7.3 CHW Vitals Entry (with Offline Sync)

```mermaid
sequenceDiagram
    actor CHW as CHW (Field worker)
    participant App as React App
    participant LS as localStorage queue
    participant API as Express API
    participant DB as PostgreSQL

    CHW->>App: Search patient by name/barangay
    App->>API: GET /api/patients?search=
    API-->>App: Patient list
    CHW->>App: Select patient → Record Vitals
    CHW->>App: Enter BP, glucose, weight, notes

    App->>App: Validate ranges (client-side)

    alt Device is offline
        App->>LS: Push to vitals_queue\n{patientId, vitals, _queuedAt}
        App-->>CHW: ⚡ Queued — will sync when connected
        Note over App,LS: Badge shows pending count
    else Device is online
        App->>API: POST /api/vitals {patientId, ...vitals}
        API->>API: Validate ranges (server-side)
        API->>DB: INSERT vitals (sync_status: synced)
        API->>DB: INSERT audit_event (record_vitals)
        API-->>App: 201 Created
        App-->>CHW: ✅ Vitals saved
    end

    Note over App,LS: Later — when connectivity returns
    CHW->>App: Click "Sync N pending"
    App->>LS: Read queue
    loop For each queued record
        App->>API: POST /api/vitals
        API->>DB: INSERT vitals
        App->>LS: Remove synced record
    end
    App-->>CHW: Synced N records
```

### 7.4 Teleconsultation Booking

```mermaid
flowchart TD
    A([Patient dashboard]) --> B[Click 📅 Book Consultation]
    B --> C[Booking modal\nDr. Mendoza shown\nPRC verified ✓]
    C --> D[Select type:\nTeleconsult or In-person]
    D --> E[Enter chief complaint *]
    E --> F[Optional: pick date/time]
    F --> G[POST /api/consultations\npractitionerId fixed\npatientId from JWT]
    G --> H{Own patient\nrecord exists?}
    H -->|No| I[Error: Record not found]
    H -->|Yes| J[INSERT consultation\nstatus: scheduled]
    J --> K[Audit log: create_consultation]
    K --> L([✅ Booking confirmed\nSuccess banner shown])
    L --> M[Consultations tab\nShows new entry]
    M --> N{Type?}
    N -->|teleconsult| O[🎥 Join button visible]
    N -->|in_person| P[Awaiting home visit]
    O --> Q[Click Join]
    Q --> R[Full-screen teleconsult room\nSimulated video · Secure chat\nMute · Camera · End call]
    R --> S[End call]
    S --> T[PATCH /consultations/:id\nstatus: completed]
    T --> U([Back to dashboard])

    style L fill:#e8f5ee,stroke:#1a7a4a
    style I fill:#ffebee,stroke:#c62828
```

### 7.5 Clinician Consultation Flow

```mermaid
flowchart TD
    A([Clinician logs in]) --> B[Consultations list\nFiltered to own patients]
    B --> C[Click Open on a consultation]
    C --> D[Consultation detail view]
    D --> E[View patient:\nName · DOB · Conditions]
    E --> F[Read chief complaint]
    F --> G[Write Diagnosis]
    G --> H[Write Treatment Plan]
    H --> I[Save notes\nPATCH /consultations/:id]
    I --> J{Add\nprescription?}
    J -->|Yes| K[Enter generic drug name *\nRA 6675 compliance\nDosage · Frequency · Qty]
    K --> L[POST /consultations/:id/prescriptions]
    L --> M[Prescription added\nAudit logged]
    M --> J
    J -->|Done| N[Mark consultation complete\nPATCH status: completed]
    N --> O([ended_at recorded\nBack to list])

    style O fill:#e8f5ee,stroke:#1a7a4a
    style K fill:#e3f0ff,stroke:#1565c0
```

---

## 8. Security Model

```mermaid
graph TB
    subgraph Transport["Transport Security"]
        T1[nginx terminates HTTP\nProduction: add TLS/HTTPS]
        T2[API proxy: /api/* → backend\nno direct internet exposure]
    end

    subgraph AuthSec["Authentication Security"]
        A1[bcryptjs cost factor 10\npasswords never stored plaintext]
        A2[JWT HS256\n8h expiry demo\n→ 15min in production]
        A3[Role claim in JWT payload\nchecked on every request]
    end

    subgraph DataSec["Data Security — Demo"]
        D1[PostgreSQL in private\nDocker network]
        D2[Credentials via\nenvironment variables\nnever hardcoded]
        D3[No SPI in URL params\nor query strings]
    end

    subgraph DataSecProd["Data Security — Production additions"]
        P1[AES-256-GCM column\nencryption on all SPI fields]
        P2[AWS KMS customer\nmanaged keys]
        P3[TLS 1.3 in transit]
        P4[Certificate pinning\non mobile clients]
    end

    subgraph AuditSec["Audit Security"]
        AU1[Append-only audit_events table\nApp role: INSERT only, no UPDATE/DELETE]
        AU2[IP addresses hashed\nbefore storage SHA-256]
        AU3[Every login, view, write\nexport is logged]
    end

    Transport --- AuthSec
    AuthSec --- DataSec
    DataSec -. "upgrade path" .-> DataSecProd
    AuthSec --- AuditSec
```

---

## 9. Audit Trail

Every data access event is written to `audit_events`. The application database role has `INSERT` only on this table — no `UPDATE` or `DELETE` — making it append-only.

```mermaid
sequenceDiagram
    participant Route as Route Handler
    participant AuditFn as auditLog()
    participant DB as audit_events table

    Route->>Route: Process request
    Route->>AuditFn: auditLog({actorId, actorRole,\naction, resourceType,\nresourceId, outcome, ip})
    AuditFn->>AuditFn: SHA-256 hash IP address
    AuditFn->>DB: INSERT audit_events\n(never throws — errors swallowed)
    Note over AuditFn,DB: Audit failure never breaks\nthe main request
```

### Audited actions

| Action | Triggered by |
|--------|-------------|
| `login` | POST /auth/login (success or failure) |
| `register` | POST /auth/register |
| `list_patients` | GET /patients |
| `view_patient` | GET /patients/:id |
| `view_own_record` | GET /patients/me |
| `view_vitals` | GET /vitals/patient/:id |
| `record_vitals` | POST /vitals |
| `list_consultations` | GET /consultations |
| `view_consultation` | GET /consultations/:id |
| `create_consultation` | POST /consultations |
| `update_consultation` | PATCH /consultations/:id |
| `create_prescription` | POST /consultations/:id/prescriptions |
| `view_admin_stats` | GET /admin/stats |

---

## 10. Compliance Alignment

```mermaid
graph LR
    subgraph RA10173["RA 10173 — Data Privacy Act"]
        C1[Explicit consent on\nregistration step 2]
        C2[Consent rows stored\nimmutably with version]
        C3[Audit log: who accessed\nwhat data and when]
        C4[Breach path:\nGuardDuty → DPO alert\n→ NPC 72h notification]
    end

    subgraph DOH["DOH Telemedicine Guidelines"]
        D1[Teleconsult type\nrecorded per consultation]
        D2[Emergency disclaimer\npresent in booking + room UI]
        D3[Practitioner PRC license\ndisplayed and verified flag]
    end

    subgraph RA6675["RA 6675 — Generics Act"]
        G1[drug_generic_name field\nrequired on all prescriptions]
        G2[Backend enforces 400 error\nif generic name missing]
    end

    subgraph PhilHealth["PhilHealth"]
        PH1[PhilHealth number\ncollected at registration]
        PH2[Stored as SPI\nproduction: encrypted]
        PH3[Phase 2: eClaims\nAPI integration]
    end

    RA10173 --- DOH
    DOH --- RA6675
    RA6675 --- PhilHealth
```

---

## 11. Local Setup Guide

### Prerequisites
- Docker Desktop (or Docker Engine + Compose plugin)
- Ubuntu 20.04+ / any Linux with Docker
- Ports 3000, 4000, 5432 free

### First run

```bash
# 1. Unzip the project
unzip rcc-demo.zip && cd rcc-demo

# 2. Start all containers (builds on first run ~2-3 min)
docker compose up --build

# 3. Open browser
open http://localhost:3000
```

### Demo accounts

| Role | Email | Password |
|------|-------|----------|
| Patient | patient@demo.rcc | Demo1234! |
| CHW | chw@demo.rcc | Demo1234! |
| Clinician | doctor@demo.rcc | Demo1234! |
| Admin | admin@demo.rcc | Demo1234! |

### Useful commands

```bash
# View logs
docker logs rcc_backend -f
docker logs rcc_frontend -f
docker logs rcc_db -f

# Connect directly to database
docker exec -it rcc_db psql -U rcc_user -d rcc_demo

# Query audit log
docker exec rcc_db psql -U rcc_user -d rcc_demo \
  -c "SELECT action, actor_role, outcome, occurred_at FROM audit_events ORDER BY occurred_at DESC LIMIT 20;"

# Hot-patch a backend file without full rebuild
docker cp backend/src/routes/consultations.js rcc_backend:/app/src/routes/consultations.js
docker restart rcc_backend

# Wipe database and reseed
docker compose down -v && docker compose up --build

# Stop all containers
docker compose down
```

---

## 12. Production Readiness Checklist

```mermaid
graph TD
    subgraph Done["✅ Done in MVP demo"]
        D1[JWT auth + RBAC]
        D2[bcrypt password hashing]
        D3[Role-scoped API access]
        D4[Append-only audit log]
        D5[Input validation\nvitals range checks]
        D6[RA 6675 generic drug enforcement]
        D7[RA 10173 consent collection]
        D8[Offline vitals queue]
        D9[Containerised deployment]
    end

    subgraph Phase2["🔲 Required before production"]
        P1[HTTPS / TLS 1.3\nACM + ALB on AWS]
        P2[MFA — OTP via Globe/Smart SMS\nAWS Cognito or equivalent]
        P3[AES-256 column encryption\nfor all SPI fields]
        P4[JWT expiry 15 min\n+ refresh token rotation]
        P5[AWS deployment\nap-southeast-1 Singapore]
        P6[CloudTrail + GuardDuty\nimmutable cloud audit]
        P7[PRC license API\nverification for clinicians]
        P8[PhilSys + PhilHealth\neClaims integration]
        P9[Certificate pinning\non mobile clients]
        P10[NPC registration\nas Personal Info Controller]
        P11[Data Protection Officer\nappointed + workflow]
        P12[Penetration testing\nOWASP Mobile Top 10]
    end

    Done -. "upgrade path" .-> Phase2
```

---

*This document covers the MVP demo implementation only. For the production AWS architecture, refer to `RuraCareConnect_HLD.pdf`.*
