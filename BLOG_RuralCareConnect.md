# What I Built on a Weekend — and Why It Matters More Than Any Enterprise AI Demo

**By Mike Calizo** · Principal Customer Architect, Elastic (APJ) · Canberra, Australia

---

I've spent the last several years helping large enterprises figure out how to use AI responsibly. Fortune 500 companies. Big budgets. Teams of data scientists. Lots of Powerpoint.

But the AI project that made me feel something was a side project I built in a few days — a telehealth app for elderly diabetic and hypertensive patients in Aklan.

Not for a customer. Not for a conference demo. For real people, in a real GIDA (Geographically Isolated and Disadvantaged Area), who struggle to access a doctor because they live on an island.

This is what I learned.

---

## The Problem Nobody Builds For

The Rural Care Connect project started with a simple observation: elderly patients in Aklan — most of them 60 or older, living with Type 2 Diabetes and hypertension — often don't see a doctor until something goes seriously wrong.

The barriers are obvious once you're looking: distance, transport costs, no connectivity, health literacy gaps, and a shortage of specialists. The barangay health workers (BHWs) do incredible work, but they're running manual processes — paper records, verbal handoffs, no systematic way to get patient data to a clinician before a consultation.

The project goal was straightforward: build a hybrid care model that combines in-person BHW visits with telehealth, and make it actually work for the people it serves — not just for the clinicians.

---

## The Core Insight: Constraints Make Better Architecture

Here's something enterprise AI projects rarely teach you — **constrained environments force better decisions.**

When I started building this, I had a 12GB RAM Ubuntu server, a Docker socket, and a clear mission. No cloud budget to burn through. No managed ML services to hide behind. That constraint forced every architectural decision to be justified.

The tech stack I landed on:

- **React + Vite** for the frontend — fast to build, works in a browser, no native app deployment friction
- **Node.js + Express** for the API — lightweight, the team can read it
- **PostgreSQL** for the database — boring, reliable, the right call
- **Ollama running llama3.2:3b** for the AI triage — 1.87GB model, runs on CPU, no GPU required
- **Docker Compose** tying it all together — one command to start, one command to stop

The whole thing — database, backend, frontend, AI model — runs on a machine with 12GB RAM. That's a requirement, not a compromise. If the infrastructure breaks down in Aklan, a local team needs to be able to run this on whatever hardware is available.

---

## Practical Breakdown

### 1. The AI triage is a conversation, not a form

My first instinct was to build a symptom checker — patient fills a form, AI returns a risk score. That's the wrong model for this population.

Elderly patients with low health literacy don't interact well with forms. They talk. So I built a conversational pre-screening interview instead — a 9-step structured chat that mirrors what a good BHW actually does when they visit a patient at home.

The system prompt I used is worth examining. It's not a generic "you are a medical assistant" prompt. It's specific:

> *"You are a medical pre-screening assistant for the Rural Care Connect Project, serving elderly patients (aged 60 and above) with Type 2 Diabetes Mellitus (T2DM) and/or Hypertension in Aklan, Philippines."*

It defines the population. The geography. The conditions. The literacy level. It tells the model to ask one question at a time. It specifies the exact emergency referral wording in both Filipino and English. It includes the actual phone number for the nearest community hospital.

Specificity in a system prompt isn't optional — it's the product.

### 2. Emergency detection never goes through the AI

This is a non-negotiable design decision I'll defend to anyone.

The AI triage model is `llama3.2:3b` running on CPU. On my test hardware, it processes about 5 tokens per second. A first message takes 15–25 seconds to get a response. That's fine for a pre-screening interview. It is categorically not fine if a patient types "sakit sa dibdib" (chest pain) and waits 20 seconds for a response.

So emergency detection is a hardcoded keyword check — 30+ phrases in English and Filipino — that runs *before* the AI ever sees the message. If any keyword matches, the patient gets an instant response with real phone numbers. The AI is bypassed entirely.

```
sakit sa dibdib → instant: "Call your nearest Aklan hospital or emergency services"
hirap huminga   → instant: same response
chest pain      → instant: same response
```

No model inference. No token budget. No latency. Safety first, always.

This is a pattern I'd apply to any AI system operating in a health context: **separate the safety path from the intelligence path.** They have different latency requirements and different failure modes.

### 3. Offline-first isn't a feature — it's a prerequisite

Aklan's rural connectivity is intermittent. A BHW doing home visits in remote barangays might have zero signal for hours.

The vitals entry flow works offline by design. When a CHW records a patient's blood pressure and glucose without network access, the data goes into a local queue (localStorage in the browser, SQLite in a native app). A badge shows the pending count. When connectivity returns, the queue syncs automatically.

