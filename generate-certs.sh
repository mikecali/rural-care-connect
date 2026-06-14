#!/bin/bash
# generate-certs.sh
# Generates a self-signed TLS certificate valid for the server IP.
# Run this ONCE before docker compose up.
# Usage: ./generate-certs.sh [server-ip]
# Example: ./generate-certs.sh 192.168.68.119

SERVER_IP="${1:-192.168.68.119}"
CERT_DIR="./nginx/certs"

echo "🔐 Generating self-signed TLS certificate for IP: $SERVER_IP"
echo "   (Browser will show a security warning — click 'Advanced > Proceed' for demo use)"

mkdir -p "$CERT_DIR"

# Generate private key + self-signed cert valid for 825 days
# SubjectAltName with IP is required — modern browsers reject CN-only certs
openssl req -x509 -nodes -newkey rsa:2048 \
  -keyout "$CERT_DIR/server.key" \
  -out    "$CERT_DIR/server.crt" \
  -days   825 \
  -subj   "/C=PH/ST=Palawan/L=El Nido/O=RuralCareConnect Demo/CN=$SERVER_IP" \
  -addext "subjectAltName=IP:$SERVER_IP,IP:127.0.0.1"

echo ""
echo "✅ Certificate generated:"
echo "   $CERT_DIR/server.crt"
echo "   $CERT_DIR/server.key"
echo ""
echo "📋 Certificate details:"
openssl x509 -in "$CERT_DIR/server.crt" -noout -subject -dates -ext subjectAltName
echo ""
echo "🚀 Now run: docker compose up --build"
echo "   Access at: https://$SERVER_IP:3443"
