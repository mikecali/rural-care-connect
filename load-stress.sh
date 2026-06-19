#!/bin/bash
# load-test.sh — Generates realistic traffic across all RCC user roles
# with random errors mixed in
# Usage: ./load-test.sh [rounds] [server]

export PATH="/usr/bin:/bin:/usr/local/bin:$PATH"
CURL=/usr/bin/curl

SERVER="${2:-https://192.168.68.119:3443}"
ROUNDS="${1:-10}"

echo "═══════════════════════════════════════════════"
echo "  RCC Load Generator — $ROUNDS rounds"
echo "  Server: $SERVER"
echo "═══════════════════════════════════════════════"
echo ""

# ── Login helper ──────────────────────────────────────────────────────
login() {
  $CURL -sk -X POST "$SERVER/api/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$1\",\"password\":\"Demo1234!\"}" \
    | grep -o '"token":"[^"]*' | cut -d'"' -f4
}

# ── Get tokens ────────────────────────────────────────────────────────
echo "🔑 Logging in all users..."
TOKEN_PATIENT=$(login "patient@demo.rcc")
TOKEN_CHW=$(login "chw@demo.rcc")
TOKEN_CLINICIAN=$(login "doctor@demo.rcc")
TOKEN_ADMIN=$(login "admin@demo.rcc")

echo "   Patient:   ${TOKEN_PATIENT:0:15}..."
echo "   CHW:       ${TOKEN_CHW:0:15}..."
echo "   Clinician: ${TOKEN_CLINICIAN:0:15}..."
echo "   Admin:     ${TOKEN_ADMIN:0:15}..."
echo ""

# ── Get patient IDs ───────────────────────────────────────────────────
PATIENTS=$($CURL -sk -H "Authorization: Bearer $TOKEN_CHW" "$SERVER/api/patients")
P1=$(echo "$PATIENTS" | grep -o '"id":"[^"]*' | sed -n '1p' | cut -d'"' -f4)
P2=$(echo "$PATIENTS" | grep -o '"id":"[^"]*' | sed -n '2p' | cut -d'"' -f4)
P3=$(echo "$PATIENTS" | grep -o '"id":"[^"]*' | sed -n '3p' | cut -d'"' -f4)
echo "📋 Patients: ${P1:0:8}... ${P2:0:8}... ${P3:0:8}..."
echo ""

TOTAL=0
ERRORS=0

# ── Request helper ────────────────────────────────────────────────────
hit() {
  local LABEL="$1"
  local TOKEN="$2"
  local METHOD="$3"
  local PATH="$4"
  local BODY="$5"

  local STATUS
  if [ "$METHOD" = "POST" ] && [ -n "$BODY" ]; then
    STATUS=$($CURL -sk -o /dev/null -w "%{http_code}" \
      -X POST "$SERVER$PATH" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d "$BODY")
  elif [ "$METHOD" = "PATCH" ] && [ -n "$BODY" ]; then
    STATUS=$($CURL -sk -o /dev/null -w "%{http_code}" \
      -X PATCH "$SERVER$PATH" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d "$BODY")
  else
    STATUS=$($CURL -sk -o /dev/null -w "%{http_code}" \
      -H "Authorization: Bearer $TOKEN" \
      "$SERVER$PATH")
  fi

  TOTAL=$((TOTAL + 1))
  if [[ "$STATUS" == "2"* ]]; then
    echo "  ✅ [$STATUS] $LABEL"
  elif [[ "$STATUS" == "4"* ]]; then
    echo "  ⚠️  [$STATUS] $LABEL"
    ERRORS=$((ERRORS + 1))
  else
    echo "  ❌ [$STATUS] $LABEL"
    ERRORS=$((ERRORS + 1))
  fi
}

# ── Random error injection ────────────────────────────────────────────
# Returns 0 (true) with given probability out of 10
# Usage: maybe 3  → ~30% chance
maybe() { (( RANDOM % 10 < $1 )); }

