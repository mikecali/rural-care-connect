#!/bin/bash
set -e

echo "🚀 Starting Ollama server..."
ollama serve &
SERVER_PID=$!

echo "⏳ Waiting for Ollama API to be ready..."
for i in $(seq 1 60); do
  if curl -sf http://localhost:11434/ > /dev/null 2>&1; then
    echo "✅ Ollama server ready (attempt $i)"
    break
  fi
  sleep 2
done

MODEL="llama3.2:3b"
echo "🔍 Checking if $MODEL is already downloaded..."

if ollama list 2>/dev/null | grep -q "llama3.2"; then
  echo "✅ Model $MODEL already present — skipping pull"
else
  echo "📥 Pulling $MODEL (~2GB — first run only)..."
  ollama pull "$MODEL"
  echo "✅ Model $MODEL ready"
fi

echo "🏥 Ollama AI service fully ready"
wait $SERVER_PID
