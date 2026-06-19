#!/bin/bash
# load-test.sh — Generates realistic traffic across all RCC user roles
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
  curl -sk -X POST "$SERVER/api/auth/login" \
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
PATIENTS=$(curl -sk -H "Authorization: Bearer $TOKEN_CHW" "$SERVER/api/patients")
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
    STATUS=$(curl -sk -o /dev/null -w "%{http_code}" \
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

  # Simulate failed login every 3 rounds
  if (( i % 3 == 0 )); then
    $CURL -sk -o /dev/null -X POST "$SERVER/api/auth/login" \
      -H "Content-Type: application/json" \
      -d '{"email":"hacker@test.com","password":"wrongpassword"}'
    echo "  ⚠️  [401] Failed login (intentional)"
  fi

  sleep 1
  echo ""
done

echo "═══════════════════════════════════════════════"
echo "✅ Done — $TOTAL requests, $ERRORS errors"
echo "📊 Check: Observability → APM → RCC-care-connect"
echo "═══════════════════════════════════════════════"