# Fake/expired token
BAD_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJoYWNrZXIiLCJpYXQiOjB9.invalidsignature"

# Fake patient IDs
FAKE_IDS=(
  "00000000-0000-0000-0000-000000000000"
  "ffffffff-ffff-ffff-ffff-ffffffffffff"
  "deadbeef-dead-beef-dead-beefdeadbeef"
  "12345678-1234-1234-1234-123456789abc"
)

random_fake_id() {
  echo "${FAKE_IDS[$((RANDOM % ${#FAKE_IDS[@]}))]}"
}

inject_errors() {
  local round=$1
  echo "💥 Error injection:"

  # ── 401: Bad credentials ──────────────────────────────────────────
  if maybe 7; then
    local bad_emails=("hacker@evil.com" "admin@hack.io" "root@localhost" "test@test.com" "' OR 1=1--@x.com")
    local bad_email="${bad_emails[$((RANDOM % ${#bad_emails[@]}))]}"
    $CURL -sk -o /dev/null -X POST "$SERVER/api/auth/login" \
      -H "Content-Type: application/json" \
      -d "{\"email\":\"$bad_email\",\"password\":\"wrongpassword123\"}"
    echo "  ⚠️  [401] Failed login — $bad_email"
    TOTAL=$((TOTAL + 1)); ERRORS=$((ERRORS + 1))
  fi

  # ── 401: Expired/invalid token ────────────────────────────────────
  if maybe 5; then
    $CURL -sk -o /dev/null -w "%{http_code}" \
      -H "Authorization: Bearer $BAD_TOKEN" \
      "$SERVER/api/patients" > /dev/null
    echo "  ⚠️  [401] Invalid token on /api/patients"
    TOTAL=$((TOTAL + 1)); ERRORS=$((ERRORS + 1))
  fi

  # ── 401: No token at all ──────────────────────────────────────────
  if maybe 3; then
    $CURL -sk -o /dev/null "$SERVER/api/admin/stats" > /dev/null
    echo "  ⚠️  [401] No auth header on /api/admin/stats"
    TOTAL=$((TOTAL + 1)); ERRORS=$((ERRORS + 1))
  fi

  # ── 403: Role violation (patient accessing admin) ─────────────────
  if maybe 5; then
    $CURL -sk -o /dev/null \
      -H "Authorization: Bearer $TOKEN_PATIENT" \
      "$SERVER/api/admin/stats" > /dev/null
    echo "  ⚠️  [403] Patient → /api/admin/stats (forbidden)"
    TOTAL=$((TOTAL + 1)); ERRORS=$((ERRORS + 1))
  fi

  # ── 403: CHW accessing clinician-only endpoint ────────────────────
  if maybe 4; then
    $CURL -sk -o /dev/null \
      -H "Authorization: Bearer $TOKEN_CHW" \
      "$SERVER/api/admin/audit" > /dev/null
    echo "  ⚠️  [403] CHW → /api/admin/audit (forbidden)"
    TOTAL=$((TOTAL + 1)); ERRORS=$((ERRORS + 1))
  fi

  # ── 404: Non-existent patient ─────────────────────────────────────
  if maybe 6; then
    local fake_id=$(random_fake_id)
    $CURL -sk -o /dev/null \
      -H "Authorization: Bearer $TOKEN_CLINICIAN" \
      "$SERVER/api/patients/$fake_id" > /dev/null
    echo "  ⚠️  [404] Patient not found — $fake_id"
    TOTAL=$((TOTAL + 1)); ERRORS=$((ERRORS + 1))
  fi

  # ── 404: Non-existent vitals ──────────────────────────────────────
  if maybe 4; then
    local fake_id=$(random_fake_id)
    $CURL -sk -o /dev/null \
      -H "Authorization: Bearer $TOKEN_CHW" \
      "$SERVER/api/vitals/patient/$fake_id" > /dev/null
    echo "  ⚠️  [404] Vitals not found — $fake_id"
    TOTAL=$((TOTAL + 1)); ERRORS=$((ERRORS + 1))
  fi

  # ── 400: Malformed vitals (out of range) ──────────────────────────
  if maybe 5 && [ -n "$P1" ]; then
    local bad_vitals=(
      "{\"patientId\":\"$P1\",\"systolicBp\":999,\"diastolicBp\":999}"
      "{\"patientId\":\"$P1\",\"systolicBp\":-10,\"diastolicBp\":-5}"
      "{\"patientId\":\"$P1\",\"bloodGlucose\":9999}"
      "{\"patientId\":\"$P1\",\"weightKg\":0}"
    )
    local bv="${bad_vitals[$((RANDOM % ${#bad_vitals[@]}))]}"
    $CURL -sk -o /dev/null -X POST "$SERVER/api/vitals" \
      -H "Authorization: Bearer $TOKEN_CHW" \
      -H "Content-Type: application/json" \
      -d "$bv" > /dev/null
    echo "  ⚠️  [400] Invalid vitals payload"
    TOTAL=$((TOTAL + 1)); ERRORS=$((ERRORS + 1))
  fi

  # ── 400: Missing required fields ──────────────────────────────────
  if maybe 4; then
    local bad_bodies=(
      "{}"
      "{\"email\":\"\"}"
      "{\"patientId\":null}"
      "{\"systolicBp\":\"not-a-number\"}"
    )
    local bb="${bad_bodies[$((RANDOM % ${#bad_bodies[@]}))]}"
    $CURL -sk -o /dev/null -X POST "$SERVER/api/vitals" \
      -H "Authorization: Bearer $TOKEN_CHW" \
      -H "Content-Type: application/json" \
      -d "$bb" > /dev/null
    echo "  ⚠️  [400] Missing/malformed fields"
    TOTAL=$((TOTAL + 1)); ERRORS=$((ERRORS + 1))
  fi

  # ── 400: SQL injection attempt ────────────────────────────────────
  if maybe 3; then
    $CURL -sk -o /dev/null \
      -H "Authorization: Bearer $TOKEN_ADMIN" \
      "$SERVER/api/patients?search=%27%20OR%201%3D1%20--" > /dev/null
    echo "  ⚠️  [400] SQLi attempt on search param"
    TOTAL=$((TOTAL + 1)); ERRORS=$((ERRORS + 1))
  fi

  # ── Rate limit burst (rapid fire same endpoint) ───────────────────
  if maybe 3; then
    echo "  🔥 Rate limit burst on /api/patients..."
    for j in $(seq 1 15); do
      $CURL -sk -o /dev/null \
        -H "Authorization: Bearer $TOKEN_CHW" \
        "$SERVER/api/patients" &
    done
    wait
    echo "  ⚠️  [429?] Burst of 15 rapid requests"
    TOTAL=$((TOTAL + 15)); ERRORS=$((ERRORS + 1))
  fi

  # ── Wrong HTTP method ─────────────────────────────────────────────
  if maybe 3; then
    $CURL -sk -o /dev/null -X DELETE \
      -H "Authorization: Bearer $TOKEN_PATIENT" \
      "$SERVER/api/patients" > /dev/null
    echo "  ⚠️  [405] Wrong method DELETE on /api/patients"
    TOTAL=$((TOTAL + 1)); ERRORS=$((ERRORS + 1))
  fi

  # ── Malformed JSON ────────────────────────────────────────────────
  if maybe 3; then
    $CURL -sk -o /dev/null -X POST "$SERVER/api/auth/login" \
      -H "Content-Type: application/json" \
      -d "not json at all {{{" > /dev/null
    echo "  ⚠️  [400] Malformed JSON body"
    TOTAL=$((TOTAL + 1)); ERRORS=$((ERRORS + 1))
  fi
}