Every queued record carries a client-generated UUID as an idempotency key. If the sync request fires twice — because connectivity dropped mid-upload — the server accepts the first and silently rejects the duplicate. No data duplication. No error shown to the CHW.

This is boring engineering. It's also the difference between a demo and something a BHW can actually use in the field.

### 4. Compliance is architecture, not an afterthought

The Philippines has the Data Privacy Act (RA 10173) — a GDPR equivalent that treats health data as Sensitive Personal Information (SPI). It has the Generics Act (RA 6675) requiring generic drug names on prescriptions. DOH has telemedicine guidelines. PhilHealth has its own integration requirements.

I built these into the data model from day one:

- Every SPI field in the database schema is annotated with a `[SPI]` comment
- Prescription creation returns a 400 error if generic name is missing — RA 6675 enforced at the API layer
- Patient registration collects explicit, layered consent — terms, data privacy, and an optional research consent — stored as separate database rows with the consent text version and timestamp
- The audit log is append-only at the database permission level — the application role has INSERT only, no UPDATE or DELETE

The emergency disclaimer appears on every AI triage screen and booking modal. Not as fine print. As a visible, bilingual warning.

Compliance-as-architecture means you don't add it at the end. You design around it from the first migration file.

---

## The Human Angle

I'm Filipino Australian. My parents' generation are exactly the patients this app is designed for — elderly, provincial, managing chronic conditions with limited access to specialist care.

When I was building the CHW vitals entry screen, I kept thinking about the BHWs I've met through FAHPi (Filipino Australian Health Professionals Inc.) and their stories about community health work in remote areas. These are not highly paid professionals. They're community members doing critical work with minimal tools.

The "Digital Buddy" concept in the model — pairing elderly patients with tech-trained volunteers or family members — isn't an accessibility feature. It's an acknowledgment that digital exclusion is real, and that technology serving this population has to account for it. An app that only works if the elderly patient is digitally literate will fail them.

Building for the margins makes better products. This is true in enterprise tech too — designing for the user with the most constraints usually improves the experience for everyone.

---

## What I'd Do Differently in Production

This is an MVP. A functional, demo-ready, genuinely useful MVP — but an MVP.

In production, I'd add:

- **AWS Cognito** for MFA — SMS OTP via Globe/Smart is non-negotiable for a health app
- **AES-256 column-level encryption** on all SPI fields — the annotations are there, the encryption layer isn't
- **TLS 1.3 everywhere** — the current demo runs HTTP, acceptable locally, unacceptable in production
- **Meditron-7B or a fine-tuned clinical model** when better hardware is available — llama3.2:3b is capable but it's a general model, not a medical one
- **Elastic Stack for observability** — naturally — APM for the API, log analytics for audit events, alerting on failed auth spikes, data export anomalies, or off-hours access patterns that might indicate a breach
- **GuardDuty + CloudTrail** on AWS for the immutable audit trail and 72-hour breach notification pipeline required by RA 10173

The NPC registration (National Privacy Commission) needs to happen before any real patient data touches the system. That's a process step, not a technical one — but it has a 4–8 week lead time. Start it on day one.

---

## Closing Thought

Enterprise AI is full of impressive demos. High-quality embeddings. Beautiful RAG pipelines. Thoughtful evaluation frameworks. I work with this stuff every day and I think it's genuinely interesting.

But the most useful AI I've shipped recently runs on a 12GB RAM Ubuntu box, speaks Filipino, and asks elderly patients in rural Aklan whether they've been taking their blood pressure medication.

The technology isn't magic. The model is 1.87GB. The codebase is four Docker containers. The insight is just this: **AI that serves people who are usually left out of the conversation is worth more than AI that impresses people who are already well-served.**

If you're working on something similar — community health tech, underserved populations, ASEAN digital health — I'd love to compare notes. Find me on LinkedIn or through the Filipino Tech Community Canberra.

---

*The full source code for Rural Care Connect is available on request. The system is built on Docker, Node.js, React, PostgreSQL, and Ollama — all open source. If you're part of a community health program in the Philippines and want to discuss adapting this for your context, reach out directly.*

---

**Mike Calizo** is a Principal Customer Architect at Elastic (APJ), based in Canberra, Australia. He is a co-founder of the Filipino Tech Community Canberra and a member of FAHPi (Filipino Australian Health Professionals Inc.). He writes and speaks on observability, AI in production, and building inclusive tech communities.

*Views expressed are his own.*