# ── Get patient IDs ───────────────────────────────────────────────────
PATIENTS=$($CURL -sk -H "Authorization: Bearer $TOKEN_CHW" "$SERVER/api/patients")
P1=$(echo "$PATIENTS" | grep -o '"id":"[^"]*' | sed -n '1p' | cut -d'"' -f4)
P2=$(echo "$PATIENTS" | grep -o '"id":"[^"]*' | sed -n '2p' | cut -d'"' -f4)
P3=$(echo "$PATIENTS" | grep -o '"id":"[^"]*' | sed -n '3p' | cut -d'"' -f4)

# ── Main loop ─────────────────────────────────────────────────────────
for i in $(seq 1 $ROUNDS); do
  echo "─── Round $i / $ROUNDS ─────────────────────────────"

  # Patient
  echo "👤 Patient:"
  hit "View own record"    "$TOKEN_PATIENT" GET "/api/patients/me"
  hit "View consultations" "$TOKEN_PATIENT" GET "/api/consultations"
  [ -n "$P1" ] && hit "View own vitals" "$TOKEN_PATIENT" GET "/api/vitals/patient/$P1"
  hit "Triage status"      "$TOKEN_PATIENT" GET "/api/triage/status"

  # CHW
  echo "🏘️ CHW:"
  hit "List patients"      "$TOKEN_CHW" GET "/api/patients"
  hit "Search patients"    "$TOKEN_CHW" GET "/api/patients?search=Maria"
  [ -n "$P1" ] && hit "Vitals P1" "$TOKEN_CHW" GET "/api/vitals/patient/$P1"
  [ -n "$P2" ] && hit "Vitals P2" "$TOKEN_CHW" GET "/api/vitals/patient/$P2"
  [ -n "$P3" ] && hit "Patient 3" "$TOKEN_CHW" GET "/api/patients/$P3"

  # Record vitals with random values
  if [ -n "$P1" ]; then
    SBP=$((130 + RANDOM % 40))
    DBP=$((80 + RANDOM % 20))
    GLU=$(echo "scale=1; $((60 + RANDOM % 60)) / 10" | bc)
    WT=$(echo "scale=1; $((550 + RANDOM % 200)) / 10" | bc)
    hit "Record vitals P1" "$TOKEN_CHW" POST "/api/vitals" \
      "{\"patientId\":\"$P1\",\"systolicBp\":$SBP,\"diastolicBp\":$DBP,\"bloodGlucose\":$GLU,\"weightKg\":$WT,\"notes\":\"Load test round $i\"}"
  fi
  if [ -n "$P2" ]; then
    SBP=$((120 + RANDOM % 60))
    DBP=$((75 + RANDOM % 25))
    hit "Record vitals P2" "$TOKEN_CHW" POST "/api/vitals" \
      "{\"patientId\":\"$P2\",\"systolicBp\":$SBP,\"diastolicBp\":$DBP,\"notes\":\"Load test round $i\"}"
  fi

  # Clinician
  echo "🩺 Clinician:"
  hit "List consultations" "$TOKEN_CLINICIAN" GET "/api/consultations"
  hit "List patients"      "$TOKEN_CLINICIAN" GET "/api/patients"
  [ -n "$P1" ] && hit "Patient vitals" "$TOKEN_CLINICIAN" GET "/api/vitals/patient/$P1"

  # Admin
  echo "⚙️  Admin:"
  hit "Dashboard stats"    "$TOKEN_ADMIN" GET "/api/admin/stats"
  hit "Audit log"          "$TOKEN_ADMIN" GET "/api/admin/audit?limit=50"
  hit "Patient list"       "$TOKEN_ADMIN" GET "/api/admin/patients"
  hit "Activity feed"      "$TOKEN_ADMIN" GET "/api/admin/activity?hours=1"
  hit "Security report"    "$TOKEN_ADMIN" GET "/api/admin/security"

  # ── Random error injection ────────────────────────────────────────
  inject_errors "$i"

  sleep 1
  echo ""
done

echo "═══════════════════════════════════════════════"
echo "✅ Done — $TOTAL requests, $ERRORS errors"
echo "📊 Check: Observability → APM → RCC-care-connect"
